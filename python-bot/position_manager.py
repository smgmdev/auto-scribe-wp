"""
Smart Position Manager — Dynamic loss cutting and unlimited profit riding.

Key behaviors:
1. Unlimited TP: no fixed take-profit — let winners run indefinitely
2. Default SL at -1.5% from entry price
3. At +5% profit, SL locks at +5%; at +10% → SL at +10%, etc.
4. SL only moves UP (never backwards)
"""

import time
from logger_setup import get_logger

log = get_logger("pos_mgr")

# Initial SL: 1.5% below entry (default)
INITIAL_SL_PCT = 0.015
# Step size for SL ratcheting: 5% of entry price (default)
PROFIT_STEP_PCT = 0.05

# BTC-specific overrides
BTC_INITIAL_SL_PCT = 0.005   # 0.5% from entry
BTC_PROFIT_STEP_PCT = 0.01   # 1% steps
BTC_EPICS = {"BTCUSD", "BITCOIN", "BTC"}


def _is_btc(epic: str) -> bool:
    """Check if epic is a BTC instrument."""
    upper = epic.upper()
    return any(b in upper for b in BTC_EPICS)


def _get_params(epic: str) -> tuple[float, float]:
    """Return (initial_sl_pct, step_pct) for the given epic."""
    if _is_btc(epic):
        return BTC_INITIAL_SL_PCT, BTC_PROFIT_STEP_PCT
    return INITIAL_SL_PCT, PROFIT_STEP_PCT


def _initial_sl(entry_price: float, direction: str, epic: str = "") -> float:
    """Calculate initial SL from entry."""
    sl_pct, _ = _get_params(epic)
    dist = entry_price * sl_pct
    if direction == "BUY":
        return entry_price - dist  # SL below entry
    else:
        return entry_price + dist  # SL above entry


def _validate_sl(sl_price: float, entry_price: float, direction: str,
                 locked_steps: int) -> float:
    """
    Ensure SL makes sense for the direction and profit level.
    - BUY with 0 steps: SL must be BELOW entry
    - SELL with 0 steps: SL must be ABOVE entry
    - BUY with steps >= 1: SL must be >= entry + (steps * 5%)
    - SELL with steps >= 1: SL must be <= entry - (steps * 5%)
    If invalid, reset to correct value.
    """
    if locked_steps == 0:
        # No profit locked — SL must be on the loss side
        if direction == "BUY" and sl_price >= entry_price:
            corrected = _initial_sl(entry_price, direction)
            log.warning(
                f"⚠️ SL sanity fix: BUY SL {sl_price:.6f} >= entry {entry_price:.6f} "
                f"with 0 steps. Reset to {corrected:.6f}"
            )
            return corrected
        elif direction == "SELL" and sl_price <= entry_price:
            corrected = _initial_sl(entry_price, direction)
            log.warning(
                f"⚠️ SL sanity fix: SELL SL {sl_price:.6f} <= entry {entry_price:.6f} "
                f"with 0 steps. Reset to {corrected:.6f}"
            )
            return corrected
    else:
        # Profit locked — SL should be at locked level
        expected_pnl = locked_steps * entry_price * PROFIT_STEP_PCT
        if direction == "BUY":
            expected_sl = entry_price + expected_pnl
            if sl_price < entry_price:
                log.warning(
                    f"⚠️ SL sanity fix: BUY SL {sl_price:.6f} < entry with "
                    f"{locked_steps} steps locked. Reset to {expected_sl:.6f}"
                )
                return expected_sl
        else:
            expected_sl = entry_price - expected_pnl
            if sl_price > entry_price:
                log.warning(
                    f"⚠️ SL sanity fix: SELL SL {sl_price:.6f} > entry with "
                    f"{locked_steps} steps locked. Reset to {expected_sl:.6f}"
                )
                return expected_sl

    return sl_price


class PositionManager:
    """Manages open positions with dynamic exits."""

    def __init__(self):
        self.tracked: dict[str, dict] = {}

    def track_position(self, deal_id: str, epic: str, direction: str,
                       entry_price: float, stop_distance: float, profit_distance: float,
                       spread: float = 0.0, current_price: float = 0.0,
                       created_date: float = 0.0, category: str = ""):
        """Start tracking a new position."""
        step_size = entry_price * PROFIT_STEP_PCT

        # Always start with default SL at -1.5%
        trailing_stop_price = _initial_sl(entry_price, direction)
        locked_steps = 0

        # Restart recovery: reconstruct locked steps from current price
        if current_price > 0 and entry_price > 0:
            if direction == "BUY":
                pnl = current_price - entry_price
            else:
                pnl = entry_price - current_price

            if pnl > 0 and step_size > 0:
                current_steps = int(pnl / step_size)
                if current_steps >= 1:
                    locked_steps = current_steps
                    lock_level_pnl = current_steps * step_size
                    if direction == "BUY":
                        trailing_stop_price = entry_price + lock_level_pnl
                    else:
                        trailing_stop_price = entry_price - lock_level_pnl
        else:
            pnl = 0.0

        # SANITY CHECK: validate SL makes sense
        trailing_stop_price = _validate_sl(
            trailing_stop_price, entry_price, direction, locked_steps
        )

        entry_time = created_date if created_date > 0 else time.time()

        # Resolve category
        import config as _cfg
        resolved_cat = category if category else _cfg.get_category(epic)

        self.tracked[deal_id] = {
            "epic": epic,
            "direction": direction,
            "entry_price": entry_price,
            "stop_distance": entry_price * INITIAL_SL_PCT,
            "profit_distance": profit_distance,
            "highest_profit": max(pnl, 0.0),
            "lowest_profit": min(pnl, 0.0),
            "entry_time": entry_time,
            "trailing_stop_price": trailing_stop_price,
            "spread": spread,
            "locked_steps": locked_steps,
            "category": resolved_cat,
        }

        recovery_tag = ""
        if current_price > 0:
            recovery_tag = (
                f" | 🔄 RECOVERED: pnl={pnl:.5f} steps={locked_steps} "
                f"trailing_sl={trailing_stop_price:.6f}"
            )

        log.info(
            f"📌 Tracking {direction} {epic} @ {entry_price:.6f} | "
            f"SL={trailing_stop_price:.6f} ({'-1.5%' if locked_steps == 0 else f'+{locked_steps*5}%'}) "
            f"TP=UNLIMITED | Step size={step_size:.6f} (5%){recovery_tag}"
        )

    def untrack(self, deal_id: str):
        """Stop tracking a position."""
        self.tracked.pop(deal_id, None)

    def evaluate_position(self, deal_id: str, current_price: float,
                          tick_history: list[dict], adaptive_params: dict = None) -> dict:
        """
        Evaluate whether a position should be closed.

        SL logic:
        - Default SL = entry -1.5% (BUY) or entry +1.5% (SELL)
        - At +5% profit → SL moves to entry +5%
        - At +10% → SL at +10%, and so on every 5%
        - SL never moves backwards
        - Trade closes when price hits the current SL

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
        step_size = entry * PROFIT_STEP_PCT

        # Calculate unrealized P&L
        if direction == "BUY":
            pnl = current_price - entry
        else:
            pnl = entry - current_price

        pnl_ratio = pnl / step_size if step_size > 0 else 0.0

        # Update watermarks
        pos["highest_profit"] = max(pos["highest_profit"], pnl)
        pos["lowest_profit"] = min(pos["lowest_profit"], pnl)

        result = {
            "action": "HOLD",
            "reason": "",
            "unrealized_pnl": round(pnl, 5),
            "pnl_ratio": round(pnl_ratio, 4),
        }

        # ═══════════════════════════════════════════
        # 1. RATCHET SL UP at every 5% profit step
        # ═══════════════════════════════════════════

        if pnl > 0 and step_size > 0:
            current_steps = int(pnl / step_size)

            if current_steps >= 1 and current_steps > pos["locked_steps"]:
                lock_level_pnl = current_steps * step_size

                if direction == "BUY":
                    new_sl = entry + lock_level_pnl
                else:
                    new_sl = entry - lock_level_pnl

                # SL only moves in profit direction
                should_update = False
                if direction == "BUY" and new_sl > pos["trailing_stop_price"]:
                    should_update = True
                elif direction == "SELL" and new_sl < pos["trailing_stop_price"]:
                    should_update = True

                if should_update:
                    old_sl = pos["trailing_stop_price"]
                    pos["trailing_stop_price"] = new_sl
                    pos["locked_steps"] = current_steps
                    locked_pct = current_steps * 5
                    log.info(
                        f"🔒 {pos['epic']} SL ratcheted! Step {current_steps} "
                        f"(+{locked_pct}% profit) | "
                        f"SL: {old_sl:.6f} → {new_sl:.6f}"
                    )

        # Periodic sanity check on SL
        pos["trailing_stop_price"] = _validate_sl(
            pos["trailing_stop_price"], entry, direction, pos["locked_steps"]
        )

        # ═══════════════════════════════════════════
        # 2. CHECK IF SL IS HIT → close position
        # ═══════════════════════════════════════════

        sl_hit = False
        if direction == "BUY" and current_price <= pos["trailing_stop_price"]:
            sl_hit = True
        elif direction == "SELL" and current_price >= pos["trailing_stop_price"]:
            sl_hit = True

        if sl_hit:
            if pos["locked_steps"] >= 1:
                # Closing in profit (SL was above entry)
                result["action"] = "CLOSE_PROFIT"
                result["reason"] = (
                    f"Trailing SL hit @ {pos['trailing_stop_price']:.6f} | "
                    f"Locked {pos['locked_steps'] * 5}% profit | "
                    f"Peak: {pos['highest_profit']:.5f}"
                )
            else:
                # Closing at initial -1.5% SL
                result["action"] = "CLOSE_LOSS"
                result["reason"] = (
                    f"Initial SL hit @ {pos['trailing_stop_price']:.6f} "
                    f"(-1.5% from entry {entry:.6f})"
                )
            return result

        return result
