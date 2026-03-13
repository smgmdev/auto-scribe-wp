"""
Capital.com Trend-Following Trading Bot
Runs on Mac Mini — connects to demo account.
"""

import time
import sys
from datetime import datetime

import config
from capital_api import CapitalAPI
from strategy import analyze, Signal
from risk import calculate_position_size, can_open_position
from logger_setup import get_logger

log = get_logger("main")

BANNER = """
╔══════════════════════════════════════════════════════╗
║     CAPITAL.COM TREND-FOLLOWING BOT  (DEMO)         ║
║     Strategy: EMA Crossover + ATR Stops              ║
║     Assets: Gold, Silver, Oil, Gas, US Stocks        ║
╚══════════════════════════════════════════════════════╝
"""


def run():
    print(BANNER)
    log.info(f"Watchlist: {', '.join(config.WATCHLIST)}")
    log.info(f"Timeframe: {config.CANDLE_TIMEFRAME} | Scan every {config.SCAN_INTERVAL_SECONDS}s")
    log.info(f"Risk per trade: {config.RISK_PER_TRADE * 100}% | Max positions: {config.MAX_OPEN_POSITIONS}")

    api = CapitalAPI()

    # Login
    if not api.login():
        log.critical("Failed to login — check credentials in .env")
        sys.exit(1)

    # Get initial account info
    account = api.get_account()
    if not account:
        log.critical("Failed to fetch account")
        sys.exit(1)

    balance = account.get("balance", {}).get("balance", 0)
    log.info(f"Starting balance: {balance:.2f}")

    # Session keepalive counter
    ping_counter = 0

    # Main loop
    while True:
        try:
            loop_start = datetime.now().strftime("%H:%M:%S")
            log.info(f"━━━ Scan cycle at {loop_start} ━━━")

            # Refresh account balance periodically
            if ping_counter % 10 == 0:
                acct = api.get_account()
                if acct:
                    balance = acct.get("balance", {}).get("balance", balance)

            # Keep session alive
            if ping_counter % 5 == 0:
                if not api.ping():
                    log.warning("Session expired, re-authenticating...")
                    api.login()

            ping_counter += 1

            # Get open positions once per cycle
            positions = api.get_positions()
            log.info(f"Open positions: {len(positions)}")

            # Scan each asset
            for epic in config.WATCHLIST:
                try:
                    # Fetch candles
                    prices = api.get_prices(
                        epic, config.CANDLE_TIMEFRAME, num_points=config.EMA_TREND + 10
                    )
                    if not prices:
                        continue

                    # Analyze
                    result = analyze(prices)
                    signal = result.get("signal", Signal.HOLD)

                    if signal == Signal.HOLD:
                        log.debug(f"{epic}: HOLD — {result.get('reason', '')}")
                        continue

                    # Check if we can open
                    if not can_open_position(positions, epic):
                        continue

                    # Calculate size
                    size = calculate_position_size(
                        balance,
                        result["stop_distance"],
                        result["price"],
                    )
                    if size <= 0:
                        continue

                    # Execute trade
                    trade = api.open_position(
                        epic=epic,
                        direction=signal,
                        size=size,
                        stop_distance=result["stop_distance"],
                        profit_distance=result["profit_distance"],
                    )

                    if trade:
                        log.info(
                            f"✅ {signal} {epic} @ {result['price']} | "
                            f"Size: {size} | SL: {result['stop_distance']} | TP: {result['profit_distance']}"
                        )

                except Exception as e:
                    log.error(f"Error scanning {epic}: {e}")
                    continue

            # Wait for next cycle
            log.info(f"💤 Sleeping {config.SCAN_INTERVAL_SECONDS}s...")
            time.sleep(config.SCAN_INTERVAL_SECONDS)

        except KeyboardInterrupt:
            log.info("🛑 Bot stopped by user")
            break
        except Exception as e:
            log.error(f"Loop error: {e}")
            time.sleep(10)


if __name__ == "__main__":
    run()
