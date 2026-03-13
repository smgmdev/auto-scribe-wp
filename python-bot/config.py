"""Configuration loaded from environment variables."""

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
MAX_OPEN_POSITIONS = MAX_POSITIONS_PER_CATEGORY * 3  # 15 total (5 per category)

# Strategy parameters
EMA_FAST = int(os.getenv("EMA_FAST", "9"))
EMA_SLOW = int(os.getenv("EMA_SLOW", "21"))
EMA_TREND = int(os.getenv("EMA_TREND", "50"))
ATR_PERIOD = int(os.getenv("ATR_PERIOD", "14"))
ATR_SL_MULTIPLIER = float(os.getenv("ATR_SL_MULTIPLIER", "2.0"))
ATR_TP_MULTIPLIER = float(os.getenv("ATR_TP_MULTIPLIER", "3.0"))
CANDLE_TIMEFRAME = os.getenv("CANDLE_TIMEFRAME", "MINUTE_15")
SCAN_INTERVAL_SECONDS = int(os.getenv("SCAN_INTERVAL_SECONDS", "60"))

# ═══════════════════════════════════════════
# ASSET CATEGORIES — each with 5-trade limit
# ═══════════════════════════════════════════

CATEGORY_STOCKS = "stocks"
CATEGORY_CRYPTO = "crypto"
CATEGORY_COMMODITIES = "commodities"

# Capital.com epic codes per category
WATCHLIST_STOCKS = [
    "AAPL",           # Apple
    "TSLA",           # Tesla
    "NVDA",           # NVIDIA
    "MSFT",           # Microsoft
    "AMZN",           # Amazon
    "GOOGL",          # Alphabet
    "META",           # Meta
    "AMD",            # AMD
    "NFLX",           # Netflix
    "JPM",            # JPMorgan
]

WATCHLIST_CRYPTO = [
    "BTCUSD",         # Bitcoin
    "ETHUSD",         # Ethereum
    "SOLUSD",         # Solana
    "XRPUSD",        # XRP
    "BNBUSD",         # BNB
    "DOGEUSD",        # Dogecoin
    "ADAUSD",         # Cardano
    "AVAXUSD",        # Avalanche
]

WATCHLIST_COMMODITIES = [
    "GOLD",           # Gold
    "SILVER",         # Silver
    "OIL_CRUDE",      # Crude Oil (WTI)
    "NATURALGAS",     # Natural Gas
    "COPPER",         # Copper
    "PLATINUM",       # Platinum
]

# Combined watchlist
WATCHLIST = WATCHLIST_STOCKS + WATCHLIST_CRYPTO + WATCHLIST_COMMODITIES

# Epic → category mapping
EPIC_CATEGORY: dict[str, str] = {}
for epic in WATCHLIST_STOCKS:
    EPIC_CATEGORY[epic] = CATEGORY_STOCKS
for epic in WATCHLIST_CRYPTO:
    EPIC_CATEGORY[epic] = CATEGORY_CRYPTO
for epic in WATCHLIST_COMMODITIES:
    EPIC_CATEGORY[epic] = CATEGORY_COMMODITIES


def get_category(epic: str) -> str:
    """Get the category for an epic code."""
    return EPIC_CATEGORY.get(epic, "unknown")
