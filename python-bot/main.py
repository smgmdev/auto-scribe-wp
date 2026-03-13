"""
Capital.com Real-Time Trading Bot — Smart Adaptive Trading
Streams prices via polling at 1s intervals, uses tick-level momentum detection.
Features: Dynamic loss cutting, early profit taking, and AI-driven parameter adaptation.
"""

import time
import sys
from datetime import datetime
from collections import defaultdict

import config
from capital_api import CapitalAPI
from strategy import analyze, Signal, tick_momentum
from risk import calculate_position_size, can_open_position
from position_manager import PositionManager
from trade_journal import TradeJournal
from logger_setup import get_logger

log = get_logger("main")

BANNER = """
╔══════════════════════════════════════════════════════════╗
║   CAPITAL.COM REAL-TIME TRADING BOT  (DEMO)             ║
║   ⚡ 1-second price scanning — tick-level precision      ║
║   🧠 Adaptive AI: learns from every trade                ║
║   Strategy: EMA + Momentum + Smart Exits + Trailing SL   ║
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

    # Initialize smart systems
    pos_manager = PositionManager()
    journal = TradeJournal()

    # Print learning stats on startup
    stats = journal.get_stats()
    if stats["total"] > 0:
        log.info(
            f"🧠 Historical: {stats['total']} trades | "
            f"Win rate: {stats['win_rate']:.0%} | "
            f"Total P&L: {stats['total_pnl']:.5f}"
        )

    # Tick history for real-time momentum detection
    tick_history: dict[str, list[dict]] = defaultdict(list)
    MAX_TICKS = 120

    # Track which epics have active signals
    active_signals: dict[str, str] = {}

    # Track entry info for journal logging
    entry_info: dict[str, dict] = {}  # deal_id -> {entry_price, momentum, rsi, reason, time}

    # Candle analysis cache
    candle_cache: dict[str, dict] = {}
    last_candle_fetch = 0
    CANDLE_REFRESH_INTERVAL = 60

    # Session keepalive
    cycle_count = 0
    positions = []

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
                        # Get adaptive params for this epic
                        adaptive = journal.get_params(epic)
                        prices = api.get_prices(epic, config.CANDLE_TIMEFRAME, num_points=config.EMA_TREND + 10)
                        if prices:
                            candle_cache[epic] = analyze(prices, adaptive)
                            sig = candle_cache[epic]
                            if sig["signal"] != Signal.HOLD:
                                log.info(
                                    f"  {epic}: {sig['signal']} — {sig['reason']} "
                                    f"| RSI={sig.get('rsi', '?')} mom={sig.get('momentum_score', '?')}"
                                )
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
                # Print learning summary
                for epic in config.WATCHLIST:
                    s = journal.get_stats(epic)
                    if s["total"] > 0:
                        log.info(f"  🧠 {epic}: {s['total']} trades, {s['win_rate']:.0%} win rate")

            # Get positions every 5 cycles
            if cycle_count % 5 == 0:
                positions = api.get_positions()

            # ═══════════════════════════════════════════
            # ⚡ SMART POSITION MANAGEMENT — every cycle
            # ═══════════════════════════════════════════
            if positions and cycle_count % 2 == 0:  # Check every 2 seconds
                for pos in positions:
                    try:
                        pos_epic = pos.get("market", {}).get("epic", "")
                        pos_direction = pos.get("position", {}).get("direction", "")
                        deal_id = pos.get("position", {}).get("dealId", "")

                        if not deal_id or pos_epic not in tick_history:
                            continue

                        # Get current price from latest tick
                        if not tick_history[pos_epic]:
                            continue
                        current_price = tick_history[pos_epic][-1]["mid"]

                        # Auto-track if not already tracked
                        if deal_id not in pos_manager.tracked:
                            entry_price = float(pos.get("position", {}).get("level", current_price))
                            stop_dist = candle_cache.get(pos_epic, {}).get("stop_distance", 0)
                            profit_dist = candle_cache.get(pos_epic, {}).get("profit_distance", 0)
                            if stop_dist > 0 and profit_dist > 0:
                                pos_manager.track_position(
                                    deal_id, pos_epic, pos_direction,
                                    entry_price, stop_dist, profit_dist
                                )

                        # Get adaptive params
                        adaptive = journal.get_params(pos_epic)

                        # Evaluate position
                        evaluation = pos_manager.evaluate_position(
                            deal_id, current_price,
                            tick_history.get(pos_epic, []),
                            adaptive
                        )

                        if evaluation["action"] in ("CLOSE_PROFIT", "CLOSE_LOSS"):
                            log.info(
                                f"{'💰' if 'PROFIT' in evaluation['action'] else '🔴'} "
                                f"{evaluation['action']} {pos_epic} — {evaluation['reason']} "
                                f"| P&L: {evaluation['unrealized_pnl']:.5f}"
                            )
                            closed = api.close_position(deal_id)
                            if closed:
                                # Log to journal for learning
                                tracked = pos_manager.tracked.get(deal_id, {})
                                entry_data = entry_info.get(deal_id, {})
                                journal.log_trade({
                                    "epic": pos_epic,
                                    "direction": pos_direction,
                                    "entry_price": tracked.get("entry_price", 0),
                                    "exit_price": current_price,
                                    "pnl": evaluation["unrealized_pnl"],
                                    "pnl_pct": (evaluation["unrealized_pnl"] / tracked.get("entry_price", 1)) * 100,
                                    "size": 0,
                                    "entry_reason": entry_data.get("reason", "unknown"),
                                    "exit_reason": evaluation["reason"],
                                    "duration_seconds": time.time() - tracked.get("entry_time", time.time()),
                                    "momentum_at_entry": entry_data.get("momentum", 0),
                                    "momentum_at_exit": tick_momentum(tick_history.get(pos_epic, [])).get("strength", 0),
                                    "rsi_at_entry": entry_data.get("rsi", 50),
                                    "stop_distance": tracked.get("stop_distance", 0),
                                    "profit_distance": tracked.get("profit_distance", 0),
                                    "hit_tp": False,
                                    "hit_sl": "LOSS" in evaluation["action"],
                                    "early_exit": True,
                                })
                                pos_manager.untrack(deal_id)
                                active_signals.pop(pos_epic, None)
                                entry_info.pop(deal_id, None)

                    except Exception as e:
                        log.error(f"Position management error: {e}")

            # ═══════════════════════════════════════════
            # ⚡ ENTRY SCANNING — every second
            # ═══════════════════════════════════════════
            for epic in config.WATCHLIST:
                try:
                    tick_data = api.get_prices(epic, "MINUTE", num_points=2)
                    if not tick_data or not tick_data.get("prices"):
                        continue

                    latest = tick_data["prices"][-1]
                    bid = latest["closePrice"]["bid"]
                    ask = latest["closePrice"]["ask"]
                    mid = (bid + ask) / 2
                    spread = ask - bid
                    ts = time.time()

                    tick_history[epic].append({
                        "time": ts, "bid": bid, "ask": ask,
                        "mid": mid, "spread": spread,
                    })

                    if len(tick_history[epic]) > MAX_TICKS:
                        tick_history[epic] = tick_history[epic][-MAX_TICKS:]

                    if len(tick_history[epic]) < 10:
                        continue

                    # Get candle-level trend bias
                    candle_signal = candle_cache.get(epic, {})
                    trend_bias = candle_signal.get("signal", Signal.HOLD)
                    atr = candle_signal.get("atr", 0)
                    stop_distance = candle_signal.get("stop_distance", 0)
                    profit_distance = candle_signal.get("profit_distance", 0)

                    # Get adaptive params for this epic
                    adaptive = journal.get_params(epic)
                    entry_threshold = adaptive.get("momentum_entry_threshold", 0.6)

                    # ⚡ Tick-level momentum
                    momentum = tick_momentum(tick_history[epic])

                    # Entry logic with adaptive thresholds
                    entry_signal = Signal.HOLD

                    if trend_bias == Signal.BUY and momentum["direction"] == "UP" and momentum["strength"] >= entry_threshold:
                        entry_signal = Signal.BUY
                    elif trend_bias == Signal.SELL and momentum["direction"] == "DOWN" and momentum["strength"] >= entry_threshold:
                        entry_signal = Signal.SELL

                    # Pure tick breakout (higher threshold)
                    if entry_signal == Signal.HOLD and momentum["strength"] >= 0.85:
                        if momentum["direction"] == "UP" and momentum["acceleration"] > 0:
                            entry_signal = Signal.BUY
                            log.info(f"⚡ {epic} TICK BREAKOUT BUY | str={momentum['strength']:.2f} RSI={momentum.get('micro_rsi', '?')}")
                        elif momentum["direction"] == "DOWN" and momentum["acceleration"] < 0:
                            entry_signal = Signal.SELL
                            log.info(f"⚡ {epic} TICK BREAKOUT SELL | str={momentum['strength']:.2f} RSI={momentum.get('micro_rsi', '?')}")

                    if entry_signal == Signal.HOLD:
                        if cycle_count % 10 == 0:
                            log.debug(
                                f"{epic}: {mid:.5f} | spread={spread:.5f} | "
                                f"mom={momentum['direction']} {momentum['strength']:.2f} | "
                                f"RSI={momentum.get('micro_rsi', '?')}"
                            )
                        continue

                    if active_signals.get(epic) == entry_signal:
                        continue

                    if not can_open_position(positions, epic):
                        continue

                    # Use adaptive SL/TP from learning
                    if stop_distance <= 0 or atr <= 0:
                        recent_prices = [t["mid"] for t in tick_history[epic][-30:]]
                        price_range = max(recent_prices) - min(recent_prices)
                        stop_distance = max(price_range * 1.5, spread * 10)
                        profit_distance = stop_distance * 1.5
                    else:
                        # Apply learned multipliers
                        stop_distance = atr * adaptive.get("sl_multiplier", config.ATR_SL_MULTIPLIER)
                        profit_distance = atr * adaptive.get("tp_multiplier", config.ATR_TP_MULTIPLIER)

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
                        deal_ref = trade.get("dealReference", "")
                        active_signals[epic] = entry_signal

                        # Immediately refresh positions to prevent exceeding limit
                        positions = api.get_positions()

                        # Track for smart management
                        pos_manager.track_position(
                            deal_ref, epic, entry_signal,
                            mid, stop_distance, profit_distance
                        )

                        # Store entry info for journal
                        entry_info[deal_ref] = {
                            "reason": candle_signal.get("reason", "tick breakout"),
                            "momentum": momentum["strength"],
                            "rsi": momentum.get("micro_rsi", 50),
                            "time": time.time(),
                        }

                        log.info(
                            f"✅ {entry_signal} {epic} @ {mid:.5f} | "
                            f"Size: {size} | SL: {stop_distance:.5f} | TP: {profit_distance:.5f} | "
                            f"Mom: {momentum['strength']:.2f} | RSI: {momentum.get('micro_rsi', '?')} | "
                            f"Adaptive: SL={adaptive.get('sl_multiplier', '?')}x TP={adaptive.get('tp_multiplier', '?')}x"
                        )

                except Exception as e:
                    log.error(f"Tick scan error {epic}: {e}")
                    continue

            # Sleep to maintain 1-second cycle
            elapsed = time.time() - cycle_start
            sleep_time = max(0, config.SCAN_INTERVAL_SECONDS - elapsed)
            if sleep_time > 0:
                time.sleep(sleep_time)

        except KeyboardInterrupt:
            log.info("🛑 Bot stopped by user")
            stats = journal.get_stats()
            log.info(f"📊 Session stats: {stats['total']} trades | Win rate: {stats['win_rate']:.0%}")
            break
        except Exception as e:
            log.error(f"Loop error: {e}")
            time.sleep(1)


if __name__ == "__main__":
    run()
