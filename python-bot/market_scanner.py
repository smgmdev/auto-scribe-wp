"""
Multi-Timeframe Market Scanner — Pre-trade analysis engine.

Before entering any trade, the bot:
1. Scans all watchlist assets for volatility & liquidity (ranks them)
2. Analyzes multiple timeframes for trend confirmation
3. For CRYPTO & FOREX: uses fast scalp mode (1m + 5m) with lower thresholds
4. For STOCKS & COMMODITIES: uses standard mode (60m + 15m + 5m)
5. Returns assets with confirmed directional signals
"""

import time
import numpy as np
from typing import Optional
from logger_setup import get_logger
from strategy import compute_ema, compute_rsi, compute_atr, compute_momentum_score
import config

log = get_logger("scanner")

# Standard timeframes for stocks/commodities
TIMEFRAMES_STANDARD = {
    "60min": {"resolution": "HOUR", "candles": 60, "weight": 0.40},
    "15min": {"resolution": "MINUTE_15", "candles": 60, "weight": 0.35},
    "5min":  {"resolution": "MINUTE_5", "candles": 60, "weight": 0.25},
}

# Fast scalp timeframes for crypto & forex
TIMEFRAMES_SCALP = {
    "5min":  {"resolution": "MINUTE_5", "candles": 40, "weight": 0.45},
    "1min":  {"resolution": "MINUTE", "candles": 40, "weight": 0.55},
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
        self.is_scalp: bool = False

    def __repr__(self):
        mode = "SCALP" if self.is_scalp else "STD"
        return f"{self.epic}: {self.overall_signal} conf={self.confidence:.2f} vol={self.volatility_score:.2f} [{mode}]"


class MarketScanner:
    """
    Multi-timeframe scanner with dual modes:
    - Standard mode (stocks/commodities): 60m+15m+5m, strict agreement
    - Scalp mode (crypto/forex): 1m+5m, lower thresholds, faster entries
    """

    def __init__(self, api, watchlist: list[str]):
        self.api = api
        self.watchlist = watchlist
        self.scan_cache: dict[str, MarketScanResult] = {}
        self.last_full_scan: float = 0
        self.last_scalp_scan: float = 0
        self.FULL_SCAN_INTERVAL = 120    # Standard scan every 2 min
        self.SCALP_SCAN_INTERVAL = 30    # Scalp scan every 30 seconds
        self.TOP_N_STANDARD = 8          # Deep-analyze top 8 stocks/commodities
        self.TOP_N_SCALP = 12            # Deep-analyze top 12 crypto/forex

    def _analyze_timeframe(self, epic: str, tf_name: str, tf_config: dict,
                           is_scalp: bool = False) -> Optional[TimeframeAnalysis]:
        """Analyze a single timeframe for an asset."""
        try:
            prices_data = self.api.get_prices(epic, tf_config["resolution"], num_points=tf_config["candles"])
            if not prices_data or not prices_data.get("prices"):
                return None

            candles = prices_data["prices"]
            min_candles = 15 if is_scalp else 30
            if len(candles) < min_candles:
                return None

            closes = np.array([(c["closePrice"]["bid"] + c["closePrice"]["ask"]) / 2 for c in candles])
            highs = np.array([(c["highPrice"]["bid"] + c["highPrice"]["ask"]) / 2 for c in candles])
            lows = np.array([(c["lowPrice"]["bid"] + c["lowPrice"]["ask"]) / 2 for c in candles])

            # EMAs — use shorter periods for scalp
            if is_scalp:
                ema_fast_period = 5
                ema_slow_period = 13
                ema_trend_period = min(21, len(closes) - 1)
            else:
                ema_fast_period = 9
                ema_slow_period = 21
                ema_trend_period = min(50, len(closes) - 1)

            ema_fast = compute_ema(closes, ema_fast_period)
            ema_slow = compute_ema(closes, ema_slow_period)
            ema_trend = compute_ema(closes, ema_trend_period)

            # ATR for volatility
            atr_period = min(14, len(closes) - 2)
            atr_vals = compute_atr(highs, lows, closes, atr_period)
            current_atr = atr_vals[-1] if not np.isnan(atr_vals[-1]) else 0

            # RSI
            rsi = compute_rsi(closes, min(14, len(closes) - 2))

            # Momentum score
            momentum = compute_momentum_score(closes)

            price = closes[-1]
            ema_f_now = ema_fast[-1]
            ema_s_now = ema_slow[-1]
            ema_t_now = ema_trend[-1]

            # Score direction signals
            buy_signals = 0
            sell_signals = 0
            total_signals = 0

            # EMA alignment
            total_signals += 3
            if ema_f_now > ema_s_now:
                buy_signals += 1
            else:
                sell_signals += 1
            if ema_s_now > ema_t_now:
                buy_signals += 1
            else:
                sell_signals += 1
            if price > ema_f_now:
                buy_signals += 1
            else:
                sell_signals += 1

            # Momentum direction
            total_signals += 1
            mom_threshold = 0.15 if is_scalp else 0.20
            if momentum["score"] > mom_threshold:
                buy_signals += 1
            elif momentum["score"] < -mom_threshold:
                sell_signals += 1

            # RSI bias
            total_signals += 1
            if rsi > 52:
                buy_signals += 1
            elif rsi < 48:
                sell_signals += 1

            # Recent price action
            total_signals += 1
            lookback = min(10, len(closes) - 1)
            recent_slope = (closes[-1] - closes[-lookback]) / closes[-lookback] if lookback > 0 else 0
            slope_threshold = 0.001 if is_scalp else 0.002
            if recent_slope > slope_threshold:
                buy_signals += 1
            elif recent_slope < -slope_threshold:
                sell_signals += 1

            # For scalp: add volume proxy (range expansion = volume proxy)
            if is_scalp:
                total_signals += 1
                recent_ranges = highs[-5:] - lows[-5:]
                older_ranges = highs[-10:-5] - lows[-10:-5] if len(highs) >= 10 else recent_ranges
                avg_recent_range = np.mean(recent_ranges)
                avg_older_range = np.mean(older_ranges)
                if avg_older_range > 0 and avg_recent_range > avg_older_range * 1.3:
                    # Volume expanding — add to dominant direction
                    if buy_signals > sell_signals:
                        buy_signals += 1
                    elif sell_signals > buy_signals:
                        sell_signals += 1

            # Determine direction and strength — lower thresholds for scalp
            min_signals = 3 if is_scalp else 4
            if buy_signals > sell_signals and buy_signals >= min_signals:
                direction = "BUY"
                strength = buy_signals / total_signals
            elif sell_signals > buy_signals and sell_signals >= min_signals:
                direction = "SELL"
                strength = sell_signals / total_signals
            else:
                direction = "NEUTRAL"
                strength = 0.0

            trend_aligned = (ema_f_now > ema_s_now > ema_t_now) or (ema_f_now < ema_s_now < ema_t_now)

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
            data = self.api.get_prices(epic, "MINUTE_5", num_points=12)
            if not data or not data.get("prices") or len(data["prices"]) < 5:
                return {"epic": epic, "volatility": 0, "spread": 999, "price": 0}

            candles = data["prices"]
            closes = [(c["closePrice"]["bid"] + c["closePrice"]["ask"]) / 2 for c in candles]
            spreads = [c["closePrice"]["ask"] - c["closePrice"]["bid"] for c in candles]
            highs = [(c["highPrice"]["bid"] + c["highPrice"]["ask"]) / 2 for c in candles]
            lows = [(c["lowPrice"]["bid"] + c["lowPrice"]["ask"]) / 2 for c in candles]

            price = closes[-1]
            avg_spread = sum(spreads) / len(spreads)

            ranges = [h - l for h, l in zip(highs, lows)]
            avg_range = sum(ranges) / len(ranges)
            volatility = (avg_range / price) * 100 if price > 0 else 0

            spread_ratio = avg_spread / price if price > 0 else 1

            # Volume proxy: range expansion in recent vs older candles
            if len(ranges) >= 6:
                recent_vol = sum(ranges[-3:]) / 3
                older_vol = sum(ranges[:3]) / 3
                vol_expansion = recent_vol / older_vol if older_vol > 0 else 1.0
            else:
                vol_expansion = 1.0

            return {
                "epic": epic,
                "volatility": round(volatility, 4),
                "spread": round(avg_spread, 5),
                "spread_ratio": round(spread_ratio, 6),
                "price": round(price, 5),
                "vol_expansion": round(vol_expansion, 3),
            }

        except Exception as e:
            log.error(f"Volatility scan error {epic}: {e}")
            return {"epic": epic, "volatility": 0, "spread": 999, "price": 0}

    def _evaluate_scan_result(self, scan: MarketScanResult, is_scalp: bool) -> MarketScanResult:
        """Evaluate multi-timeframe agreement and set final signal."""
        timeframes = TIMEFRAMES_SCALP if is_scalp else TIMEFRAMES_STANDARD
        scan.is_scalp = is_scalp

        if len(scan.analyses) < (1 if is_scalp else 2):
            scan.overall_signal = "HOLD"
            scan.reason = "Insufficient timeframe data"
            return scan

        directions = {}
        weighted_score = 0.0
        total_weight = 0.0

        for tf_name, analysis in scan.analyses.items():
            weight = timeframes.get(tf_name, {}).get("weight", 0.33)
            if analysis.direction == "BUY":
                weighted_score += analysis.strength * weight
            elif analysis.direction == "SELL":
                weighted_score -= analysis.strength * weight
            total_weight += weight
            directions[tf_name] = analysis.direction

        if total_weight > 0:
            weighted_score /= total_weight

        # Direction counts
        dir_counts = {}
        for d in directions.values():
            if d != "NEUTRAL":
                dir_counts[d] = dir_counts.get(d, 0) + 1
        majority_dir = max(dir_counts, key=dir_counts.get) if dir_counts else "NEUTRAL"
        majority_count = dir_counts.get(majority_dir, 0)

        # ATR for stop distance
        if "5min" in scan.analyses:
            scan.atr = scan.analyses["5min"].atr
            scan.stop_distance = scan.atr * (1.5 if is_scalp else 2.0)
        elif "1min" in scan.analyses:
            scan.atr = scan.analyses["1min"].atr
            scan.stop_distance = scan.atr * 2.0
        elif "15min" in scan.analyses:
            scan.atr = scan.analyses["15min"].atr
            scan.stop_distance = scan.atr * 2.0

        # RSI filter — tighter to avoid entering at extremes
        rsi_ok = True
        check_tf = "1min" if is_scalp and "1min" in scan.analyses else "5min"
        if check_tf in scan.analyses:
            rsi_val = scan.analyses[check_tf].rsi
            overbought = 72 if is_scalp else 68
            oversold = 28 if is_scalp else 32
            if majority_dir == "BUY" and rsi_val > overbought:
                rsi_ok = False
            if majority_dir == "SELL" and rsi_val < oversold:
                rsi_ok = False

        # Thresholds — raised significantly to filter weak signals
        min_majority = 2 if is_scalp else 2
        min_confidence = 0.35 if is_scalp else 0.45

        if majority_count >= min_majority and abs(weighted_score) >= min_confidence and rsi_ok:
            scan.overall_signal = majority_dir
            scan.confidence = round(abs(weighted_score), 3)

            tf_summary = " | ".join(f"{k}={v}" for k, v in directions.items())
            mode_tag = "SCALP" if is_scalp else "STD"
            scan.reason = (
                f"[{mode_tag}] Multi-TF {majority_dir}: [{tf_summary}] "
                f"conf={scan.confidence:.2f}"
            )
        else:
            scan.overall_signal = "HOLD"
            tf_summary = " | ".join(f"{k}={v}" for k, v in directions.items())
            if not rsi_ok:
                scan.reason = f"RSI extreme — no entry | [{tf_summary}]"
            elif majority_count < min_majority:
                scan.reason = f"No TF agreement | [{tf_summary}]"
            else:
                scan.reason = f"Weak confidence ({abs(weighted_score):.2f}) | [{tf_summary}]"

        return scan

    def scan_all(self) -> list[MarketScanResult]:
        """
        Full market scan with dual modes:
        - Standard scan (stocks/commodities) every 2 min
        - Scalp scan (crypto/forex) every 30 sec
        """
        now = time.time()
        results: list[MarketScanResult] = []

        # ═══════════════════════════════════════════
        # SCALP SCAN — crypto & forex (every 30s)
        # ═══════════════════════════════════════════
        if now - self.last_scalp_scan >= self.SCALP_SCAN_INTERVAL:
            scalp_epics = config.WATCHLIST_CRYPTO + config.WATCHLIST_FOREX
            if scalp_epics:
                log.info("⚡ ═══ SCALP SCAN (Crypto + FX) ═══")

                # Quick volatility rank
                vol_scans = []
                for epic in scalp_epics:
                    vs = self._quick_volatility_scan(epic)
                    vol_scans.append(vs)

                # Sort by volatility × volume expansion (catches surges)
                vol_scans.sort(
                    key=lambda x: x["volatility"] * x.get("vol_expansion", 1.0),
                    reverse=True,
                )

                top_scalp = vol_scans[:self.TOP_N_SCALP]

                for asset in top_scalp:
                    epic = asset["epic"]
                    scan = MarketScanResult(epic)
                    scan.price = asset["price"]
                    scan.spread = asset["spread"]
                    scan.volatility_score = asset["volatility"]

                    for tf_name, tf_config in TIMEFRAMES_SCALP.items():
                        analysis = self._analyze_timeframe(epic, tf_name, tf_config, is_scalp=True)
                        if analysis:
                            scan.analyses[tf_name] = analysis

                    scan = self._evaluate_scan_result(scan, is_scalp=True)
                    results.append(scan)
                    self.scan_cache[epic] = scan

                    if scan.overall_signal != "HOLD":
                        log.info(f"  ⚡ {epic}: {scan.overall_signal} — {scan.reason}")

                confirmed_scalp = [r for r in results if r.overall_signal != "HOLD"]
                log.info(f"⚡ Scalp scan: {len(confirmed_scalp)}/{len(top_scalp)} confirmed signals")
                self.last_scalp_scan = now

        # ═══════════════════════════════════════════
        # STANDARD SCAN — stocks & commodities (every 2 min)
        # ═══════════════════════════════════════════
        if now - self.last_full_scan >= self.FULL_SCAN_INTERVAL:
            std_epics = config.WATCHLIST_STOCKS + config.WATCHLIST_COMMODITIES
            if std_epics:
                log.info("🔍 ═══ STANDARD SCAN (Stocks + Commodities) ═══")

                vol_scans = []
                for epic in std_epics:
                    vs = self._quick_volatility_scan(epic)
                    vol_scans.append(vs)

                vol_scans.sort(key=lambda x: x["volatility"], reverse=True)

                log.info("📊 Volatility ranking:")
                for i, vs in enumerate(vol_scans[:10]):
                    log.info(f"  {i+1}. {vs['epic']}: vol={vs['volatility']:.3f}%")

                top_std = vol_scans[:self.TOP_N_STANDARD]

                for asset in top_std:
                    epic = asset["epic"]
                    scan = MarketScanResult(epic)
                    scan.price = asset["price"]
                    scan.spread = asset["spread"]
                    scan.volatility_score = asset["volatility"]

                    for tf_name, tf_config in TIMEFRAMES_STANDARD.items():
                        analysis = self._analyze_timeframe(epic, tf_name, tf_config, is_scalp=False)
                        if analysis:
                            scan.analyses[tf_name] = analysis

                    scan = self._evaluate_scan_result(scan, is_scalp=False)
                    results.append(scan)
                    self.scan_cache[epic] = scan

                    if scan.overall_signal != "HOLD":
                        log.info(f"  ✅ {epic}: {scan.overall_signal} — {scan.reason}")
                    else:
                        log.info(f"  ⏸️  {epic}: HOLD — {scan.reason}")

                self.last_full_scan = now

        if not results:
            results = list(self.scan_cache.values())

        confirmed = [r for r in results if r.overall_signal != "HOLD"]
        if confirmed:
            log.info(f"🔍 Total confirmed signals: {len(confirmed)}")

        return results

    def get_entry_signal(self, epic: str) -> Optional[MarketScanResult]:
        """Get the latest confirmed entry signal for an asset."""
        result = self.scan_cache.get(epic)
        if not result or result.overall_signal == "HOLD":
            return None

        # Staleness check — scalp signals expire faster
        max_age = self.SCALP_SCAN_INTERVAL * 3 if result.is_scalp else self.FULL_SCAN_INTERVAL * 2
        scan_time = self.last_scalp_scan if result.is_scalp else self.last_full_scan
        if time.time() - scan_time > max_age:
            return None

        return result

    def invalidate(self, epic: str):
        """Invalidate scan cache for an asset (after entering a trade)."""
        self.scan_cache.pop(epic, None)
