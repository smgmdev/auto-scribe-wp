"""Configuration loaded from .env"""

import os
from dotenv import load_dotenv

load_dotenv()

# Bitget API
BITGET_API_KEY = os.getenv("BITGET_API_KEY", "")
BITGET_API_SECRET = os.getenv("BITGET_API_SECRET", "")
BITGET_API_PASSPHRASE = os.getenv("BITGET_API_PASSPHRASE", "")
BITGET_BASE_URL = "https://api.bitget.com"

# Demo trading (paper trading)
BITGET_DEMO = os.getenv("BITGET_DEMO", "1") == "1"

# Watchlist
WATCHLIST = [s.strip() for s in os.getenv("WATCHLIST", "BTCUSDT,ETHUSDT,SOLUSDT").split(",") if s.strip()]

# Risk
RISK_PER_TRADE = float(os.getenv("RISK_PER_TRADE", "0.01"))
MAX_OPEN_POSITIONS = int(os.getenv("MAX_OPEN_POSITIONS", "5"))
LEVERAGE = int(os.getenv("LEVERAGE", "10"))

# Strategy
EMA_FAST = int(os.getenv("EMA_FAST", "9"))
EMA_SLOW = int(os.getenv("EMA_SLOW", "21"))
RSI_PERIOD = int(os.getenv("RSI_PERIOD", "14"))
CANDLE_INTERVAL = os.getenv("CANDLE_INTERVAL", "15")  # minutes

# SL
INITIAL_SL_PCT = float(os.getenv("INITIAL_SL_PCT", "0.015"))   # 1.5%
TRAILING_STEP_PCT = float(os.getenv("TRAILING_STEP_PCT", "0.01"))  # 1%

# Bitget taker fee per side (0.06%)
TAKER_FEE_PCT = float(os.getenv("TAKER_FEE_PCT", "0.0006"))
# Round-trip fee = 2 * taker fee = 0.12%
ROUND_TRIP_FEE_PCT = TAKER_FEE_PCT * 2

# Scan interval
SCAN_INTERVAL_SECONDS = int(os.getenv("SCAN_INTERVAL_SECONDS", "5"))
