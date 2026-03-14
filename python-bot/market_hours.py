"""
Market Hours Detection — determines which asset categories are currently tradeable.

Capital.com trading hours (approximate, in UTC):
- Crypto: 24/7 (always open)
- Forex: Sunday 21:00 UTC → Friday 22:00 UTC (closed Sat & most of Sun)
- Stocks (US): Mon–Fri ~14:30–21:00 UTC (extended hours ~09:00–22:00 on Capital.com)
- Commodities: Mon–Fri with varying hours per instrument
  Gold/Silver: Sun 23:00 → Fri 22:00 (with daily 1h break ~22:00–23:00)
  Oil: Mon 00:00 → Fri 22:00 (with daily 1h break ~22:00–23:00)

For simplicity we use conservative windows. Capital.com's actual hours may vary
slightly; the bot will still get rejected by the API if a market is truly closed,
but this pre-filter avoids wasting API calls on closed markets.
"""

from datetime import datetime, timezone
from typing import Set

from logger_setup import get_logger
import config

log = get_logger("market_hours")


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def is_crypto_open() -> bool:
    """Crypto trades 24/7."""
    return True


def is_forex_open() -> bool:
    """
    Forex: Sunday 21:00 UTC → Friday 22:00 UTC.
    Closed: Friday 22:00 → Sunday 21:00.
    """
    now = _utc_now()
    weekday = now.weekday()  # Mon=0 … Sun=6
    hour = now.hour

    # Saturday: fully closed
    if weekday == 5:
        return False

    # Sunday: opens at 21:00 UTC
    if weekday == 6:
        return hour >= 21

    # Friday: closes at 22:00 UTC
    if weekday == 4:
        return hour < 22

    # Mon–Thu: open all day
    return True


def is_stocks_open() -> bool:
    """
    US Stocks on Capital.com: Mon–Fri.
    Extended hours roughly 09:00–22:00 UTC (pre-market + after-hours).
    Regular session: 14:30–21:00 UTC.
    We use extended hours window to allow more trading.
    """
    now = _utc_now()
    weekday = now.weekday()

    # Weekend: closed
    if weekday >= 5:
        return False

    hour = now.hour
    # Extended hours: 09:00 – 22:00 UTC (Capital.com allows pre/after-market)
    return 9 <= hour < 22


def is_commodities_open() -> bool:
    """
    Commodities (Gold, Oil, etc.) on Capital.com: Mon–Fri.
    Most commodities trade Sun 23:00 → Fri 22:00 with brief daily breaks.
    Simplified: Mon–Fri 00:00–22:00, plus Sunday 23:00+.
    """
    now = _utc_now()
    weekday = now.weekday()
    hour = now.hour

    # Saturday: closed
    if weekday == 5:
        return False

    # Sunday: opens at 23:00 UTC
    if weekday == 6:
        return hour >= 23

    # Friday: closes at 22:00 UTC
    if weekday == 4:
        return hour < 22

    # Mon–Thu: open (with brief daily break ~22:00–23:00)
    # We allow 23:00 since most commodities reopen then
    return True


def get_open_categories() -> Set[str]:
    """Return set of category keys that are currently open for trading."""
    open_cats = set()

    if is_crypto_open():
        open_cats.add(config.CATEGORY_CRYPTO)
    if is_forex_open():
        open_cats.add(config.CATEGORY_FOREX)
    if is_stocks_open():
        open_cats.add(config.CATEGORY_STOCKS)
    if is_commodities_open():
        open_cats.add(config.CATEGORY_COMMODITIES)

    return open_cats


def get_closed_categories() -> Set[str]:
    """Return set of category keys that are currently closed."""
    all_cats = {config.CATEGORY_CRYPTO, config.CATEGORY_FOREX,
                config.CATEGORY_STOCKS, config.CATEGORY_COMMODITIES}
    return all_cats - get_open_categories()


def log_market_status():
    """Log current market status for all categories."""
    status_map = {
        config.CATEGORY_CRYPTO: ("₿ Crypto", is_crypto_open()),
        config.CATEGORY_FOREX: ("💱 Forex", is_forex_open()),
        config.CATEGORY_STOCKS: ("📈 Stocks", is_stocks_open()),
        config.CATEGORY_COMMODITIES: ("🪙 Commodities", is_commodities_open()),
    }

    now = _utc_now()
    log.info(f"🕐 Market hours check (UTC: {now.strftime('%A %H:%M')})")

    for cat_key, (label, is_open) in status_map.items():
        status = "✅ OPEN" if is_open else "🔴 CLOSED"
        log.info(f"  {label}: {status}")

    open_cats = get_open_categories()
    closed_cats = get_closed_categories()

    if closed_cats:
        closed_labels = []
        for c in closed_cats:
            for cat_key, (label, _) in status_map.items():
                if cat_key == c:
                    closed_labels.append(label)
        log.info(f"  ⏭️  Skipping closed markets: {', '.join(closed_labels)}")

    return open_cats
