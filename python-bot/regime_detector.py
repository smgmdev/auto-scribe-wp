"""
Market Regime Detector — identifies current market conditions.

Regimes:
- trending_up: Strong uptrend, EMAs aligned bullish, momentum positive
- trending_down: Strong downtrend, EMAs aligned bearish, momentum negative
- ranging: Price oscillating between support/resistance, no clear trend
- volatile: High ATR relative to recent history, sharp moves both ways
- quiet: Low volatility, tight ranges, minimal movement

The bot uses different strategies for different regimes:
- Trending: Follow the trend, wider stops, bigger targets
- Ranging: Mean reversion near S/R, tight stops
- Volatile: Reduce size, wait for clear direction
- Quiet: Skip or scalp with very tight parameters
"""

import numpy as np
from typing import Optional
from logger_setup import get_logger
from strategy import compute_ema, compute_atr, compute_rsi, compute_momentum_score

log = get_logger("regime")


class RegimeDetector:
    """Detects market regime from price data."""

    # Regime constants
    TRENDING_UP = "trending_up"
    TRENDING_DOWN = "trending_down"
    RANGING = "ranging"
    VOLATILE = "volatile"
    QUIET = "quiet"

    def __init__(self, brain=None):
        self.brain = brain
        self._cache: dict[str, dict] = {}  # epic -> {regime, detected_at, data}

    def detect(self, epic: str, closes: np.ndarray, highs: np.ndarray,
               lows: np.ndarray) -> dict:
        """
        Detect the current market regime for an asset.
        Returns: {regime, confidence, trend_strength, volatility_ratio, ema_alignment}
        """
        if len(closes) < 30:
            return {"regime": "unknown", "confidence": 0, "trend_strength": 0,
                    "volatility_ratio": 1.0, "ema_alignment": "mixed"}

        # ── EMAs for trend detection ──
        ema_fast = compute_ema(closes, 9)
        ema_slow = compute_ema(closes, 21)
        ema_trend = compute_ema(closes, min(50, len(closes) - 1))

        ef = ema_fast[-1]
        es = ema_slow[-1]
        et = ema_trend[-1]
        price = closes[-1]

        # EMA alignment
        if ef > es > et and price > ef:
            ema_alignment = "bullish"
        elif ef < es < et and price < ef:
            ema_alignment = "bearish"
        else:
            ema_alignment = "mixed"

        # ── Trend strength: how far apart are EMAs (normalized) ──
        ema_spread = abs(ef - et) / et if et > 0 else 0
        trend_strength = min(1.0, ema_spread * 100)  # 1% separation = strong trend

        # ── ATR-based volatility ──
        atr = compute_atr(highs, lows, closes, min(14, len(closes) - 2))
        current_atr = atr[-1] if not np.isnan(atr[-1]) else 0

        # Compare recent ATR to longer-term average
        if len(atr) >= 30:
            recent_atr = np.nanmean(atr[-10:])
            older_atr = np.nanmean(atr[-30:-10])
            volatility_ratio = recent_atr / older_atr if older_atr > 0 else 1.0
        else:
            volatility_ratio = 1.0

        # ── Price range analysis (ranging detection) ──
        lookback = min(30, len(closes))
        recent_high = np.max(highs[-lookback:])
        recent_low = np.min(lows[-lookback:])
        price_range_pct = (recent_high - recent_low) / recent_low * 100 if recent_low > 0 else 0

        # How many times did price cross the midpoint? (ranging indicator)
        midpoint = (recent_high + recent_low) / 2
        crossings = 0
        for i in range(1, lookback):
            if (closes[-i] > midpoint) != (closes[-i-1] > midpoint):
                crossings += 1

        # ── Momentum consistency ──
        momentum = compute_momentum_score(closes)
        mom_score = abs(momentum["score"])

        # ── Determine regime ──
        regime = self.RANGING  # default
        confidence = 0.5

        # Volatile: ATR expanding significantly
        if volatility_ratio > 1.8:
            regime = self.VOLATILE
            confidence = min(1.0, volatility_ratio / 2.5)

        # Quiet: ATR contracting
        elif volatility_ratio < 0.5 and price_range_pct < 0.5:
            regime = self.QUIET
            confidence = 1.0 - volatility_ratio

        # Trending up: aligned EMAs + momentum
        elif ema_alignment == "bullish" and trend_strength > 0.3 and mom_score > 0.2:
            regime = self.TRENDING_UP
            confidence = min(1.0, trend_strength + mom_score)

        # Trending down: aligned EMAs + momentum
        elif ema_alignment == "bearish" and trend_strength > 0.3 and mom_score > 0.2:
            regime = self.TRENDING_DOWN
            confidence = min(1.0, trend_strength + mom_score)

        # Ranging: lots of midpoint crossings, mixed EMAs
        elif crossings >= 4 and ema_alignment == "mixed":
            regime = self.RANGING
            confidence = min(1.0, crossings / 8.0)

        # Edge cases
        elif trend_strength > 0.5:
            regime = self.TRENDING_UP if ef > et else self.TRENDING_DOWN
            confidence = trend_strength

        result = {
            "regime": regime,
            "confidence": round(confidence, 3),
            "trend_strength": round(trend_strength, 4),
            "volatility_ratio": round(volatility_ratio, 3),
            "ema_alignment": ema_alignment,
            "atr": round(current_atr, 6),
            "price_range_pct": round(price_range_pct, 3),
            "midpoint_crossings": crossings,
            "momentum_score": momentum["score"],
        }

        # Cache it
        self._cache[epic] = result

        # Store in brain if available
        if self.brain:
            self.brain.record_regime(
                epic, regime,
                atr=current_atr,
                volatility=volatility_ratio,
                trend_strength=trend_strength,
                ema_alignment=ema_alignment,
            )

        return result

    def get_cached_regime(self, epic: str) -> str:
        """Get the last detected regime for an epic."""
        cached = self._cache.get(epic)
        return cached["regime"] if cached else "unknown"

    def get_regime_adjustment(self, regime: str) -> dict:
        """
        Get trading parameter adjustments based on current regime.
        These modify the base strategy parameters.
        """
        adjustments = {
            self.TRENDING_UP: {
                "size_multiplier": 1.0,       # Full size in trends
                "sl_multiplier_adj": 1.2,     # Wider SL (give room)
                "min_confidence": 0.40,       # Lower bar in strong trends
                "prefer_direction": "BUY",
                "skip": False,
            },
            self.TRENDING_DOWN: {
                "size_multiplier": 1.0,
                "sl_multiplier_adj": 1.2,
                "min_confidence": 0.40,
                "prefer_direction": "SELL",
                "skip": False,
            },
            self.RANGING: {
                "size_multiplier": 0.7,       # Smaller size in ranges
                "sl_multiplier_adj": 0.8,     # Tighter SL
                "min_confidence": 0.55,       # Higher bar
                "prefer_direction": None,     # Either direction OK
                "skip": False,
            },
            self.VOLATILE: {
                "size_multiplier": 0.5,       # Half size in volatile
                "sl_multiplier_adj": 1.5,     # Much wider SL
                "min_confidence": 0.65,       # Very high bar
                "prefer_direction": None,
                "skip": False,
            },
            self.QUIET: {
                "size_multiplier": 0.5,
                "sl_multiplier_adj": 0.7,
                "min_confidence": 0.60,
                "prefer_direction": None,
                "skip": True,                 # Often skip quiet markets
            },
        }
        return adjustments.get(regime, {
            "size_multiplier": 1.0, "sl_multiplier_adj": 1.0,
            "min_confidence": 0.50, "prefer_direction": None, "skip": False,
        })
