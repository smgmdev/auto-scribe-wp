"""
Trend-following strategy with tick-level momentum detection.
Combines candle-based EMA crossover with real-time tick momentum.
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


def analyze(prices_data: dict) -> dict:
    """
    Candle-based analysis — EMA crossover for trend direction.
    Called every 60s, provides trend bias for tick-level decisions.
    """
    candles = prices_data.get("prices", [])
    if len(candles) < config.EMA_TREND + 5:
        return {"signal": Signal.HOLD, "reason": "Insufficient data"}

    closes = np.array([(c["closePrice"]["bid"] + c["closePrice"]["ask"]) / 2 for c in candles])
    highs = np.array([(c["highPrice"]["bid"] + c["highPrice"]["ask"]) / 2 for c in candles])
    lows = np.array([(c["lowPrice"]["bid"] + c["lowPrice"]["ask"]) / 2 for c in candles])

    ema_fast = compute_ema(closes, config.EMA_FAST)
    ema_slow = compute_ema(closes, config.EMA_SLOW)
    ema_trend = compute_ema(closes, config.EMA_TREND)
    atr = compute_atr(highs, lows, closes, config.ATR_PERIOD)

    current_price = closes[-1]
    current_atr = atr[-1]

    if np.isnan(current_atr) or current_atr == 0:
        return {"signal": Signal.HOLD, "reason": "ATR not available"}

    fast_now, fast_prev = ema_fast[-1], ema_fast[-2]
    slow_now, slow_prev = ema_slow[-1], ema_slow[-2]
    trend_now = ema_trend[-1]

    result = {
        "price": round(current_price, 5),
        "atr": round(current_atr, 5),
        "stop_distance": round(current_atr * config.ATR_SL_MULTIPLIER, 5),
        "profit_distance": round(current_atr * config.ATR_TP_MULTIPLIER, 5),
        "ema_fast": round(fast_now, 5),
        "ema_slow": round(slow_now, 5),
        "ema_trend": round(trend_now, 5),
    }

    if fast_prev <= slow_prev and fast_now > slow_now and current_price > trend_now:
        result["signal"] = Signal.BUY
        result["reason"] = f"EMA({config.EMA_FAST}) crossed above EMA({config.EMA_SLOW})"
        return result

    if fast_prev >= slow_prev and fast_now < slow_now and current_price < trend_now:
        result["signal"] = Signal.SELL
        result["reason"] = f"EMA({config.EMA_FAST}) crossed below EMA({config.EMA_SLOW})"
        return result

    # Also signal if strong trend alignment (no crossover needed)
    if fast_now > slow_now > trend_now and current_price > fast_now:
        result["signal"] = Signal.BUY
        result["reason"] = "Strong uptrend alignment"
        return result

    if fast_now < slow_now < trend_now and current_price < fast_now:
        result["signal"] = Signal.SELL
        result["reason"] = "Strong downtrend alignment"
        return result

    result["signal"] = Signal.HOLD
    result["reason"] = "No trend alignment"
    return result


def tick_momentum(ticks: list[dict]) -> dict:
    """
    Analyze real-time tick data for momentum signals.

    Looks at:
    1. Price velocity (rate of change over last N ticks)
    2. Acceleration (is momentum increasing?)
    3. Tick direction consistency (what % of ticks moved in same direction)
    4. Volume of movement vs spread

    Returns:
        {
            "direction": "UP" | "DOWN" | "FLAT",
            "strength": 0.0 - 1.0,
            "acceleration": float (positive = accelerating, negative = decelerating),
            "velocity": float (price change per second),
        }
    """
    if len(ticks) < 5:
        return {"direction": "FLAT", "strength": 0.0, "acceleration": 0.0, "velocity": 0.0}

    prices = [t["mid"] for t in ticks]
    times = [t["time"] for t in ticks]

    # --- Velocity: price change per second over different windows ---
    windows = [5, 10, 30]  # short, medium, long tick windows
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

    # --- Direction consistency: what % of recent ticks moved same way ---
    recent = prices[-min(20, len(prices)):]
    up_ticks = sum(1 for i in range(1, len(recent)) if recent[i] > recent[i-1])
    down_ticks = sum(1 for i in range(1, len(recent)) if recent[i] < recent[i-1])
    total_moves = up_ticks + down_ticks

    if total_moves == 0:
        consistency = 0.0
        dominant_dir = "FLAT"
    else:
        up_ratio = up_ticks / total_moves
        down_ratio = down_ticks / total_moves
        consistency = max(up_ratio, down_ratio)
        dominant_dir = "UP" if up_ratio > down_ratio else "DOWN"

    # --- Strength: combine velocity magnitude + consistency ---
    # Normalize velocity by average spread
    avg_spread = sum(t["spread"] for t in ticks[-20:]) / min(20, len(ticks))
    if avg_spread > 0:
        normalized_velocity = abs(avg_velocity) / avg_spread
    else:
        normalized_velocity = 0.0

    # Strength = weighted combo of consistency and normalized velocity
    strength = min(1.0, (consistency * 0.6) + (min(normalized_velocity, 1.0) * 0.4))

    # Override direction to FLAT if strength is negligible
    if strength < 0.3:
        dominant_dir = "FLAT"

    return {
        "direction": dominant_dir,
        "strength": round(strength, 3),
        "acceleration": round(acceleration, 8),
        "velocity": round(avg_velocity, 8),
    }
