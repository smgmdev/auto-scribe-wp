# Capital.com Trading Bot — Trend Following

A Python bot that trades commodities (Gold, Silver, Oil, Natural Gas) and US stocks on Capital.com using a **trend-following strategy** with EMA crossovers and ATR-based stops.

## Setup

```bash
cd python-bot
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## Configuration

1. Create a Capital.com **demo** account at https://capital.com
2. Generate API key in Settings → API Integrations
3. Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

## Running

```bash
# Activate venv
source venv/bin/activate

# Run the bot
python main.py
```

## Strategy

**Trend Following with EMA Crossover + ATR Stops**

- **Entry**: EMA(9) crosses above EMA(21) → BUY; EMA(9) crosses below EMA(21) → SELL
- **Confirmation**: Price above EMA(50) for longs, below for shorts
- **Stop Loss**: 2× ATR(14) from entry
- **Take Profit**: 3× ATR(14) from entry (1.5 R:R)
- **Position Sizing**: Risk 1% of account per trade
- **Timeframe**: 15-minute candles, scanned every 60 seconds

## Architecture

```
main.py           → Entry point, orchestrator loop
config.py         → Settings & environment variables
capital_api.py    → Capital.com REST API wrapper
strategy.py       → Trend-following signal logic
risk.py           → Position sizing & risk management
logger_setup.py   → Structured console logging
```

## Demo Mode

The bot connects to Capital.com's **demo** API by default. No real money is at risk.
To switch to live, change `CAPITAL_API_URL` in `.env` to the live endpoint (do this only when ready).
