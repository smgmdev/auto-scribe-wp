"""
Local Statistical Trade Reviewer — no API keys required.

Analyzes trades using pure math: win-rate trends, drawdown detection,
regime-specific performance, time-of-day patterns, and streak analysis.
Generates actionable lessons and parameter adjustments automatically.
"""

import json
import math
from typing import Optional
from logger_setup import get_logger

log = get_logger("stat_reviewer")

REVIEW_INTERVAL = 5  # Review every N trades


class AITradeReviewer:
    """Reviews trades using local statistical analysis. Zero API cost."""

    def __init__(self, brain=None):
        self.brain = brain
        self._trade_count = 0
        log.info("📊 Local Statistical Trade Reviewer enabled (no API key needed)")

    def review_trade(self, trade: dict, trade_id: int,
                     brain_summary: dict = None) -> Optional[dict]:
        """Analyze a trade using statistics. Runs every N trades."""
        self._trade_count += 1
        if self._trade_count % REVIEW_INTERVAL != 0:
            return None

        try:
            return self._statistical_review(trade, trade_id, brain_summary)
        except Exception as e:
            log.warning(f"Statistical review failed: {e}")
            return None

    # ──────────────────────────────────────────────
    # CORE ANALYSIS ENGINE
    # ──────────────────────────────────────────────

    def _statistical_review(self, trade: dict, trade_id: int,
                            brain_summary: dict = None) -> Optional[dict]:
        """Run all local analyzers and produce a combined review."""
        lessons = []
        adjustments = {}
        analysis_parts = []
        confidence = 0.5

        pnl = trade.get("pnl", 0)
        epic = trade.get("epic", "?")
        direction = trade.get("direction", "?")
        regime = trade.get("regime", "unknown")
        exit_reason = trade.get("exit_reason", "unknown")
        rsi = trade.get("rsi_at_entry", 50)
        momentum = trade.get("momentum_at_entry", 0)
        duration = trade.get("duration_seconds", 0)
        scanner_conf = trade.get("scanner_confidence", 0)
        won = pnl > 0

        # ── 1. Basic outcome ──
        pnl_pct = trade.get("pnl_pct", 0)
        analysis_parts.append(
            f"{'WIN' if won else 'LOSS'} on {epic} ({direction}): {pnl_pct:+.2f}%"
        )

        # ── 2. Stop-loss hit analysis ──
        if exit_reason in ("stop_loss", "SL"):
            lessons.append("Stop-loss triggered — check if SL was too tight for current volatility")
            if duration < 120:
                lessons.append(f"Trade lasted only {duration:.0f}s before SL — likely noise entry")
                adjustments["min_hold_seconds"] = max(60, int(duration * 2))

        # ── 3. RSI extremes ──
        if direction == "BUY" and rsi > 70:
            lessons.append(f"Bought with RSI={rsi:.0f} (overbought) — avoid BUY entries above 65")
            adjustments["max_rsi_for_buy"] = 65
        elif direction == "SELL" and rsi < 30:
            lessons.append(f"Sold with RSI={rsi:.0f} (oversold) — avoid SELL entries below 35")
            adjustments["min_rsi_for_sell"] = 35

        # ── 4. Low-confidence entry ──
        if scanner_conf < 0.4 and not won:
            lessons.append(f"Lost on low-confidence entry ({scanner_conf:.2f}) — raise min threshold")
            adjustments["min_scanner_confidence"] = 0.50

        # ── 5. Regime mismatch ──
        if regime == "ranging" and abs(momentum) > 0.002:
            lessons.append("Momentum signal in ranging market — momentum unreliable in chop")
        if regime == "volatile" and not won:
            lessons.append("Loss in volatile regime — consider wider stops or skipping volatile periods")
            adjustments["volatile_stop_multiplier"] = 1.5

        # ── 6. Duration analysis ──
        if won and duration > 3600:
            lessons.append("Profitable but held >1hr — could tighten trailing stop for faster lock-in")
        if not won and duration > 1800:
            lessons.append("Losing trade held >30min — consider time-based exit at 20min if flat")

        # ── 7. Historical pattern analysis from brain ──
        if self.brain:
            recent = self._get_recent_trades(10)
            if recent:
                pattern_insights, pattern_adj = self._analyze_patterns(recent, trade)
                lessons.extend(pattern_insights)
                adjustments.update(pattern_adj)

                # Confidence based on data quality
                confidence = min(0.9, 0.4 + len(recent) * 0.05)

        # ── 8. Brain summary analysis ──
        if brain_summary:
            wr = brain_summary.get("win_rate", 0.5)
            total = brain_summary.get("total_trades", 0)
            if total > 20 and wr < 0.40:
                lessons.append(f"Overall win rate {wr:.0%} is below 40% — bot needs strategy adjustment")
                adjustments["global_confidence_boost"] = 0.1
            if total > 20 and wr > 0.60:
                analysis_parts.append(f"Strong overall performance ({wr:.0%} WR)")

        # Compose final analysis
        analysis = ". ".join(analysis_parts) if analysis_parts else "Trade recorded."

        # Build avoid pattern
        avoid_pattern = None
        if not won and exit_reason in ("stop_loss", "SL"):
            avoid_pattern = f"Avoid {direction} {epic} in {regime} regime with RSI={rsi:.0f}"

        review = {
            "analysis": analysis,
            "lessons": lessons[:5],
            "adjustments": adjustments,
            "confidence": confidence,
            "avoid_pattern": avoid_pattern,
        }

        # Store in brain
        if self.brain:
            self.brain.store_ai_review(
                trade_id=trade_id,
                review_text=analysis,
                lessons=lessons[:5],
                adjustments=adjustments,
                confidence=confidence,
            )

        log.info(f"📊 Review for trade #{trade_id}: {analysis[:100]}")
        for lesson in lessons[:3]:
            log.info(f"  📝 {lesson}")

        return review

    # ──────────────────────────────────────────────
    # PATTERN ANALYSIS (uses brain DB)
    # ──────────────────────────────────────────────

    def _get_recent_trades(self, n: int) -> list[dict]:
        """Pull recent trades from brain DB."""
        try:
            rows = self.brain.conn.execute("""
                SELECT epic, direction, pnl, pnl_pct, regime, exit_reason,
                       rsi_at_entry, momentum_at_entry, duration_seconds,
                       scanner_confidence, entry_hour
                FROM trades ORDER BY closed_at DESC LIMIT ?
            """, (n,)).fetchall()
            return [dict(r) for r in rows]
        except Exception:
            return []

    def _analyze_patterns(self, recent: list[dict], current: dict) -> tuple[list[str], dict]:
        """Find statistical patterns in recent trades."""
        lessons = []
        adjustments = {}

        # ── Streak detection ──
        streak = 0
        for t in recent:
            if t.get("pnl", 0) <= 0:
                streak += 1
            else:
                break
        if streak >= 3:
            lessons.append(f"Currently on a {streak}-trade losing streak — consider pausing or reducing size")
            adjustments["position_size_multiplier"] = max(0.5, 1.0 - streak * 0.1)

        # ── Same-asset repeated losses ──
        epic = current.get("epic", "")
        epic_trades = [t for t in recent if t.get("epic") == epic]
        if len(epic_trades) >= 3:
            epic_losses = sum(1 for t in epic_trades if t.get("pnl", 0) <= 0)
            if epic_losses >= 2:
                lessons.append(f"{epic}: {epic_losses}/{len(epic_trades)} recent trades lost — consider temporary blacklist")

        # ── Regime performance ──
        regime = current.get("regime", "unknown")
        regime_trades = [t for t in recent if t.get("regime") == regime]
        if len(regime_trades) >= 3:
            regime_wr = sum(1 for t in regime_trades if t.get("pnl", 0) > 0) / len(regime_trades)
            if regime_wr < 0.33:
                lessons.append(f"Win rate in '{regime}' regime is only {regime_wr:.0%} — avoid trading this regime")
                adjustments[f"skip_regime_{regime}"] = True

        # ── Time-of-day patterns ──
        hour = current.get("entry_hour")
        if hour is not None:
            hour_trades = [t for t in recent if t.get("entry_hour") == hour]
            if len(hour_trades) >= 2:
                hour_losses = sum(1 for t in hour_trades if t.get("pnl", 0) <= 0)
                if hour_losses == len(hour_trades):
                    lessons.append(f"All recent trades at hour {hour}:00 lost — blacklist this hour")

        # ── Average loss size vs win size ──
        wins = [t.get("pnl_pct", 0) for t in recent if t.get("pnl", 0) > 0]
        losses = [abs(t.get("pnl_pct", 0)) for t in recent if t.get("pnl", 0) <= 0]
        if wins and losses:
            avg_win = sum(wins) / len(wins)
            avg_loss = sum(losses) / len(losses)
            if avg_loss > avg_win * 1.5:
                lessons.append(f"Avg loss ({avg_loss:.2f}%) is {avg_loss/avg_win:.1f}x avg win ({avg_win:.2f}%) — tighten stops")
                adjustments["stop_loss_tightening"] = 0.8

        return lessons, adjustments

    # ──────────────────────────────────────────────
    # BATCH REVIEW (periodic deeper analysis)
    # ──────────────────────────────────────────────

    def get_batch_review(self, trades: list[dict]) -> Optional[dict]:
        """Statistical batch review of recent trades — no API needed."""
        if len(trades) < 5:
            return None

        losses = [t for t in trades if t.get("pnl", 0) <= 0]
        wins = [t for t in trades if t.get("pnl", 0) > 0]

        if len(losses) < 3:
            return None

        issues = []
        changes = {}

        # ── Win rate trend ──
        total = len(trades)
        wr = len(wins) / total if total else 0
        issues.append(f"Win rate: {wr:.0%} over last {total} trades")

        # ── Most losing asset ──
        epic_losses = {}
        for t in losses:
            ep = t.get("epic", "?")
            epic_losses[ep] = epic_losses.get(ep, 0) + 1
        if epic_losses:
            worst = max(epic_losses, key=epic_losses.get)
            issues.append(f"Most losses on {worst} ({epic_losses[worst]} losses)")
            changes[f"reduce_size_{worst}"] = 0.5

        # ── Exit reason breakdown ──
        exit_counts = {}
        for t in losses:
            reason = t.get("exit_reason", "unknown")
            exit_counts[reason] = exit_counts.get(reason, 0) + 1
        if exit_counts:
            main_exit = max(exit_counts, key=exit_counts.get)
            issues.append(f"Main loss exit: {main_exit} ({exit_counts[main_exit]}x)")

        # ── Profit factor ──
        total_wins = sum(t.get("pnl", 0) for t in wins)
        total_losses = abs(sum(t.get("pnl", 0) for t in losses))
        pf = total_wins / total_losses if total_losses > 0 else float('inf')
        issues.append(f"Profit factor: {pf:.2f}")
        if pf < 1.0:
            changes["reduce_global_size"] = 0.7

        # ── Direction bias ──
        buy_wins = sum(1 for t in wins if t.get("direction") == "BUY")
        sell_wins = sum(1 for t in wins if t.get("direction") == "SELL")
        buy_total = sum(1 for t in trades if t.get("direction") == "BUY")
        sell_total = sum(1 for t in trades if t.get("direction") == "SELL")
        if buy_total >= 3 and sell_total >= 3:
            buy_wr = buy_wins / buy_total
            sell_wr = sell_wins / sell_total
            if abs(buy_wr - sell_wr) > 0.25:
                better = "BUY" if buy_wr > sell_wr else "SELL"
                worse = "SELL" if better == "BUY" else "BUY"
                issues.append(f"{better} ({max(buy_wr,sell_wr):.0%}) outperforms {worse} ({min(buy_wr,sell_wr):.0%})")

        priority = "high" if wr < 0.35 or pf < 0.8 else "medium" if wr < 0.50 else "low"

        result = {
            "systemic_issues": issues,
            "recommended_changes": changes,
            "priority": priority,
            "win_rate": wr,
            "profit_factor": pf,
        }

        log.info(f"📊 Batch review: WR={wr:.0%}, PF={pf:.2f}, priority={priority}")
        for issue in issues:
            log.info(f"  🔍 {issue}")

        return result
