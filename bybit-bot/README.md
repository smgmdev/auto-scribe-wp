# Bitget MacBook Pro Bot

Crypto perpetuals trading bot for Bitget (demo/live). Runs locally on your MacBook Pro.

## Strategy
- **Entry**: Momentum-based (EMA crossover + RSI confirmation)
- **Default SL**: -1.5% from entry price
- **Trailing SL**: Fee-aware 1% profit ratcheting
  - First lock: SL moves to breakeven+1% only when **net profit after Bitget fees** reaches 1%
  - Subsequent locks: Every additional 1% price move, SL ratchets up by 1%
  - SL never moves backwards
  - No take-profit — let winners run, SL locks profit

## Setup

```bash
cd bybit-bot
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your Bitget API keys
python main.py
```

## Getting Bitget Demo API Keys
1. Go to https://www.bitget.com
2. Log in to your account
3. Click **Demo Trading** (top-right) to switch to demo mode
4. Go to **Personal Center** → **API Key Management**
5. Create a **Demo API Key**
6. Enable **Futures** trading permissions
7. Copy the API Key, Secret, and Passphrase into your `.env`
8. Set `BITGET_DEMO=1` in `.env`

## Switching to Live Trading
1. Create a **Live API Key** from your real account (not demo mode)
2. Update `.env` with the live API keys
3. Set `BITGET_DEMO=0`

## Files
- `main.py` — Main trading loop
- `bitget_api.py` — Bitget V2 API wrapper
- `strategy.py` — Momentum entry signals
- `position_manager.py` — Fee-aware trailing SL manager
- `config.py` — Configuration from .env
- `logger_setup.py` — Colored console logging
