"""
Smart Position Manager — Dynamic loss cutting and unlimited profit riding.

Key behaviors:
1. Unlimited TP: no fixed take-profit — let winners run indefinitely
2. 5% step trailing SL: every 5% price growth, lock in profit with new SL
3. Fee-aware first SL: first profit SL covers trading fees (spread × 2)
4. Smart loss cutting: exit early if momentum confirms reversal while losing
"""

import time
from logger_setup import get_logger
from strategy import tick_momentum, compute_rsi
import numpy as np

log = get_logger("pos_mgr")

# Step size for SL ratcheting (5% of entry price)
PROFIT_STEP_PCT = 0.05


class PositionManager:
    """Manages open positions with dynamic exits."""

    def __init__(self):
        self.tracked: dict[str, dict] = {}

    def track_position(self, deal_id: str, epic: str, direction: str,
                       entry_price: float, stop_distance: float, profit_distance: float,
                       spread: float = 0.0, current_price: float = 0.0,
                       created_date: float = 0.0):
        """Start tracking a new position.
        
        Args:
            spread: bid-ask spread at entry time. Capital.com fee = spread.
            profit_distance: kept for compatibility but ignored — TP is unlimited.
            current_price: if provided, reconstructs profit state (for restart recovery).
            created_date: Unix timestamp of when the position was originally opened.
        """
        fee_cost = spread * 2 if spread > 0 else entry_price * 0.0002
        step_size = entry_price * PROFIT_STEP_PCT

        # Calculate current P&L if we have a live price (restart recovery)
        if current_price > 0 and entry_price > 0:
            if direction == "BUY":
                pnl = current_price - entry_price
            else:
                pnl = entry_price - current_price
        else:
            pnl = 0.0

        # Reconstruct profit-step state from current P&L
        break_even_set = False
        trailing_stop_price = None
        locked_steps = 0

        if pnl > fee_cost and step_size > 0:
            net_pnl = pnl - fee_cost
            if net_pnl > 0:
                break_even_set = True
                current_steps = int(pnl / step_size)
                locked_steps = current_steps

                if current_steps >= 1:
                    # Lock at (steps - 1) * step_size, but never below fee breakeven
                    lock_level_pnl = max((current_steps - 1) * step_size, fee_cost * 1.5)
                    if direction == "BUY":
                        trailing_stop_price = entry_price + lock_level_pnl
                    else:
                        trailing_stop_price = entry_price - lock_level_pnl
                else:
                    # First profit SL: just above fees
                    fee_buffer = fee_cost * 1.5
                    if direction == "BUY":
                        trailing_stop_price = entry_price + fee_buffer
                    else:
                        trailing_stop_price = entry_price - fee_buffer

        entry_time = created_date if created_date > 0 else time.time()

        self.tracked[deal_id] = {
            "epic": epic,
            "direction": direction,
            "entry_price": entry_price,
            "stop_distance": stop_distance,
            "profit_distance": profit_distance,
            "highest_profit": max(pnl, 0.0),
            "lowest_profit": min(pnl, 0.0),
            "entry_time": entry_time,
            "break_even_set": break_even_set,
            "trailing_stop_price": trailing_stop_price,
            "spread": spread,
            "fee_cost": fee_cost,
            "locked_steps": locked_steps,
        }

        recovery_tag = ""
        if current_price > 0:
            recovery_tag = (
                f" | 🔄 RECOVERED: pnl={pnl:.5f} steps={locked_steps} "
                f"trailing_sl={trailing_stop_price}"
            )

        log.info(
            f"📌 Tracking {direction} {epic} @ {entry_price:.5f} | "
            f"SL={stop_distance:.5f} TP=UNLIMITED | "
            f"Spread={spread:.5f} Fee={fee_cost:.5f} | "
            f"Step size={step_size:.5f} (5%){recovery_tag}"
        )

    def untrack(self, deal_id: str):
        """Stop tracking a position."""
        self.tracked.pop(deal_id, None)

    def evaluate_position(self, deal_id: str, current_price: float,
                          tick_history: list[dict], adaptive_params: dict = None) -> dict:
        """
        Evaluate whether a position should be closed early.

        Unlimited TP strategy:
        - No fixed TP — the trade runs as long as price keeps moving favorably
        - Every 5% of price growth from entry, SL ratchets up to lock that level
        - First SL is set at entry + fees (guarantees net profit)
        - SL only moves UP (BUY) or DOWN (SELL), never backwards
        - Trade closes only when price drops back to hit the trailing SL

        Returns:
            {
                "action": "HOLD" | "CLOSE_PROFIT" | "CLOSE_LOSS",
                "reason": str,
                "unrealized_pnl": float,
                "pnl_ratio": float,
            }
        """
        pos = self.tracked.get(deal_id)
        if not pos:
            return {"action": "HOLD", "reason": "Not tracked"}

        direction = pos["direction"]
        entry = pos["entry_price"]
        stop_dist = pos["stop_distance"]
        fee_cost = pos.get("fee_cost", 0)
        step_size = entry * PROFIT_STEP_PCT  # 5% of entry price

        # Calculate unrealized P&L
        if direction == "BUY":
            pnl = current_price - entry
        else:
            pnl = entry - current_price

        # pnl_ratio uses step_size as reference (since TP is unlimited)
        pnl_ratio = pnl / step_size if step_size > 0 else 0.0

        # Update watermarks
        pos["highest_profit"] = max(pos["highest_profit"], pnl)
        pos["lowest_profit"] = min(pos["lowest_profit"], pnl)

        # Adaptive thresholds
        params = adaptive_params or {}
        loss_cut_threshold = params.get("loss_cut_ratio", 0.5)

        # Momentum context
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

            if loss_ratio >= 0.7:
                result["action"] = "CLOSE_LOSS"
                result["reason"] = f"Capital protection: {loss_ratio:.0%} of SL consumed"
                return result

            if time_held > 300 and loss_ratio > 0.3 and pos["highest_profit"] <= 0:
                result["action"] = "CLOSE_LOSS"
                result["reason"] = f"Stale losing trade ({time_held/60:.0f}min, never profitable)"
                return result

        # ═══════════════════════════════════════════
        # 2. UNLIMITED TP — 5% STEP TRAILING SL
        # ═══════════════════════════════════════════

        if pnl > 0:
            net_pnl = pnl - fee_cost

            # --- Step 1: Fee-aware first SL (set once when net profitable) ---
            if net_pnl > 0 and not pos["break_even_set"]:
                pos["break_even_set"] = True
                pos["locked_steps"] = 0
                # First SL = entry + fees + small buffer (covers round-trip spread)
                fee_buffer = fee_cost * 1.5  # 50% margin above fees
                if direction == "BUY":
                    pos["trailing_stop_price"] = entry + fee_buffer
                else:
                    pos["trailing_stop_price"] = entry - fee_buffer
                log.info(
                    f"🛡️ {pos['epic']} FIRST profit SL @ {pos['trailing_stop_price']:.5f} "
                    f"(entry={entry:.5f} + fee_buffer={fee_buffer:.5f})"
                )

            # --- Step 2: 5% step ratcheting — lock every 5% of growth ---
            if net_pnl > 0:
                # How many full 5% steps has the price moved from entry?
                current_steps = int(pnl / step_size)

                if current_steps > pos["locked_steps"]:
                    # Lock profit AT the current step level
                    # If price is at +10%, SL locks at +10% (no breathing room)
                    lock_level_pnl = current_steps * step_size

                    # But never below fee-breakeven
                    lock_level_pnl = max(lock_level_pnl, fee_cost * 1.5)

                    if direction == "BUY":
                        new_sl = entry + lock_level_pnl
                    else:
                        new_sl = entry - lock_level_pnl

                    # SL only moves in profit direction, never backwards
                    should_update = False
                    if pos["trailing_stop_price"] is None:
                        should_update = True
                    elif direction == "BUY" and new_sl > pos["trailing_stop_price"]:
                        should_update = True
                    elif direction == "SELL" and new_sl < pos["trailing_stop_price"]:
                        should_update = True

                    if should_update:
                        old_sl = pos["trailing_stop_price"]
                        pos["trailing_stop_price"] = new_sl
                        pos["locked_steps"] = current_steps
                        locked_pct = (lock_level_pnl / entry) * 100
                        log.info(
                            f"🔒 {pos['epic']} SL stepped up! Step {current_steps} "
                            f"({current_steps * 5}% growth) | "
                            f"SL: {old_sl:.5f} → {new_sl:.5f} "
                            f"(locking {locked_pct:.2f}% profit)"
                        )

            # --- Step 3: Check if trailing SL is hit → close with profit ---
            if pos["trailing_stop_price"] is not None:
                trail_hit = False
                if direction == "BUY" and current_price <= pos["trailing_stop_price"]:
                    trail_hit = True
                elif direction == "SELL" and current_price >= pos["trailing_stop_price"]:
                    trail_hit = True

                if trail_hit:
                    locked_profit = abs(pos["trailing_stop_price"] - entry)
                    net_locked = locked_profit - fee_cost
                    result["action"] = "CLOSE_PROFIT"
                    result["reason"] = (
                        f"Trailing SL hit @ {pos['trailing_stop_price']:.5f} | "
                        f"Steps locked: {pos['locked_steps']} ({pos['locked_steps'] * 5}% growth) | "
                        f"Peak: {pos['highest_profit']:.5f} | "
                        f"Net profit: {net_locked:.5f}"
                    )
                    return result

        return result
