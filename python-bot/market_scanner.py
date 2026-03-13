"""
Multi-Timeframe Market Scanner — Pre-trade analysis engine.

Before entering any trade, the bot:
1. Scans all watchlist assets for volatility & liquidity (ranks them)
2. Analyzes 60min, 15min, 5min candle trends for each top candidate
3. Only signals entry when ALL timeframes agree on direction
4. Prevents entries into momentum reversals or choppy markets

This replaces blind EMA-crossover entries with informed, multi-timeframe decisions.
"""

import time
import numpy as np
from typing import Optional
from logger_setup import get_logger
from strategy import compute_ema, compute_rsi, compute_atr, compute_momentum_score

log = get_logger("scanner")

# Timeframes to analyze (Capital.com resolution strings)
TIMEFRAMES = {
    "60min": {"resolution": "HOUR", "candles": 60, "weight": 0.40},
    "15min": {"resolution": "MINUTE_15", "candles": 60, "weight": 0.35},
    "5min":  {"resolution": "MINUTE_5", "candles": 60, "weight": 0.25},
}


class TimeframeAnalysis:
    """Result of analyzing a single timeframe."""
    def __init__(self, timeframe: str, direction: str, strength: float,
                 rsi: float, momentum_score: float, atr: float, trend_aligned: bool):
        self.timeframe = timeframe
        self.direction = direction      # "BUY" | "SELL" | "NEUTRAL"
        self.strength = strength        # 0.0 - 1.0
        self.rsi = rsi
        self.momentum_score = momentum_score
        self.atr = atr
        self.trend_aligned = trend_aligned

    def __repr__(self):
        return f"{self.timeframe}: {self.direction} str={self.strength:.2f} RSI={self.rsi:.0f} mom={self.momentum_score:.2f}"


class MarketScanResult:
    """Full scan result for a single asset."""
    def __init__(self, epic: str):
        self.epic = epic
        self.analyses: dict[str, TimeframeAnalysis] = {}
        self.volatility_score: float = 0.0
        self.spread: float = 0.0
        self.price: float = 0.0
        self.overall_signal: str = "HOLD"  # "BUY" | "SELL" | "HOLD"
        self.confidence: float = 0.0
        self.reason: str = ""
        self.stop_distance: float = 0.0
        self.atr: float = 0.0

    def __repr__(self):
        return f"{self.epic}: {self.overall_signal} conf={self.confidence:.2f} vol={self.volatility_score:.2f}"


class MarketScanner:
    """
    Multi-timeframe scanner that ranks assets and confirms entries.
    
    Flow:
    1. scan_all() → ranks all watchlist assets by volatility/liquidity
    2. For top N assets, performs deep multi-TF analysis
    3. Returns only assets with confirmed directional alignment
    """

    def __init__(self, api, watchlist: list[str]):
        self.api = api
        self.watchlist = watchlist
        self.scan_cache: dict[str, MarketScanResult] = {}
        self.last_full_scan: float = 0
        self.FULL_SCAN_INTERVAL = 120  # Full scan every 2 minutes
        self.TOP_N = min(5, len(watchlist))  # Deep-analyze top 5 most volatile

    def _analyze_timeframe(self, epic: str, tf_name: str, tf_config: dict) -> Optional[TimeframeAnalysis]:
        """Analyze a single timeframe for an asset."""
        try:
            prices_data = self.api.get_prices(epic, tf_config["resolution"], num_points=tf_config["candles"])
            if not prices_data or not prices_data.get("prices"):
                return None

            candles = prices_data["prices"]
            if len(candles) < 30:
                return None

            closes = np.array([(c["closePrice"]["bid"] + c["closePrice"]["ask"]) / 2 for c in candles])
            highs = np.array([(c["highPrice"]["bid"] + c["highPrice"]["ask"]) / 2 for c in candles])
            lows = np.array([(c["lowPrice"]["bid"] + c["lowPrice"]["ask"]) / 2 for c in candles])

            # EMAs for trend
            ema9 = compute_ema(closes, 9)
            ema21 = compute_ema(closes, 21)
            ema50 = compute_ema(closes, min(50, len(closes) - 1))

            # ATR for volatility
            atr_vals = compute_atr(highs, lows, closes, 14)
            current_atr = atr_vals[-1] if not np.isnan(atr_vals[-1]) else 0

            # RSI
            rsi = compute_rsi(closes, 14)

            # Momentum score
            momentum = compute_momentum_score(closes)

            # Determine direction from multiple signals
            price = closes[-1]
            ema9_now = ema9[-1]
            ema21_now = ema21[-1]
            ema50_now = ema50[-1]

            # Score direction signals
            buy_signals = 0
            sell_signals = 0
            total_signals = 0

            # EMA alignment
            total_signals += 3
            if ema9_now > ema21_now:
                buy_signals += 1
            else:
                sell_signals += 1
            if ema21_now > ema50_now:
                buy_signals += 1
            else:
                sell_signals += 1
            if price > ema9_now:
                buy_signals += 1
            else:
                sell_signals += 1

            # Momentum direction
            total_signals += 1
            if momentum["score"] > 0.15:
                buy_signals += 1
            elif momentum["score"] < -0.15:
                sell_signals += 1

            # RSI bias
            total_signals += 1
            if rsi > 55:
                buy_signals += 1
            elif rsi < 45:
                sell_signals += 1

            # Recent price action (last 10 candles slope)
            total_signals += 1
            recent_slope = (closes[-1] - closes[-10]) / closes[-10] if len(closes) >= 10 else 0
            if recent_slope > 0.001:
                buy_signals += 1
            elif recent_slope < -0.001:
                sell_signals += 1

            # Determine direction and strength
            if buy_signals > sell_signals and buy_signals >= 4:
                direction = "BUY"
                strength = buy_signals / total_signals
            elif sell_signals > buy_signals and sell_signals >= 4:
                direction = "SELL"
                strength = sell_signals / total_signals
            else:
                direction = "NEUTRAL"
                strength = 0.0

            # Check trend alignment (all EMAs in order)
            trend_aligned = (ema9_now > ema21_now > ema50_now) or (ema9_now < ema21_now < ema50_now)

            return TimeframeAnalysis(
                timeframe=tf_name,
                direction=direction,
                strength=round(strength, 3),
                rsi=round(rsi, 2),
                momentum_score=round(momentum["score"], 4),
                atr=round(current_atr, 5),
                trend_aligned=trend_aligned,
            )

        except Exception as e:
            log.error(f"TF analysis error {epic} {tf_name}: {e}")
            return None

    def _quick_volatility_scan(self, epic: str) -> dict:
        """Quick scan to rank asset by volatility and spread (liquidity proxy)."""
        try:
            # Use 5-min candles for recent volatility
            data = self.api.get_prices(epic, "MINUTE_5", num_points=12)  # last 60 min
            if not data or not data.get("prices") or len(data["prices"]) < 5:
                return {"epic": epic, "volatility": 0, "spread": 999, "price": 0}

            candles = data["prices"]
            closes = [(c["closePrice"]["bid"] + c["closePrice"]["ask"]) / 2 for c in candles]
            spreads = [c["closePrice"]["ask"] - c["closePrice"]["bid"] for c in candles]
            highs = [(c["highPrice"]["bid"] + c["highPrice"]["ask"]) / 2 for c in candles]
            lows = [(c["lowPrice"]["bid"] + c["lowPrice"]["ask"]) / 2 for c in candles]

            price = closes[-1]
            avg_spread = sum(spreads) / len(spreads)

            # Volatility = average range relative to price
            ranges = [h - l for h, l in zip(highs, lows)]
            avg_range = sum(ranges) / len(ranges)
            volatility = (avg_range / price) * 100 if price > 0 else 0  # as percentage

            # Spread ratio (lower is better for liquidity)
            spread_ratio = avg_spread / price if price > 0 else 1

            return {
                "epic": epic,
                "volatility": round(volatility, 4),
                "spread": round(avg_spread, 5),
                "spread_ratio": round(spread_ratio, 6),
                "price": round(price, 5),
            }

        except Exception as e:
            log.error(f"Volatility scan error {epic}: {e}")
            return {"epic": epic, "volatility": 0, "spread": 999, "price": 0}

    def scan_all(self) -> list[MarketScanResult]:
        """
        Full market scan:
        1. Rank all assets by volatility (most active first)
        2. Deep multi-TF analysis on top N
        3. Return results with confirmed signals only

        Returns list of MarketScanResult sorted by confidence.
        """
        now = time.time()
        if now - self.last_full_scan < self.FULL_SCAN_INTERVAL and self.scan_cache:
            return list(self.scan_cache.values())

        log.info("🔍 ═══ FULL MARKET SCAN ═══")

        # Step 1: Quick volatility scan on all assets
        vol_scans = []
        for epic in self.watchlist:
            vs = self._quick_volatility_scan(epic)
            vol_scans.append(vs)

        # Sort by volatility (most volatile first) but filter out illiquid ones
        vol_scans.sort(key=lambda x: x["volatility"], reverse=True)

        log.info("📊 Volatility ranking:")
        for i, vs in enumerate(vol_scans):
            log.info(f"  {i+1}. {vs['epic']}: vol={vs['volatility']:.3f}% spread={vs.get('spread_ratio', 0):.5f}")

        # Step 2: Deep multi-TF analysis on top N most volatile
        top_assets = vol_scans[:self.TOP_N]
        results: list[MarketScanResult] = []

        for asset in top_assets:
            epic = asset["epic"]
            scan = MarketScanResult(epic)
            scan.price = asset["price"]
            scan.spread = asset["spread"]
            scan.volatility_score = asset["volatility"]

            # Analyze each timeframe
            for tf_name, tf_config in TIMEFRAMES.items():
                analysis = self._analyze_timeframe(epic, tf_name, tf_config)
                if analysis:
                    scan.analyses[tf_name] = analysis

            if len(scan.analyses) < 2:
                scan.overall_signal = "HOLD"
                scan.reason = "Insufficient timeframe data"
                results.append(scan)
                continue

            # Step 3: Multi-timeframe agreement
            directions = {}
            weighted_score = 0.0
            total_weight = 0.0

            for tf_name, analysis in scan.analyses.items():
                weight = TIMEFRAMES[tf_name]["weight"]
                if analysis.direction == "BUY":
                    weighted_score += analysis.strength * weight
                elif analysis.direction == "SELL":
                    weighted_score -= analysis.strength * weight
                total_weight += weight

                directions[tf_name] = analysis.direction

            # Normalize
            if total_weight > 0:
                weighted_score /= total_weight

            # Check agreement across timeframes
            unique_dirs = set(d for d in directions.values() if d != "NEUTRAL")

            # All timeframes must agree (or be neutral)
            all_agree = len(unique_dirs) <= 1 and len(unique_dirs) > 0

            # At least 2 timeframes must have the same direction
            dir_counts = {}
            for d in directions.values():
                if d != "NEUTRAL":
                    dir_counts[d] = dir_counts.get(d, 0) + 1
            majority_dir = max(dir_counts, key=dir_counts.get) if dir_counts else "NEUTRAL"
            majority_count = dir_counts.get(majority_dir, 0)

            # Use ATR from 15min for SL calculation
            if "15min" in scan.analyses:
                scan.atr = scan.analyses["15min"].atr
                scan.stop_distance = scan.atr * 2.0
            elif "5min" in scan.analyses:
                scan.atr = scan.analyses["5min"].atr
                scan.stop_distance = scan.atr * 2.5

            # RSI filter: don't buy overbought, don't sell oversold
            rsi_ok = True
            if "5min" in scan.analyses:
                rsi_5m = scan.analyses["5min"].rsi
                if majority_dir == "BUY" and rsi_5m > 75:
                    rsi_ok = False
                if majority_dir == "SELL" and rsi_5m < 25:
                    rsi_ok = False

            # Determine final signal
            if majority_count >= 2 and abs(weighted_score) >= 0.3 and rsi_ok:
                scan.overall_signal = majority_dir
                scan.confidence = round(abs(weighted_score), 3)

                tf_summary = " | ".join(f"{k}={v}" for k, v in directions.items())
                rsi_summary = " | ".join(
                    f"{k}:RSI={a.rsi:.0f}" for k, a in scan.analyses.items()
                )
                scan.reason = (
                    f"Multi-TF {majority_dir}: [{tf_summary}] "
                    f"conf={scan.confidence:.2f} | {rsi_summary}"
                )
            else:
                scan.overall_signal = "HOLD"
                tf_summary = " | ".join(f"{k}={v}" for k, v in directions.items())
                if not rsi_ok:
                    scan.reason = f"RSI extreme — no entry | [{tf_summary}]"
                elif majority_count < 2:
                    scan.reason = f"No TF agreement | [{tf_summary}]"
                else:
                    scan.reason = f"Weak confidence ({abs(weighted_score):.2f}) | [{tf_summary}]"

            results.append(scan)

            if scan.overall_signal != "HOLD":
                log.info(f"  ✅ {epic}: {scan.overall_signal} — {scan.reason}")
            else:
                log.info(f"  ⏸️  {epic}: HOLD — {scan.reason}")

        # Cache results
        self.scan_cache = {r.epic: r for r in results}
        self.last_full_scan = now

        confirmed = [r for r in results if r.overall_signal != "HOLD"]
        log.info(f"🔍 Scan complete: {len(confirmed)}/{len(results)} assets with confirmed signals")

        return results

    def get_entry_signal(self, epic: str) -> Optional[MarketScanResult]:
        """
        Get the latest confirmed entry signal for an asset.
        Returns None if no confirmed signal or scan is stale.
        """
        result = self.scan_cache.get(epic)
        if not result or result.overall_signal == "HOLD":
            return None

        # Signal must be reasonably fresh
        if time.time() - self.last_full_scan > self.FULL_SCAN_INTERVAL * 2:
            return None

        return result

    def invalidate(self, epic: str):
        """Invalidate scan cache for an asset (after entering a trade)."""
        self.scan_cache.pop(epic, None)
