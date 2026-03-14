"""
Fee-aware trailing SL manager.

Rules:
1. Default SL = -1.5% from entry
2. First lock: SL moves to +1% ONLY when net profit after fees >= 1%
   (price must move ~1% + round-trip fees before first lock)
3. Subsequent locks: every +1% price move above last lock, SL ratchets up
4. SL never moves backwards
5. When SL is hit → close the trade
"""

from typing import Dict, Optional
from logger_setup import get_logger
import config

log = get_logger("pos_mgr")


class TrackedPosition:
    def __init__(
        self,
        symbol,       # type: str
        side,         # type: str  # "Buy" or "Sell"
        entry_price,  # type: float
        size,         # type: float
    ):
        self.symbol = symbol
        self.side = side
        self.entry_price = entry_price
        self.size = size
        self.locked_steps = 0  # how many 1% steps locked
        self.highest_price = entry_price  # watermark
        self.lowest_price = entry_price   # watermark (for shorts)

        # Calculate fee-aware thresholds
        fee_pct = config.ROUND_TRIP_FEE_PCT  # ~0.11%
        step_pct = config.TRAILING_STEP_PCT   # 1%
        sl_pct = config.INITIAL_SL_PCT         # 1.5%

        # First lock requires: 1% net profit + fees
        self.first_lock_pct = step_pct + fee_pct  # ~1.11%
        # Subsequent locks: just 1% above last lock
        self.step_pct = step_pct

        # Initial SL
        if side == "Buy":
            self.sl_price = entry_price * (1 - sl_pct)
        else:
            self.sl_price = entry_price * (1 + sl_pct)

        log.info(
            f"📌 Tracking {side} {symbol} @ {entry_price:.4f} | "
            f"SL={self.sl_price:.4f} (-{sl_pct*100}%) | "
            f"First lock at +{self.first_lock_pct*100:.2f}% (fee-adjusted)"
        )


class PositionManager:
    def __init__(self):
        self.positions = {}  # type: Dict[str, TrackedPosition]

    def track(self, symbol, side, entry_price, size):
        # type: (str, str, float, float) -> TrackedPosition
        pos = TrackedPosition(symbol, side, entry_price, size)
        self.positions[symbol] = pos
        return pos

    def untrack(self, symbol):
        # type: (str) -> None
        self.positions.pop(symbol, None)

    def evaluate(self, symbol, current_price):
        # type: (str, float) -> Dict
        """
        Evaluate position. Returns:
            {"action": "HOLD"|"CLOSE", "reason": str, "new_sl": float|None}
        """
        pos = self.positions.get(symbol)
        if not pos:
            return {"action": "HOLD", "reason": "Not tracked", "new_sl": None}

        entry = pos.entry_price
        side = pos.side

        # Calculate P&L percentage
        if side == "Buy":
            pnl_pct = (current_price - entry) / entry
            pos.highest_price = max(pos.highest_price, current_price)
        else:
            pnl_pct = (entry - current_price) / entry
            pos.lowest_price = min(pos.lowest_price, current_price)

        result = {
            "action": "HOLD",
            "reason": "",
            "new_sl": None,
            "pnl_pct": round(pnl_pct * 100, 3),
        }

        # ── RATCHET SL ──
        sl_updated = False

        if pos.locked_steps == 0:
            # First lock: need net profit >= 1% after fees
            if pnl_pct >= pos.first_lock_pct:
                pos.locked_steps = 1
                # Set SL to entry + 1% (locking 1% net profit)
                if side == "Buy":
                    new_sl = entry * (1 + pos.step_pct)
                else:
                    new_sl = entry * (1 - pos.step_pct)
                pos.sl_price = new_sl
                sl_updated = True
                log.info(
                    f"🔒 {symbol} FIRST LOCK! +{pnl_pct*100:.2f}% (after fees) | "
                    f"SL → {new_sl:.4f} (+{pos.step_pct*100:.0f}%)"
                )
        else:
            # Subsequent locks: every 1% above last lock level
            # Last lock was at: entry + (locked_steps * step_pct) for buys
            if side == "Buy":
                last_lock_price = entry * (1 + pos.locked_steps * pos.step_pct)
                next_lock_price = entry * (1 + (pos.locked_steps + 1) * pos.step_pct)
                # For first step, we already added fee buffer, so subsequent
                # steps are measured from pure price movement
                # But we need to account for the fee offset on step 1
                # Step 1 locked at entry*(1+step_pct), actual price was at entry*(1+first_lock_pct)
                # Step 2+ locks when price reaches next_lock_price + remaining fee offset from step 1
                # Actually simpler: just check raw price vs next step level + fee offset from step 1 only
                fee_offset = entry * config.ROUND_TRIP_FEE_PCT
                required_price = next_lock_price + fee_offset
                if current_price >= required_price:
                    pos.locked_steps += 1
                    new_sl = entry * (1 + pos.locked_steps * pos.step_pct)
                    pos.sl_price = new_sl
                    sl_updated = True
                    log.info(
                        f"🔒 {symbol} Step {pos.locked_steps} locked! "
                        f"+{pnl_pct*100:.2f}% | SL → {new_sl:.4f}"
                    )
            else:
                last_lock_price = entry * (1 - pos.locked_steps * pos.step_pct)
                next_lock_price = entry * (1 - (pos.locked_steps + 1) * pos.step_pct)
                fee_offset = entry * config.ROUND_TRIP_FEE_PCT
                required_price = next_lock_price - fee_offset
                if current_price <= required_price:
                    pos.locked_steps += 1
                    new_sl = entry * (1 - pos.locked_steps * pos.step_pct)
                    pos.sl_price = new_sl
                    sl_updated = True
                    log.info(
                        f"🔒 {symbol} Step {pos.locked_steps} locked! "
                        f"+{pnl_pct*100:.2f}% | SL → {new_sl:.4f}"
                    )

        if sl_updated:
            result["new_sl"] = pos.sl_price

        # ── CHECK SL HIT ──
        sl_hit = False
        if side == "Buy" and current_price <= pos.sl_price:
            sl_hit = True
        elif side == "Sell" and current_price >= pos.sl_price:
            sl_hit = True

        if sl_hit:
            if pos.locked_steps >= 1:
                result["action"] = "CLOSE"
                result["reason"] = (
                    f"Trailing SL hit @ {pos.sl_price:.4f} | "
                    f"Locked {pos.locked_steps}% profit"
                )
            else:
                result["action"] = "CLOSE"
                result["reason"] = (
                    f"Initial SL hit @ {pos.sl_price:.4f} (-1.5%)"
                )
            return result

        return result

    def recover_position(self, symbol, side, entry_price, size, current_price):
        # type: (str, str, float, float, float) -> None
        """Reconstruct tracking state for an existing position on restart."""
        pos = self.track(symbol, side, entry_price, size)

        # Calculate current P&L to reconstruct locked steps
        if side == "Buy":
            pnl_pct = (current_price - entry_price) / entry_price
        else:
            pnl_pct = (entry_price - current_price) / entry_price

        if pnl_pct >= pos.first_lock_pct:
            # At least first step locked
            # How many full steps after fees?
            net_pnl = pnl_pct - config.ROUND_TRIP_FEE_PCT
            steps = int(net_pnl / pos.step_pct)
            if steps >= 1:
                pos.locked_steps = steps
                if side == "Buy":
                    pos.sl_price = entry_price * (1 + steps * pos.step_pct)
                else:
                    pos.sl_price = entry_price * (1 - steps * pos.step_pct)
                log.info(
                    f"🔄 RECOVERED {symbol} | Steps={steps} | "
                    f"SL={pos.sl_price:.4f} | P&L={pnl_pct*100:.2f}%"
                )
