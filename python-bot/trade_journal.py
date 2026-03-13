"""
Trade Journal & Adaptive Learning System

Logs every trade and uses historical performance to adapt:
- Momentum thresholds per asset
- SL/TP multipliers based on actual win rates
- Entry timing preferences
- Exit behavior tuning

Stores data in a local JSON file that persists between bot restarts.
"""

import json
import os
import time
from datetime import datetime
from typing import Optional
from logger_setup import get_logger

log = get_logger("journal")

JOURNAL_FILE = os.path.join(os.path.dirname(__file__), "trade_history.json")
PARAMS_FILE = os.path.join(os.path.dirname(__file__), "adaptive_params.json")

# Default parameters that get tuned over time
DEFAULT_PARAMS = {
    "global": {
        "momentum_entry_threshold": 0.6,
        "momentum_exit_threshold": 0.7,
        "early_profit_ratio": 0.5,
        "loss_cut_ratio": 0.5,
        "trailing_activation": 0.4,
        "trailing_distance": 0.3,
        "sl_multiplier": 2.0,
        "tp_multiplier": 3.0,
    }
}


class TradeJournal:
    def __init__(self):
        self.trades: list[dict] = []
        self.adaptive_params: dict = {}
        self._load()

    def _load(self):
        """Load trade history and adaptive params from disk."""
        if os.path.exists(JOURNAL_FILE):
            try:
                with open(JOURNAL_FILE, "r") as f:
                    self.trades = json.load(f)
                log.info(f"📖 Loaded {len(self.trades)} historical trades")
            except Exception as e:
                log.warning(f"Could not load journal: {e}")
                self.trades = []

        if os.path.exists(PARAMS_FILE):
            try:
                with open(PARAMS_FILE, "r") as f:
                    self.adaptive_params = json.load(f)
                log.info(f"🧠 Loaded adaptive params for {len(self.adaptive_params)} assets")
            except Exception as e:
                log.warning(f"Could not load params: {e}")
                self.adaptive_params = {}

        if not self.adaptive_params:
            self.adaptive_params = dict(DEFAULT_PARAMS)

    def _save(self):
        """Persist to disk."""
        try:
            with open(JOURNAL_FILE, "w") as f:
                json.dump(self.trades[-500:], f, indent=2)  # Keep last 500 trades
            with open(PARAMS_FILE, "w") as f:
                json.dump(self.adaptive_params, f, indent=2)
        except Exception as e:
            log.error(f"Failed to save journal: {e}")

    def log_trade(self, trade: dict):
        """
        Log a completed trade.

        trade = {
            "epic": str,
            "direction": "BUY" | "SELL",
            "entry_price": float,
            "exit_price": float,
            "pnl": float,  # in price units
            "pnl_pct": float,  # % of entry price
            "size": float,
            "entry_reason": str,
            "exit_reason": str,
            "duration_seconds": float,
            "momentum_at_entry": float,
            "momentum_at_exit": float,
            "rsi_at_entry": float,
            "stop_distance": float,
            "profit_distance": float,
            "hit_tp": bool,
            "hit_sl": bool,
            "early_exit": bool,
            "timestamp": str,
        }
        """
        trade["timestamp"] = datetime.utcnow().isoformat()
        trade["won"] = trade.get("pnl", 0) > 0
        self.trades.append(trade)

        emoji = "💚" if trade["won"] else "💔"
        log.info(
            f"{emoji} Trade logged: {trade['direction']} {trade['epic']} | "
            f"P&L: {trade['pnl']:.5f} ({trade.get('pnl_pct', 0):.2f}%) | "
            f"Exit: {trade.get('exit_reason', '?')} | Duration: {trade.get('duration_seconds', 0):.0f}s"
        )

        self._save()

        # Re-learn after every trade
        self._adapt(trade["epic"])

    def _adapt(self, epic: str):
        """
        Analyze recent trades for this epic and adjust parameters.
        This is the 'learning' loop.
        """
        # Get last 20 trades for this epic
        epic_trades = [t for t in self.trades if t.get("epic") == epic][-20:]
        all_recent = self.trades[-50:]  # Last 50 trades across all epics

        if len(epic_trades) < 3:
            return  # Need at least 3 trades to learn

        # Initialize epic params from global if not exists
        if epic not in self.adaptive_params:
            self.adaptive_params[epic] = dict(self.adaptive_params.get("global", DEFAULT_PARAMS["global"]))

        params = self.adaptive_params[epic]

        # --- Win rate analysis ---
        wins = sum(1 for t in epic_trades if t.get("won"))
        win_rate = wins / len(epic_trades)

        # --- Analyze early exits ---
        early_exits = [t for t in epic_trades if t.get("early_exit")]
        early_exit_wins = sum(1 for t in early_exits if t.get("won"))
        early_exit_rate = early_exit_wins / len(early_exits) if early_exits else 0.5

        # --- Average winning vs losing trade duration ---
        winning_durations = [t.get("duration_seconds", 0) for t in epic_trades if t.get("won")]
        losing_durations = [t.get("duration_seconds", 0) for t in epic_trades if not t.get("won")]

        avg_win_dur = sum(winning_durations) / len(winning_durations) if winning_durations else 300
        avg_loss_dur = sum(losing_durations) / len(losing_durations) if losing_durations else 300

        # --- Average P&L ratio achieved ---
        pnl_ratios = [t.get("pnl", 0) / t.get("profit_distance", 1) for t in epic_trades
                      if t.get("profit_distance", 0) > 0]
        avg_pnl_ratio = sum(pnl_ratios) / len(pnl_ratios) if pnl_ratios else 0.0

        # ═══════════════════════════════════════
        # LEARNING RULES
        # ═══════════════════════════════════════

        log.info(f"🧠 Learning for {epic}: win_rate={win_rate:.0%}, avg_pnl_ratio={avg_pnl_ratio:.2f}, "
                 f"trades={len(epic_trades)}")

        # 1. If win rate is low, tighten loss cuts
        if win_rate < 0.4:
            params["loss_cut_ratio"] = max(0.3, params["loss_cut_ratio"] - 0.05)
            params["momentum_entry_threshold"] = min(0.8, params["momentum_entry_threshold"] + 0.05)
            log.info(f"  → Tightened loss cut to {params['loss_cut_ratio']:.2f}, "
                     f"entry threshold to {params['momentum_entry_threshold']:.2f}")

        # 2. If win rate is high, can be slightly more aggressive
        if win_rate > 0.65:
            params["loss_cut_ratio"] = min(0.6, params["loss_cut_ratio"] + 0.03)
            params["momentum_entry_threshold"] = max(0.5, params["momentum_entry_threshold"] - 0.03)
            log.info(f"  → Relaxed loss cut to {params['loss_cut_ratio']:.2f}")

        # 3. If trades rarely reach TP, lower the early profit threshold
        tp_hits = sum(1 for t in epic_trades if t.get("hit_tp"))
        if len(epic_trades) >= 5 and tp_hits / len(epic_trades) < 0.2:
            params["early_profit_ratio"] = max(0.3, params["early_profit_ratio"] - 0.05)
            params["tp_multiplier"] = max(1.5, params["tp_multiplier"] - 0.2)
            log.info(f"  → Lowered early profit to {params['early_profit_ratio']:.2f}, "
                     f"TP mult to {params['tp_multiplier']:.1f}")

        # 4. If early exits are consistently profitable, keep doing them
        if early_exit_rate > 0.7 and len(early_exits) >= 3:
            params["early_profit_ratio"] = max(0.3, params["early_profit_ratio"] - 0.03)
            log.info(f"  → Early exits working ({early_exit_rate:.0%} win rate), "
                     f"threshold now {params['early_profit_ratio']:.2f}")

        # 5. If early exits are losing money, raise the threshold
        if early_exit_rate < 0.4 and len(early_exits) >= 3:
            params["early_profit_ratio"] = min(0.7, params["early_profit_ratio"] + 0.05)
            log.info(f"  → Early exits failing, raised threshold to {params['early_profit_ratio']:.2f}")

        # 6. Adjust SL multiplier based on average loss size
        sl_hits = [t for t in epic_trades if t.get("hit_sl")]
        if len(sl_hits) >= 3:
            # If SL is getting hit too often, widen it slightly
            sl_hit_rate = len(sl_hits) / len(epic_trades)
            if sl_hit_rate > 0.4:
                params["sl_multiplier"] = min(3.0, params["sl_multiplier"] + 0.1)
                log.info(f"  → SL hit rate {sl_hit_rate:.0%}, widened to {params['sl_multiplier']:.1f}x ATR")

        # 7. Trailing stop tuning
        trail_exits = [t for t in epic_trades if "trailing" in t.get("exit_reason", "").lower()]
        if trail_exits:
            trail_win_rate = sum(1 for t in trail_exits if t["won"]) / len(trail_exits)
            if trail_win_rate < 0.5:
                params["trailing_distance"] = min(0.5, params["trailing_distance"] + 0.05)
                log.info(f"  → Trailing stops too tight, relaxed to {params['trailing_distance']:.2f}")

        # Clamp all values to sane ranges
        params["loss_cut_ratio"] = max(0.2, min(0.7, params["loss_cut_ratio"]))
        params["early_profit_ratio"] = max(0.25, min(0.75, params["early_profit_ratio"]))
        params["momentum_entry_threshold"] = max(0.4, min(0.9, params["momentum_entry_threshold"]))
        params["sl_multiplier"] = max(1.0, min(4.0, params["sl_multiplier"]))
        params["tp_multiplier"] = max(1.2, min(5.0, params["tp_multiplier"]))
        params["trailing_activation"] = max(0.2, min(0.6, params["trailing_activation"]))
        params["trailing_distance"] = max(0.15, min(0.5, params["trailing_distance"]))

        self.adaptive_params[epic] = params
        self._save()

    def get_params(self, epic: str) -> dict:
        """Get adaptive parameters for an epic (falls back to global)."""
        if epic in self.adaptive_params:
            return self.adaptive_params[epic]
        return self.adaptive_params.get("global", DEFAULT_PARAMS["global"])

    def get_stats(self, epic: str = None) -> dict:
        """Get trading statistics."""
        trades = self.trades
        if epic:
            trades = [t for t in trades if t.get("epic") == epic]

        if not trades:
            return {"total": 0, "win_rate": 0.0}

        wins = sum(1 for t in trades if t.get("won"))
        total_pnl = sum(t.get("pnl", 0) for t in trades)

        return {
            "total": len(trades),
            "wins": wins,
            "losses": len(trades) - wins,
            "win_rate": wins / len(trades),
            "total_pnl": round(total_pnl, 5),
            "avg_duration": sum(t.get("duration_seconds", 0) for t in trades) / len(trades),
        }
