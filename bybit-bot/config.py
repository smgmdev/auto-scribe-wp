"""Configuration loaded from .env"""

import os
from dotenv import load_dotenv

load_dotenv()

# Bybit API
BYBIT_API_KEY = os.getenv("BYBIT_API_KEY", "")
BYBIT_API_SECRET = os.getenv("BYBIT_API_SECRET", "")
BYBIT_BASE_URL = os.getenv("BYBIT_BASE_URL", "https://api-testnet.bybit.com")

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

# Bybit taker fee per side (0.055%)
TAKER_FEE_PCT = float(os.getenv("TAKER_FEE_PCT", "0.00055"))
# Round-trip fee = 2 * taker fee = 0.11%
ROUND_TRIP_FEE_PCT = TAKER_FEE_PCT * 2

# Scan interval
SCAN_INTERVAL_SECONDS = int(os.getenv("SCAN_INTERVAL_SECONDS", "5"))
