"""Configuration loaded from environment variables."""
from __future__ import annotations

import os
from dotenv import load_dotenv

load_dotenv()

# Capital.com credentials
CAPITAL_EMAIL = os.getenv("CAPITAL_EMAIL", "")
CAPITAL_PASSWORD = os.getenv("CAPITAL_PASSWORD", "")
CAPITAL_API_KEY = os.getenv("CAPITAL_API_KEY", "")
CAPITAL_API_URL = os.getenv("CAPITAL_API_URL", "https://demo-api-capital.backend-capital.com")

# Risk management
RISK_PER_TRADE = float(os.getenv("RISK_PER_TRADE", "0.01"))
MAX_POSITIONS_PER_CATEGORY = int(os.getenv("MAX_POSITIONS_PER_CATEGORY", "5"))
MAX_OPEN_POSITIONS = MAX_POSITIONS_PER_CATEGORY  # 5 total (crypto only)

# Strategy parameters
EMA_FAST = int(os.getenv("EMA_FAST", "9"))
EMA_SLOW = int(os.getenv("EMA_SLOW", "21"))
EMA_TREND = int(os.getenv("EMA_TREND", "50"))
ATR_PERIOD = int(os.getenv("ATR_PERIOD", "14"))
ATR_SL_MULTIPLIER = float(os.getenv("ATR_SL_MULTIPLIER", "2.0"))
ATR_TP_MULTIPLIER = float(os.getenv("ATR_TP_MULTIPLIER", "3.0"))
CANDLE_TIMEFRAME = os.getenv("CANDLE_TIMEFRAME", "MINUTE_15")
SCAN_INTERVAL_SECONDS = int(os.getenv("SCAN_INTERVAL_SECONDS", "60"))

# ═══════════════════════════════════════════════
# ASSET CATEGORIES — each with 5-trade limit
# ═══════════════════════════════════════════════

CATEGORY_STOCKS = "stocks"
CATEGORY_CRYPTO = "crypto"
CATEGORY_COMMODITIES = "commodities"
CATEGORY_FOREX = "forex"

# Commodities — DISABLED (crypto only mode)
WATCHLIST_COMMODITIES = []

# Forex — DISABLED (crypto only mode)
WATCHLIST_FOREX_FALLBACK = []

# Stocks — DISABLED (crypto only mode)
WATCHLIST_STOCKS_FALLBACK = []
WATCHLIST_CRYPTO_FALLBACK = [
    "BTCUSD", "ETHUSD", "SOLUSD", "XRPUSD",
    "BNBUSD", "DOGEUSD", "ADAUSD", "AVAXUSD",
]

# Crypto epics that MUST always be included (never rotated out)
CRYPTO_PINNED = ["BTCUSD"]

# Runtime watchlists (updated by AssetDiscovery)
WATCHLIST_STOCKS: list[str] = list(WATCHLIST_STOCKS_FALLBACK)
WATCHLIST_CRYPTO: list[str] = list(WATCHLIST_CRYPTO_FALLBACK)
WATCHLIST_FOREX: list[str] = []

# Epic → category mapping (rebuilt when watchlists update)
EPIC_CATEGORY: dict[str, str] = {}


def rebuild_watchlist():
    """Rebuild the combined watchlist and category mapping."""
    global WATCHLIST, EPIC_CATEGORY
    EPIC_CATEGORY.clear()
    for epic in WATCHLIST_STOCKS:
        EPIC_CATEGORY[epic] = CATEGORY_STOCKS
    for epic in WATCHLIST_CRYPTO:
        EPIC_CATEGORY[epic] = CATEGORY_CRYPTO
    for epic in WATCHLIST_COMMODITIES:
        EPIC_CATEGORY[epic] = CATEGORY_COMMODITIES
    for epic in WATCHLIST_FOREX:
        EPIC_CATEGORY[epic] = CATEGORY_FOREX
    WATCHLIST = WATCHLIST_STOCKS + WATCHLIST_CRYPTO + WATCHLIST_COMMODITIES + WATCHLIST_FOREX


def update_dynamic_watchlists(
    stock_epics: list[str],
    crypto_epics: list[str],
    forex_epics: list[str] | None = None,
):
    """Called by AssetDiscovery to update the live watchlists."""
    global WATCHLIST_STOCKS, WATCHLIST_CRYPTO, WATCHLIST_FOREX
    if stock_epics:
        WATCHLIST_STOCKS = stock_epics
    if crypto_epics:
        # Ensure pinned crypto are always present
        for pinned in CRYPTO_PINNED:
            if pinned not in crypto_epics:
                crypto_epics.insert(0, pinned)
        WATCHLIST_CRYPTO = crypto_epics
    if forex_epics:
        WATCHLIST_FOREX = forex_epics
    rebuild_watchlist()


def get_category(epic: str) -> str:
    """Get the category for an epic code.
    First checks the known mapping, then checks current watchlists,
    then infers from epic name patterns.
    """
    # 1) Known mapping (populated by rebuild_watchlist)
    if epic in EPIC_CATEGORY:
        return EPIC_CATEGORY[epic]

    # 2) Check current runtime watchlists directly (handles race conditions)
    if epic in WATCHLIST_CRYPTO:
        return CATEGORY_CRYPTO
    if epic in WATCHLIST_STOCKS:
        return CATEGORY_STOCKS
    if epic in WATCHLIST_FOREX:
        return CATEGORY_FOREX
    if epic in WATCHLIST_COMMODITIES:
        return CATEGORY_COMMODITIES

    # 3) Infer from epic name patterns
    _commodities = {"GOLD", "SILVER", "OIL_CRUDE", "NATURALGAS", "COPPER", "PLATINUM", "PALLADIUM", "OIL_BRENT"}
    if epic in _commodities:
        return CATEGORY_COMMODITIES

    # Crypto: any epic ending in "USD" where the base is a known crypto ticker
    _crypto_bases = {"BTC", "ETH", "SOL", "XRP", "BNB", "DOGE", "ADA", "AVAX", "DOT", "MATIC",
                     "LINK", "UNI", "SHIB", "LTC", "ATOM", "NEAR", "APT", "ARB", "OP", "FIL",
                     "TRX", "ETC", "XLM", "ALGO", "HBAR", "VET", "FTM", "SAND", "MANA", "AXS",
                     "AAVE", "CRV", "MKR", "COMP", "SNX", "PEPE", "SUI", "SEI", "TIA", "JUP",
                     "WIF", "BONK", "FLOKI", "RENDER", "INJ", "FET", "ONDO", "JASMY", "GALA",
                     "TON", "KAS", "TAO", "STX", "IMX", "RUNE", "THETA", "GRT", "ENS", "PENDLE",
                     "W", "ZRO", "PYTH", "JTO", "STRK", "DYM", "MANTA", "ALT", "PIXEL", "PORTAL",
                     "BEAM", "ACE", "XAI", "AI", "WLD", "BLUR", "ID", "CAKE", "SUSHI", "1INCH",
                     "LIDO", "RPL", "SSV", "EIGEN", "ETHFI", "REZ", "IO", "ZK", "LISTA", "NOT",
                     "PEOPLE", "ORDI", "SATS", "RATS", "DOG", "BOME", "MEW", "POPCAT", "TURBO",
                     "BRETT", "NEIRO", "MOTHER", "MYRO", "TNSR", "KMNO", "DRIFT", "JITO",
                     "POL", "CHZ", "APE", "DYDX", "GMX", "PERP", "LQTY", "SPELL"}
    for base in _crypto_bases:
        if epic.startswith(base) and epic.endswith("USD"):
            return CATEGORY_CRYPTO

    # Broader crypto catch: short epic ending in USD that's NOT a 6-char forex pair
    # Typical crypto: 5-10 chars like BTCUSD, ETHUSD, DOGEUSD, SOLUSD
    if epic.endswith("USD") and len(epic) >= 5 and len(epic) != 6:
        base_part = epic[:-3]
        # If it's all uppercase letters and short, likely crypto
        if base_part.isalpha() and len(base_part) <= 8:
            return CATEGORY_CRYPTO

    # Forex: exactly 6 chars with known currency codes
    _forex_pairs = {"EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "NZD", "USD", "NOK", "SEK", "SGD", "HKD", "ZAR", "TRY", "MXN", "PLN", "CZK", "HUF"}
    if len(epic) == 6:
        base = epic[:3]
        quote = epic[3:]
        if base in _forex_pairs and quote in _forex_pairs:
            return CATEGORY_FOREX

    # Default to stocks for unknown epics (company tickers)
    return CATEGORY_STOCKS


# Initial build
rebuild_watchlist()
# Combined watchlist (rebuilt by rebuild_watchlist)
WATCHLIST: list[str] = WATCHLIST_STOCKS + WATCHLIST_CRYPTO + WATCHLIST_COMMODITIES + WATCHLIST_FOREX
