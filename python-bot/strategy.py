"""Trend-following strategy using EMA crossover + ATR stops."""

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
    """Compute Exponential Moving Average."""
    series = pd.Series(prices)
    return series.ewm(span=period, adjust=False).mean().values


def compute_atr(highs: np.ndarray, lows: np.ndarray, closes: np.ndarray, period: int) -> np.ndarray:
    """Compute Average True Range."""
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
    Analyze price data and return signal with stop/take-profit distances.

    Returns:
        {
            "signal": "BUY" | "SELL" | "HOLD",
            "atr": float,
            "stop_distance": float,
            "profit_distance": float,
            "ema_fast": float,
            "ema_slow": float,
            "ema_trend": float,
            "price": float,
            "reason": str,
        }
    """
    candles = prices_data.get("prices", [])
    if len(candles) < config.EMA_TREND + 5:
        return {"signal": Signal.HOLD, "reason": "Insufficient data"}

    # Extract mid prices (average of bid/ask)
    closes = np.array([(c["closePrice"]["bid"] + c["closePrice"]["ask"]) / 2 for c in candles])
    highs = np.array([(c["highPrice"]["bid"] + c["highPrice"]["ask"]) / 2 for c in candles])
    lows = np.array([(c["lowPrice"]["bid"] + c["lowPrice"]["ask"]) / 2 for c in candles])

    # Compute indicators
    ema_fast = compute_ema(closes, config.EMA_FAST)
    ema_slow = compute_ema(closes, config.EMA_SLOW)
    ema_trend = compute_ema(closes, config.EMA_TREND)
    atr = compute_atr(highs, lows, closes, config.ATR_PERIOD)

    current_price = closes[-1]
    current_atr = atr[-1]

    if np.isnan(current_atr) or current_atr == 0:
        return {"signal": Signal.HOLD, "reason": "ATR not available"}

    # Current and previous EMA values
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

    # BUY signal: EMA fast crosses above EMA slow + price above trend EMA
    if fast_prev <= slow_prev and fast_now > slow_now and current_price > trend_now:
        result["signal"] = Signal.BUY
        result["reason"] = f"EMA({config.EMA_FAST}) crossed above EMA({config.EMA_SLOW}), price above EMA({config.EMA_TREND})"
        log.info(f"🟢 BUY signal | {result['reason']}")
        return result

    # SELL signal: EMA fast crosses below EMA slow + price below trend EMA
    if fast_prev >= slow_prev and fast_now < slow_now and current_price < trend_now:
        result["signal"] = Signal.SELL
        result["reason"] = f"EMA({config.EMA_FAST}) crossed below EMA({config.EMA_SLOW}), price below EMA({config.EMA_TREND})"
        log.info(f"🔴 SELL signal | {result['reason']}")
        return result

    result["signal"] = Signal.HOLD
    result["reason"] = "No crossover detected"
    return result
