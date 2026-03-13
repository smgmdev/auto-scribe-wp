"""
Capital.com Real-Time Trading Bot — Sub-Second Precision
Streams prices via polling at 1s intervals, uses tick-level momentum detection.
"""

import time
import sys
from datetime import datetime
from collections import defaultdict

import config
from capital_api import CapitalAPI
from strategy import analyze, Signal, tick_momentum
from risk import calculate_position_size, can_open_position
from logger_setup import get_logger

log = get_logger("main")

BANNER = """
╔══════════════════════════════════════════════════════════╗
║   CAPITAL.COM REAL-TIME TRADING BOT  (DEMO)             ║
║   ⚡ 1-second price scanning — tick-level precision      ║
║   Strategy: EMA Crossover + Tick Momentum + ATR Stops    ║
║   Assets: Gold, Silver, Oil, Gas, US Stocks              ║
╚══════════════════════════════════════════════════════════╝
"""


def run():
    print(BANNER)
    log.info(f"Watchlist: {', '.join(config.WATCHLIST)}")
    log.info(f"⚡ Scan interval: {config.SCAN_INTERVAL_SECONDS}s (real-time)")
    log.info(f"Risk per trade: {config.RISK_PER_TRADE * 100}% | Max positions: {config.MAX_OPEN_POSITIONS}")

    api = CapitalAPI()

    if not api.login():
        log.critical("Failed to login — check credentials in .env")
        sys.exit(1)

    account = api.get_account()
    if not account:
        log.critical("Failed to fetch account")
        sys.exit(1)

    balance = account.get("balance", {}).get("balance", 0)
    log.info(f"Starting balance: {balance:.2f}")

    # Tick history for real-time momentum detection
    tick_history: dict[str, list[dict]] = defaultdict(list)
    MAX_TICKS = 120  # Keep last 120 ticks (2 min at 1s interval)

    # Track which epics have active signals to avoid duplicate entries
    active_signals: dict[str, str] = {}  # epic -> last signal direction

    # Candle analysis cache (refresh every 60s, not every tick)
    candle_cache: dict[str, dict] = {}
    last_candle_fetch = 0
    CANDLE_REFRESH_INTERVAL = 60

    # Session keepalive
    ping_counter = 0
    cycle_count = 0

    while True:
        try:
            cycle_start = time.time()
            cycle_count += 1

            # Refresh candle-based analysis every 60s
            now = time.time()
            if now - last_candle_fetch >= CANDLE_REFRESH_INTERVAL:
                log.info("━━━ Refreshing candle analysis ━━━")
                for epic in config.WATCHLIST:
                    try:
                        prices = api.get_prices(epic, config.CANDLE_TIMEFRAME, num_points=config.EMA_TREND + 10)
                        if prices:
                            candle_cache[epic] = analyze(prices)
                    except Exception as e:
                        log.error(f"Candle fetch error {epic}: {e}")
                last_candle_fetch = now

            # Session keepalive every 60 cycles
            if cycle_count % 60 == 0:
                if not api.ping():
                    log.warning("Session expired, re-authenticating...")
                    api.login()

            # Refresh balance every 5 minutes
            if cycle_count % 300 == 0:
                acct = api.get_account()
                if acct:
                    balance = acct.get("balance", {}).get("balance", balance)
                    log.info(f"💰 Balance refresh: {balance:.2f}")

            # Get positions once per cycle
            positions = api.get_positions() if cycle_count % 5 == 0 else positions if 'positions' in dir() else []

            # ⚡ Real-time tick scan — every second
            for epic in config.WATCHLIST:
                try:
                    # Fetch latest 1-minute candle for real-time bid/ask
                    tick_data = api.get_prices(epic, "MINUTE", num_points=2)
                    if not tick_data or not tick_data.get("prices"):
                        continue

                    latest = tick_data["prices"][-1]
                    bid = latest["closePrice"]["bid"]
                    ask = latest["closePrice"]["ask"]
                    mid = (bid + ask) / 2
                    spread = ask - bid
                    ts = time.time()

                    # Store tick
                    tick_history[epic].append({
                        "time": ts,
                        "bid": bid,
                        "ask": ask,
                        "mid": mid,
                        "spread": spread,
                    })

                    # Trim to MAX_TICKS
                    if len(tick_history[epic]) > MAX_TICKS:
                        tick_history[epic] = tick_history[epic][-MAX_TICKS:]

                    # Need at least 10 ticks for momentum analysis
                    if len(tick_history[epic]) < 10:
                        continue

                    # Get candle-level trend bias
                    candle_signal = candle_cache.get(epic, {})
                    trend_bias = candle_signal.get("signal", Signal.HOLD)
                    atr = candle_signal.get("atr", 0)
                    stop_distance = candle_signal.get("stop_distance", 0)
                    profit_distance = candle_signal.get("profit_distance", 0)

                    # ⚡ Tick-level momentum check
                    momentum = tick_momentum(tick_history[epic])

                    # Entry logic: candle trend + tick momentum must agree
                    entry_signal = Signal.HOLD

                    if trend_bias == Signal.BUY and momentum["direction"] == "UP" and momentum["strength"] >= 0.6:
                        entry_signal = Signal.BUY
                    elif trend_bias == Signal.SELL and momentum["direction"] == "DOWN" and momentum["strength"] >= 0.6:
                        entry_signal = Signal.SELL

                    # Also: pure tick breakout (no candle signal needed)
                    if entry_signal == Signal.HOLD and momentum["strength"] >= 0.85:
                        if momentum["direction"] == "UP" and momentum["acceleration"] > 0:
                            entry_signal = Signal.BUY
                            log.info(f"⚡ {epic} TICK BREAKOUT BUY | strength={momentum['strength']:.2f}")
                        elif momentum["direction"] == "DOWN" and momentum["acceleration"] < 0:
                            entry_signal = Signal.SELL
                            log.info(f"⚡ {epic} TICK BREAKOUT SELL | strength={momentum['strength']:.2f}")

                    if entry_signal == Signal.HOLD:
                        # Log price every 10 cycles for monitoring
                        if cycle_count % 10 == 0:
                            log.debug(
                                f"{epic}: {mid:.5f} | spread={spread:.5f} | "
                                f"mom={momentum['direction']} {momentum['strength']:.2f}"
                            )
                        continue

                    # Skip if same signal already active
                    if active_signals.get(epic) == entry_signal:
                        continue

                    # Can we open?
                    if not can_open_position(positions, epic):
                        continue

                    # Use ATR-based stops if available, otherwise use tick-based stops
                    if stop_distance <= 0 or atr <= 0:
                        # Fallback: use recent price range as stop
                        recent_prices = [t["mid"] for t in tick_history[epic][-30:]]
                        price_range = max(recent_prices) - min(recent_prices)
                        stop_distance = max(price_range * 1.5, spread * 10)
                        profit_distance = stop_distance * 1.5

                    size = calculate_position_size(balance, stop_distance, mid)
                    if size <= 0:
                        continue

                    # EXECUTE
                    trade = api.open_position(
                        epic=epic,
                        direction=entry_signal,
                        size=size,
                        stop_distance=stop_distance,
                        profit_distance=profit_distance,
                    )

                    if trade:
                        active_signals[epic] = entry_signal
                        log.info(
                            f"✅ {entry_signal} {epic} @ {mid:.5f} | "
                            f"Size: {size} | SL: {stop_distance:.5f} | TP: {profit_distance:.5f} | "
                            f"Momentum: {momentum['strength']:.2f}"
                        )

                except Exception as e:
                    log.error(f"Tick scan error {epic}: {e}")
                    continue

            # ⚡ Exit management — check every 5 seconds
            if cycle_count % 5 == 0 and positions:
                for pos in positions:
                    try:
                        pos_epic = pos.get("market", {}).get("epic", "")
                        pos_direction = pos.get("position", {}).get("direction", "")
                        deal_id = pos.get("position", {}).get("dealId", "")

                        if pos_epic not in tick_history or len(tick_history[pos_epic]) < 10:
                            continue

                        momentum = tick_momentum(tick_history[pos_epic])

                        # Exit if momentum reverses against position
                        should_exit = False
                        if pos_direction == "BUY" and momentum["direction"] == "DOWN" and momentum["strength"] >= 0.7:
                            should_exit = True
                            log.info(f"⚡ EXIT signal {pos_epic} — momentum reversed DOWN ({momentum['strength']:.2f})")
                        elif pos_direction == "SELL" and momentum["direction"] == "UP" and momentum["strength"] >= 0.7:
                            should_exit = True
                            log.info(f"⚡ EXIT signal {pos_epic} — momentum reversed UP ({momentum['strength']:.2f})")

                        if should_exit:
                            api.close_position(deal_id)
                            active_signals.pop(pos_epic, None)

                    except Exception as e:
                        log.error(f"Exit check error: {e}")

            # Sleep to maintain 1-second cycle
            elapsed = time.time() - cycle_start
            sleep_time = max(0, config.SCAN_INTERVAL_SECONDS - elapsed)
            if sleep_time > 0:
                time.sleep(sleep_time)

        except KeyboardInterrupt:
            log.info("🛑 Bot stopped by user")
            break
        except Exception as e:
            log.error(f"Loop error: {e}")
            time.sleep(1)


if __name__ == "__main__":
    run()
