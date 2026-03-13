"""Position sizing and risk management with per-category limits."""

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


def count_positions_by_category(open_positions: list) -> dict[str, int]:
    """Count open positions per category."""
    counts = {
        config.CATEGORY_STOCKS: 0,
        config.CATEGORY_CRYPTO: 0,
        config.CATEGORY_COMMODITIES: 0,
        config.CATEGORY_FOREX: 0,
    }
    for pos in open_positions:
        epic = pos.get("market", {}).get("epic", "")
        cat = config.get_category(epic)
        if cat in counts:
            counts[cat] += 1
    return counts


def can_open_position(open_positions: list, epic: str) -> bool:
    """Check if we can open a new position for this epic (respects per-category limits)."""
    # Don't exceed global max
    if len(open_positions) >= config.MAX_OPEN_POSITIONS:
        log.info(f"⛔ Global max positions ({config.MAX_OPEN_POSITIONS}) reached")
        return False

    # Don't open duplicate positions on same epic
    for pos in open_positions:
        if pos.get("market", {}).get("epic") == epic:
            log.debug(f"Already have position on {epic}")
            return False

    # Per-category limit
    category = config.get_category(epic)
    counts = count_positions_by_category(open_positions)
    cat_count = counts.get(category, 0)

    if cat_count >= config.MAX_POSITIONS_PER_CATEGORY:
        log.info(f"⛔ {category} limit ({config.MAX_POSITIONS_PER_CATEGORY}) reached ({cat_count} open)")
        return False

    return True
