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
MAX_OPEN_POSITIONS = int(os.getenv("MAX_OPEN_POSITIONS", "5"))

# Strategy parameters
EMA_FAST = int(os.getenv("EMA_FAST", "9"))
EMA_SLOW = int(os.getenv("EMA_SLOW", "21"))
EMA_TREND = int(os.getenv("EMA_TREND", "50"))
ATR_PERIOD = int(os.getenv("ATR_PERIOD", "14"))
ATR_SL_MULTIPLIER = float(os.getenv("ATR_SL_MULTIPLIER", "2.0"))
ATR_TP_MULTIPLIER = float(os.getenv("ATR_TP_MULTIPLIER", "3.0"))
CANDLE_TIMEFRAME = os.getenv("CANDLE_TIMEFRAME", "MINUTE_15")
SCAN_INTERVAL_SECONDS = int(os.getenv("SCAN_INTERVAL_SECONDS", "60"))

# Watchlist — Capital.com epic codes
WATCHLIST = [
    # Commodities
    "GOLD",           # Gold
    "SILVER",         # Silver
    "OIL_CRUDE",      # Crude Oil (WTI)
    "NATURALGAS",     # Natural Gas
    # US Stocks
    "AAPL",           # Apple
    "TSLA",           # Tesla
    "NVDA",           # NVIDIA
    "MSFT",           # Microsoft
    "AMZN",           # Amazon
    "GOOGL",          # Alphabet
]
