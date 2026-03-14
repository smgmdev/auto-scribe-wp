"""Momentum entry strategy — EMA crossover + RSI confirmation."""

import numpy as np
import pandas as pd
from typing import Dict
from logger_setup import get_logger
import config

log = get_logger("strategy")


def compute_ema(prices, period):
    # type: (np.ndarray, int) -> np.ndarray
    return pd.Series(prices).ewm(span=period, adjust=False).mean().values


def compute_rsi(prices, period=14):
    # type: (np.ndarray, int) -> float
    if len(prices) < period + 1:
        return 50.0
    deltas = np.diff(prices)
    gains = np.where(deltas > 0, deltas, 0)
    losses = np.where(deltas < 0, -deltas, 0)
    avg_gain = pd.Series(gains).ewm(span=period, adjust=False).mean().values[-1]
    avg_loss = pd.Series(losses).ewm(span=period, adjust=False).mean().values[-1]
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return 100.0 - (100.0 / (1.0 + rs))


def analyze(candles):
    # type: (list) -> Dict
    """
    Analyze candles for momentum entry signal.

    Returns:
        {"signal": "BUY"|"SELL"|"HOLD", "reason": str, "price": float, "atr": float}
    """
    if len(candles) < config.EMA_SLOW + 10:
        return {"signal": "HOLD", "reason": "Insufficient data"}

    closes = np.array([c["close"] for c in candles])
    highs = np.array([c["high"] for c in candles])
    lows = np.array([c["low"] for c in candles])

    price = closes[-1]

    # EMAs
    ema_fast = compute_ema(closes, config.EMA_FAST)
    ema_slow = compute_ema(closes, config.EMA_SLOW)

    # ATR for position sizing
    tr = np.maximum(
        highs[1:] - lows[1:],
        np.maximum(
            np.abs(highs[1:] - closes[:-1]),
            np.abs(lows[1:] - closes[:-1])
        )
    )
    atr = float(pd.Series(tr).rolling(14).mean().values[-1])
    if np.isnan(atr):
        atr = float(price * 0.01)

    # RSI
    rsi = compute_rsi(closes, config.RSI_PERIOD)

    fast_now = ema_fast[-1]
    fast_prev = ema_fast[-2]
    slow_now = ema_slow[-1]
    slow_prev = ema_slow[-2]

    result = {
        "signal": "HOLD",
        "reason": "",
        "price": round(price, 4),
        "atr": round(atr, 4),
        "rsi": round(rsi, 2),
        "ema_fast": round(fast_now, 4),
        "ema_slow": round(slow_now, 4),
    }

    # ── BUY: EMA cross up + RSI not overbought ──
    if fast_prev <= slow_prev and fast_now > slow_now:
        if rsi < 75:
            result["signal"] = "BUY"
            result["reason"] = f"EMA cross UP (RSI={rsi:.0f})"
            return result

    # ── SELL: EMA cross down + RSI not oversold ──
    if fast_prev >= slow_prev and fast_now < slow_now:
        if rsi > 25:
            result["signal"] = "SELL"
            result["reason"] = f"EMA cross DOWN (RSI={rsi:.0f})"
            return result

    # ── Strong trend + momentum ──
    if fast_now > slow_now and price > fast_now and rsi > 55 and rsi < 80:
        # Check momentum: last 3 closes rising
        if closes[-1] > closes[-2] > closes[-3]:
            result["signal"] = "BUY"
            result["reason"] = f"Uptrend momentum (RSI={rsi:.0f})"
            return result

    if fast_now < slow_now and price < fast_now and rsi < 45 and rsi > 20:
        if closes[-1] < closes[-2] < closes[-3]:
            result["signal"] = "SELL"
            result["reason"] = f"Downtrend momentum (RSI={rsi:.0f})"
            return result

    result["reason"] = f"No signal (RSI={rsi:.0f})"
    return result
