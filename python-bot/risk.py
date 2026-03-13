"""Position sizing and risk management."""

from logger_setup import get_logger
import config

log = get_logger("risk")


def calculate_position_size(
    account_balance: float,
    stop_distance: float,
    current_price: float,
) -> float:
    """
    Calculate position size based on risk percentage.
    Risk amount = account_balance × RISK_PER_TRADE
    Size = risk_amount / stop_distance
    """
    if stop_distance <= 0 or current_price <= 0:
        log.warning("Invalid stop_distance or price for sizing")
        return 0.0

    risk_amount = account_balance * config.RISK_PER_TRADE
    size = risk_amount / stop_distance

    # Round down to 2 decimal places
    size = round(size, 2)

    # Minimum size check
    if size < 0.01:
        log.warning(f"Calculated size {size} too small, skipping")
        return 0.0

    log.info(
        f"📊 Size: {size} | Risk: ${risk_amount:.2f} | "
        f"SL distance: {stop_distance:.5f}"
    )
    return size


def can_open_position(open_positions: list, epic: str) -> bool:
    """Check if we can open a new position for this epic."""
    # Don't exceed max open positions
    if len(open_positions) >= config.MAX_OPEN_POSITIONS:
        log.info(f"⛔ Max positions ({config.MAX_OPEN_POSITIONS}) reached")
        return False

    # Don't open duplicate positions on same epic
    for pos in open_positions:
        if pos.get("market", {}).get("epic") == epic:
            log.debug(f"Already have position on {epic}")
            return False

    return True
