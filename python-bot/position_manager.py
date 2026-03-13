"""
Smart Position Manager — Dynamic loss cutting and profit protection.

Key behaviors:
1. Trailing stop: moves stop-loss in profit direction as price moves favorably
2. Early profit taking: if momentum fades while in profit, close before TP
3. Smart loss cutting: if trade goes negative and momentum confirms reversal, exit early
4. Break-even protection: move SL to entry once sufficient profit is reached
"""

import time
from logger_setup import get_logger
from strategy import tick_momentum, compute_rsi
import numpy as np

log = get_logger("pos_mgr")


class PositionManager:
    """Manages open positions with dynamic exits."""

    def __init__(self):
        # Track each position's state
        # deal_id -> {entry_price, direction, epic, stop_distance, profit_distance,
        #             highest_profit, lowest_profit, entry_time, break_even_set}
        self.tracked: dict[str, dict] = {}

    def track_position(self, deal_id: str, epic: str, direction: str,
                       entry_price: float, stop_distance: float, profit_distance: float):
        """Start tracking a new position."""
        self.tracked[deal_id] = {
            "epic": epic,
            "direction": direction,
            "entry_price": entry_price,
            "stop_distance": stop_distance,
            "profit_distance": profit_distance,
            "highest_profit": 0.0,
            "lowest_profit": 0.0,
            "entry_time": time.time(),
            "break_even_set": False,
            "trailing_stop_price": None,
        }
        log.info(f"📌 Tracking {direction} {epic} @ {entry_price:.5f} | SL={stop_distance:.5f} TP={profit_distance:.5f}")

    def untrack(self, deal_id: str):
        """Stop tracking a position."""
        self.tracked.pop(deal_id, None)

    def evaluate_position(self, deal_id: str, current_price: float,
                          tick_history: list[dict], adaptive_params: dict = None) -> dict:
        """
        Evaluate whether a position should be closed early.

        Returns:
            {
                "action": "HOLD" | "CLOSE_PROFIT" | "CLOSE_LOSS" | "TRAIL_STOP",
                "reason": str,
                "unrealized_pnl": float,  # in price units
                "pnl_ratio": float,  # ratio of profit distance achieved
            }
        """
        pos = self.tracked.get(deal_id)
        if not pos:
            return {"action": "HOLD", "reason": "Not tracked"}

        direction = pos["direction"]
        entry = pos["entry_price"]
        stop_dist = pos["stop_distance"]
        profit_dist = pos["profit_distance"]

        # Calculate unrealized P&L
        if direction == "BUY":
            pnl = current_price - entry
        else:
            pnl = entry - current_price

        pnl_ratio = pnl / profit_dist if profit_dist > 0 else 0.0

        # Update high/low watermarks
        pos["highest_profit"] = max(pos["highest_profit"], pnl)
        pos["lowest_profit"] = min(pos["lowest_profit"], pnl)

        # Adaptive thresholds from learning
        params = adaptive_params or {}
        profit_take_threshold = params.get("early_profit_ratio", 0.5)  # Take profit at 50% of TP
        loss_cut_threshold = params.get("loss_cut_ratio", 0.5)  # Cut at 50% of SL
        trailing_activation = params.get("trailing_activation", 0.4)  # Activate trailing at 40% of TP
        trailing_distance_ratio = params.get("trailing_distance", 0.3)  # Trail at 30% of max profit

        # --- Get momentum context ---
        momentum = {"direction": "FLAT", "strength": 0.0, "micro_rsi": 50.0}
        if tick_history and len(tick_history) >= 10:
            momentum = tick_momentum(tick_history)

        result = {
            "action": "HOLD",
            "reason": "",
            "unrealized_pnl": round(pnl, 5),
            "pnl_ratio": round(pnl_ratio, 4),
        }

        time_held = time.time() - pos["entry_time"]

        # ═══════════════════════════════════════════
        # 1. SMART LOSS CUTTING
        # ═══════════════════════════════════════════

        if pnl < 0:
            loss_ratio = abs(pnl) / stop_dist if stop_dist > 0 else 0

            # If loss > 50% of SL AND momentum confirms reversal → cut early
            if loss_ratio >= loss_cut_threshold:
                momentum_against = False
                if direction == "BUY" and momentum["direction"] == "DOWN" and momentum["strength"] >= 0.5:
                    momentum_against = True
                elif direction == "SELL" and momentum["direction"] == "UP" and momentum["strength"] >= 0.5:
                    momentum_against = True

                if momentum_against:
                    result["action"] = "CLOSE_LOSS"
                    result["reason"] = (
                        f"Smart loss cut: {loss_ratio:.0%} of SL used, "
                        f"momentum reversed ({momentum['direction']} str={momentum['strength']:.2f})"
                    )
                    return result

            # If loss > 70% of SL regardless of momentum → cut to preserve capital
            if loss_ratio >= 0.7:
                result["action"] = "CLOSE_LOSS"
                result["reason"] = f"Capital protection: {loss_ratio:.0%} of SL consumed"
                return result

            # Time-based loss cut: if losing after 5+ minutes with no recovery
            if time_held > 300 and loss_ratio > 0.3 and pos["highest_profit"] <= 0:
                result["action"] = "CLOSE_LOSS"
                result["reason"] = f"Stale losing trade ({time_held/60:.0f}min, never profitable)"
                return result

        # ═══════════════════════════════════════════
        # 2. PROFIT PROTECTION & EARLY TAKE-PROFIT
        # ═══════════════════════════════════════════

        if pnl > 0:
            # --- Break-even protection ---
            if pnl_ratio >= 0.3 and not pos["break_even_set"]:
                pos["break_even_set"] = True
                if direction == "BUY":
                    pos["trailing_stop_price"] = entry + (stop_dist * 0.1)  # Slight buffer above entry
                else:
                    pos["trailing_stop_price"] = entry - (stop_dist * 0.1)
                log.info(f"🛡️ {pos['epic']} break-even stop set @ {pos['trailing_stop_price']:.5f}")

            # --- Trailing stop activation ---
            if pnl_ratio >= trailing_activation:
                max_profit = pos["highest_profit"]
                trail_dist = max_profit * trailing_distance_ratio

                if direction == "BUY":
                    new_trail = current_price - trail_dist
                    if pos["trailing_stop_price"] is None or new_trail > pos["trailing_stop_price"]:
                        pos["trailing_stop_price"] = new_trail
                else:
                    new_trail = current_price + trail_dist
                    if pos["trailing_stop_price"] is None or new_trail < pos["trailing_stop_price"]:
                        pos["trailing_stop_price"] = new_trail

            # --- Check trailing stop hit ---
            if pos["trailing_stop_price"] is not None:
                trail_hit = False
                if direction == "BUY" and current_price <= pos["trailing_stop_price"]:
                    trail_hit = True
                elif direction == "SELL" and current_price >= pos["trailing_stop_price"]:
                    trail_hit = True

                if trail_hit:
                    result["action"] = "CLOSE_PROFIT"
                    result["reason"] = (
                        f"Trailing stop hit @ {pos['trailing_stop_price']:.5f} "
                        f"(peak profit: {pos['highest_profit']:.5f}, captured: {pnl:.5f})"
                    )
                    return result

            # --- Early profit taking: momentum fading while in profit ---
            if pnl_ratio >= profit_take_threshold:
                momentum_fading = False

                if direction == "BUY":
                    # RSI overbought or momentum turning down
                    if momentum.get("micro_rsi", 50) > 75:
                        momentum_fading = True
                    if momentum["direction"] == "DOWN" and momentum["strength"] >= 0.4:
                        momentum_fading = True
                elif direction == "SELL":
                    if momentum.get("micro_rsi", 50) < 25:
                        momentum_fading = True
                    if momentum["direction"] == "UP" and momentum["strength"] >= 0.4:
                        momentum_fading = True

                # Also check if profit is retracing from peak
                if pos["highest_profit"] > 0:
                    retrace_ratio = (pos["highest_profit"] - pnl) / pos["highest_profit"]
                    if retrace_ratio > 0.4:  # Gave back 40% of max profit
                        momentum_fading = True

                if momentum_fading:
                    result["action"] = "CLOSE_PROFIT"
                    result["reason"] = (
                        f"Early profit take: {pnl_ratio:.0%} of TP, "
                        f"momentum fading ({momentum['direction']} RSI={momentum.get('micro_rsi', 50):.0f})"
                    )
                    return result

            # --- High profit lock: if we've reached 80%+ of TP, tighten everything ---
            if pnl_ratio >= 0.8:
                # At this point, any momentum hesitation = take profit
                if momentum["strength"] < 0.4:
                    result["action"] = "CLOSE_PROFIT"
                    result["reason"] = f"Near-TP profit lock: {pnl_ratio:.0%} with weak momentum"
                    return result

        return result
