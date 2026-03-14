# Bybit MacBook Pro Bot

Crypto perpetuals trading bot for Bybit (testnet). Runs locally on your MacBook Pro.

## Strategy
- **Entry**: Momentum-based (EMA crossover + RSI confirmation)
- **Default SL**: -1.5% from entry price
- **Trailing SL**: Fee-aware 1% profit ratcheting
  - First lock: SL moves to breakeven+1% only when **net profit after Bybit fees** reaches 1%
  - Subsequent locks: Every additional 1% price move, SL ratchets up by 1%
  - SL never moves backwards
  - No take-profit — let winners run, SL locks profit

## Setup

```bash
cd bybit-bot
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your Bybit testnet API keys
python main.py
```

## Getting Bybit Testnet API Keys
1. Go to https://testnet.bybit.com
2. Create an account / log in
3. Go to API Management → Create New Key
4. Select "System-generated API Keys"
5. Enable "Unified Trading" permissions (read + trade)
6. Copy the API Key and Secret into your `.env`

## Files
- `main.py` — Main trading loop
- `bybit_api.py` — Bybit V5 API wrapper
- `strategy.py` — Momentum entry signals
- `position_manager.py` — Fee-aware trailing SL manager
- `config.py` — Configuration from .env
- `logger_setup.py` — Colored console logging
