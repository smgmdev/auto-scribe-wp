"""
Enhanced trend-following strategy with:
- Short-term bearish/bullish momentum detection (RSI + velocity + acceleration)
- Multi-timeframe momentum scoring
- Micro-structure analysis for precise entries
"""

import numpy as np
import pandas as pd
from typing import Optional
from logger_setup import get_logger
import config

log = get_logger("strategy")


class Signal:
    BUY = "BUY"
    SELL = "SELL"
    HOLD = "HOLD"


def compute_ema(prices: np.ndarray, period: int) -> np.ndarray:
    series = pd.Series(prices)
    return series.ewm(span=period, adjust=False).mean().values


def compute_atr(highs: np.ndarray, lows: np.ndarray, closes: np.ndarray, period: int) -> np.ndarray:
    high = pd.Series(highs)
    low = pd.Series(lows)
    close = pd.Series(closes)
    tr1 = high - low
    tr2 = (high - close.shift(1)).abs()
    tr3 = (low - close.shift(1)).abs()
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    return tr.rolling(window=period).mean().values


def compute_rsi(prices: np.ndarray, period: int = 14) -> float:
    """Compute RSI from price array. Returns 0-100 value."""
    if len(prices) < period + 1:
        return 50.0  # neutral
    deltas = np.diff(prices)
    gains = np.where(deltas > 0, deltas, 0)
    losses = np.where(deltas < 0, -deltas, 0)

    avg_gain = pd.Series(gains).ewm(span=period, adjust=False).mean().values[-1]
    avg_loss = pd.Series(losses).ewm(span=period, adjust=False).mean().values[-1]

    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return 100.0 - (100.0 / (1.0 + rs))


def compute_momentum_score(prices: np.ndarray) -> dict:
    """
    Multi-window momentum scoring for short-term trend detection.
    Returns a score from -1.0 (strong bearish) to +1.0 (strong bullish).
    """
    if len(prices) < 20:
        return {"score": 0.0, "bias": "NEUTRAL"}

    scores = []

    # 5-bar rate of change
    roc_5 = (prices[-1] - prices[-5]) / prices[-5] if prices[-5] != 0 else 0
    scores.append(np.clip(roc_5 * 1000, -1, 1))

    # 10-bar rate of change
    if len(prices) >= 10:
        roc_10 = (prices[-1] - prices[-10]) / prices[-10] if prices[-10] != 0 else 0
        scores.append(np.clip(roc_10 * 500, -1, 1))

    # Price vs EMA(5) — micro trend
    ema5 = compute_ema(prices, 5)
    if ema5[-1] != 0:
        dev = (prices[-1] - ema5[-1]) / ema5[-1]
        scores.append(np.clip(dev * 2000, -1, 1))

    # RSI momentum component
    rsi = compute_rsi(prices, 14)
    rsi_score = (rsi - 50) / 50  # -1 to +1
    scores.append(rsi_score)

    # Consecutive direction — last 5 bars
    last5 = prices[-5:]
    ups = sum(1 for i in range(1, len(last5)) if last5[i] > last5[i - 1])
    downs = sum(1 for i in range(1, len(last5)) if last5[i] < last5[i - 1])
    dir_score = (ups - downs) / 4.0  # -1 to +1
    scores.append(dir_score)

    avg_score = sum(scores) / len(scores)

    if avg_score > 0.2:
        bias = "BULLISH"
    elif avg_score < -0.2:
        bias = "BEARISH"
    else:
        bias = "NEUTRAL"

    return {"score": round(avg_score, 4), "bias": bias}


def analyze(prices_data: dict, adaptive_params: dict = None) -> dict:
    """
    Candle-based analysis — EMA crossover + momentum scoring.
    adaptive_params can override defaults from the learning system.
    """
    candles = prices_data.get("prices", [])

    # Use adaptive parameters if provided
    ema_fast = (adaptive_params or {}).get("ema_fast", config.EMA_FAST)
    ema_slow = (adaptive_params or {}).get("ema_slow", config.EMA_SLOW)
    ema_trend = (adaptive_params or {}).get("ema_trend", config.EMA_TREND)

    if len(candles) < ema_trend + 5:
        return {"signal": Signal.HOLD, "reason": "Insufficient data"}

    closes = np.array([(c["closePrice"]["bid"] + c["closePrice"]["ask"]) / 2 for c in candles])
    highs = np.array([(c["highPrice"]["bid"] + c["highPrice"]["ask"]) / 2 for c in candles])
    lows = np.array([(c["lowPrice"]["bid"] + c["lowPrice"]["ask"]) / 2 for c in candles])

    ema_f = compute_ema(closes, ema_fast)
    ema_s = compute_ema(closes, ema_slow)
    ema_t = compute_ema(closes, ema_trend)
    atr = compute_atr(highs, lows, closes, config.ATR_PERIOD)

    current_price = closes[-1]
    current_atr = atr[-1]

    if np.isnan(current_atr) or current_atr == 0:
        return {"signal": Signal.HOLD, "reason": "ATR not available"}

    fast_now, fast_prev = ema_f[-1], ema_f[-2]
    slow_now, slow_prev = ema_s[-1], ema_s[-2]
    trend_now = ema_t[-1]

    # Short-term momentum scoring
    momentum = compute_momentum_score(closes)
    rsi = compute_rsi(closes, 14)

    # Adaptive SL/TP multipliers from learning
    sl_mult = (adaptive_params or {}).get("sl_multiplier", config.ATR_SL_MULTIPLIER)
    tp_mult = (adaptive_params or {}).get("tp_multiplier", config.ATR_TP_MULTIPLIER)

    result = {
        "price": round(current_price, 5),
        "atr": round(current_atr, 5),
        "stop_distance": round(current_atr * sl_mult, 5),
        "profit_distance": round(current_atr * tp_mult, 5),
        "ema_fast": round(fast_now, 5),
        "ema_slow": round(slow_now, 5),
        "ema_trend": round(trend_now, 5),
        "rsi": round(rsi, 2),
        "momentum_score": momentum["score"],
        "momentum_bias": momentum["bias"],
    }

    # --- Signal generation with momentum confirmation ---

    # EMA crossover + momentum agreement
    if fast_prev <= slow_prev and fast_now > slow_now and current_price > trend_now:
        if momentum["bias"] != "BEARISH":  # Don't buy into bearish momentum
            result["signal"] = Signal.BUY
            result["reason"] = f"EMA crossover UP + momentum {momentum['bias']} (RSI={rsi:.0f})"
            return result

    if fast_prev >= slow_prev and fast_now < slow_now and current_price < trend_now:
        if momentum["bias"] != "BULLISH":  # Don't sell into bullish momentum
            result["signal"] = Signal.SELL
            result["reason"] = f"EMA crossover DOWN + momentum {momentum['bias']} (RSI={rsi:.0f})"
            return result

    # Strong trend alignment with momentum confirmation
    if fast_now > slow_now > trend_now and current_price > fast_now:
        if momentum["score"] > 0.3:  # Require bullish momentum
            result["signal"] = Signal.BUY
            result["reason"] = f"Strong uptrend + bullish momentum ({momentum['score']:.2f})"
            return result

    if fast_now < slow_now < trend_now and current_price < fast_now:
        if momentum["score"] < -0.3:  # Require bearish momentum
            result["signal"] = Signal.SELL
            result["reason"] = f"Strong downtrend + bearish momentum ({momentum['score']:.2f})"
            return result

    # Pure momentum signal (short-term breakout)
    if momentum["score"] > 0.6 and rsi > 55 and rsi < 80:
        result["signal"] = Signal.BUY
        result["reason"] = f"Bullish momentum breakout (score={momentum['score']:.2f}, RSI={rsi:.0f})"
        return result

    if momentum["score"] < -0.6 and rsi < 45 and rsi > 20:
        result["signal"] = Signal.SELL
        result["reason"] = f"Bearish momentum breakout (score={momentum['score']:.2f}, RSI={rsi:.0f})"
        return result

    result["signal"] = Signal.HOLD
    result["reason"] = f"No alignment (mom={momentum['score']:.2f}, RSI={rsi:.0f})"
    return result


def tick_momentum(ticks: list[dict]) -> dict:
    """
    Analyze real-time tick data for momentum signals.
    Enhanced with multi-window analysis and micro-RSI.
    """
    if len(ticks) < 5:
        return {"direction": "FLAT", "strength": 0.0, "acceleration": 0.0, "velocity": 0.0, "micro_rsi": 50.0}

    prices = [t["mid"] for t in ticks]
    times = [t["time"] for t in ticks]

    # --- Velocity: price change per second over different windows ---
    windows = [5, 10, 30]
    velocities = []
    for w in windows:
        if len(prices) >= w:
            dp = prices[-1] - prices[-w]
            dt = max(times[-1] - times[-w], 0.001)
            velocities.append(dp / dt)
        else:
            velocities.append(0.0)

    avg_velocity = sum(velocities) / len(velocities) if velocities else 0.0

    # --- Acceleration: is velocity increasing? ---
    if len(prices) >= 20:
        v_recent = (prices[-1] - prices[-5]) / max(times[-1] - times[-5], 0.001)
        v_older = (prices[-10] - prices[-15]) / max(times[-10] - times[-15], 0.001)
        acceleration = v_recent - v_older
    else:
        acceleration = 0.0

    # --- Direction consistency ---
    recent = prices[-min(20, len(prices)):]
    up_ticks = sum(1 for i in range(1, len(recent)) if recent[i] > recent[i - 1])
    down_ticks = sum(1 for i in range(1, len(recent)) if recent[i] < recent[i - 1])
    total_moves = up_ticks + down_ticks

    if total_moves == 0:
        consistency = 0.0
        dominant_dir = "FLAT"
    else:
        up_ratio = up_ticks / total_moves
        down_ratio = down_ticks / total_moves
        consistency = max(up_ratio, down_ratio)
        dominant_dir = "UP" if up_ratio > down_ratio else "DOWN"

    # --- Micro RSI on tick prices ---
    micro_rsi = compute_rsi(np.array(prices[-30:]), min(14, len(prices) - 2)) if len(prices) > 5 else 50.0

    # --- Strength ---
    avg_spread = sum(t["spread"] for t in ticks[-20:]) / min(20, len(ticks))
    if avg_spread > 0:
        normalized_velocity = abs(avg_velocity) / avg_spread
    else:
        normalized_velocity = 0.0

    # RSI extreme adds to strength
    rsi_boost = 0.0
    if micro_rsi > 70 and dominant_dir == "UP":
        rsi_boost = 0.15
    elif micro_rsi < 30 and dominant_dir == "DOWN":
        rsi_boost = 0.15

    strength = min(1.0, (consistency * 0.5) + (min(normalized_velocity, 1.0) * 0.35) + rsi_boost)

    if strength < 0.3:
        dominant_dir = "FLAT"

    return {
        "direction": dominant_dir,
        "strength": round(strength, 3),
        "acceleration": round(acceleration, 8),
        "velocity": round(avg_velocity, 8),
        "micro_rsi": round(micro_rsi, 2),
    }


def compute_support_resistance(highs: np.ndarray, lows: np.ndarray, closes: np.ndarray,
                                lookback: int = 20, num_levels: int = 3,
                                cluster_pct: float = 0.003) -> dict:
    """
    Detect key support and resistance levels from candle data using pivot points
    and price clustering.

    Returns:
        {
            "support": [float, ...],       # sorted ascending (nearest first)
            "resistance": [float, ...],    # sorted ascending (nearest first)
            "nearest_support": float,
            "nearest_resistance": float,
            "sr_quality": float,           # 0-1 how well-defined the levels are
        }
    """
    if len(closes) < lookback:
        price = float(closes[-1]) if len(closes) > 0 else 0
        return {
            "support": [], "resistance": [],
            "nearest_support": 0, "nearest_resistance": 0,
            "sr_quality": 0,
        }

    current_price = float(closes[-1])

    # ── Step 1: Find pivot highs and pivot lows ──
    pivot_highs = []
    pivot_lows = []
    window = 3  # candles on each side

    for i in range(window, len(highs) - window):
        # Pivot high: higher than `window` candles on each side
        if all(highs[i] >= highs[i - j] for j in range(1, window + 1)) and \
           all(highs[i] >= highs[i + j] for j in range(1, window + 1)):
            pivot_highs.append(float(highs[i]))

        # Pivot low: lower than `window` candles on each side
        if all(lows[i] <= lows[i - j] for j in range(1, window + 1)) and \
           all(lows[i] <= lows[i + j] for j in range(1, window + 1)):
            pivot_lows.append(float(lows[i]))

    # ── Step 2: Cluster nearby pivots (within cluster_pct %) ──
    def cluster_levels(levels: list, pct: float) -> list:
        if not levels:
            return []
        levels = sorted(levels)
        clusters = []
        current_cluster = [levels[0]]
        for lv in levels[1:]:
            if abs(lv - current_cluster[-1]) / max(current_cluster[-1], 1e-10) <= pct:
                current_cluster.append(lv)
            else:
                clusters.append(current_cluster)
                current_cluster = [lv]
        clusters.append(current_cluster)

        # Return the mean of each cluster, weighted by cluster size (more touches = stronger)
        result = []
        for cl in clusters:
            result.append({"level": sum(cl) / len(cl), "touches": len(cl)})
        return result

    support_clusters = cluster_levels(pivot_lows, cluster_pct)
    resistance_clusters = cluster_levels(pivot_highs, cluster_pct)

    # ── Step 3: Separate into support (below price) and resistance (above price) ──
    supports = sorted(
        [c for c in support_clusters if c["level"] < current_price],
        key=lambda c: c["level"], reverse=True  # nearest first
    )
    resistances = sorted(
        [c for c in resistance_clusters if c["level"] > current_price],
        key=lambda c: c["level"]  # nearest first
    )

    # Also consider resistance clusters below price as broken-resistance-turned-support
    for c in resistance_clusters:
        if c["level"] < current_price:
            supports.append(c)
    supports = sorted(supports, key=lambda c: c["level"], reverse=True)[:num_levels]

    # And support clusters above price as broken-support-turned-resistance
    for c in support_clusters:
        if c["level"] > current_price:
            resistances.append(c)
    resistances = sorted(resistances, key=lambda c: c["level"])[:num_levels]

    nearest_sup = supports[0]["level"] if supports else 0
    nearest_res = resistances[0]["level"] if resistances else 0

    # Quality: how many touches do the nearest levels have
    sup_touches = supports[0]["touches"] if supports else 0
    res_touches = resistances[0]["touches"] if resistances else 0
    sr_quality = min(1.0, (sup_touches + res_touches) / 6.0)

    return {
        "support": [s["level"] for s in supports],
        "resistance": [r["level"] for r in resistances],
        "nearest_support": round(nearest_sup, 6),
        "nearest_resistance": round(nearest_res, 6),
        "sr_quality": round(sr_quality, 3),
    }