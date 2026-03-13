"""
Capital.com Real-Time Trading Bot — Smart Adaptive Trading
Streams prices via polling at 1s intervals, uses tick-level momentum detection.
Features: Multi-timeframe pre-trade analysis, dynamic loss cutting, unlimited TP with
          5% step trailing SL, and AI-driven parameter adaptation.
"""

import json
import math
import time
import sys
import os
from datetime import datetime
from collections import defaultdict

import config
from capital_api import CapitalAPI
from strategy import analyze, Signal, tick_momentum
from risk import calculate_position_size, can_open_position
from position_manager import PositionManager
from trade_journal import TradeJournal
from market_scanner import MarketScanner
from asset_discovery import AssetDiscovery
from dashboard import start_dashboard_thread
from logger_setup import get_logger

log = get_logger("main")

BANNER = """
╔══════════════════════════════════════════════════════════╗
║   CAPITAL.COM REAL-TIME TRADING BOT  (DEMO)             ║
║   ⚡ 1-second price scanning — tick-level precision      ║
║   🧠 Adaptive AI: learns from every trade                ║
║   🔎 Auto-discovery: AI picks best assets                ║
║   📊 Multi-TF scanner: 60m → 15m → 5m confirmation      ║
║   🔒 Unlimited TP with 5% step trailing SL               ║
║   📈 Stocks (5) | ₿ Crypto (5) | 🪙 Commodities (5)     ║
║   💱 Forex (5)  | 📌 BTC always tracked                  ║
║   📊 Dashboard: http://localhost:8050                    ║
╚══════════════════════════════════════════════════════════╝
"""


def write_live_state(api, balance, positions, pos_manager, tick_history):
    """Write live state to disk for dashboard to read.
    Uses Capital.com API's live bid/ask from positions, plus direct price
    fetches for the most accurate real-time data.
    """
    try:
        live_positions = []

        # Collect epics that need fresh prices (from open positions)
        epics_to_fetch = []
        for pos in positions:
            epic = pos.get("market", {}).get("epic", "")
            if epic:
                epics_to_fetch.append(epic)

        # Batch-fetch live prices for all open position epics (max 50)
        live_prices = {}
        if epics_to_fetch:
            try:
                details = api.get_markets_details(epics_to_fetch[:50])
                for m in details:
                    ep = m.get("epic", "")
                    snap = m.get("snapshot", {})
                    bid = snap.get("bid", 0)
                    ask = snap.get("offer", 0)
                    if bid and ask:
                        live_prices[ep] = {
                            "bid": float(bid),
                            "ask": float(ask),
                            "mid": (float(bid) + float(ask)) / 2,
                        }
            except Exception as e:
                log.debug(f"Live price fetch fallback: {e}")

        for pos in positions:
            epic = pos.get("market", {}).get("epic", "")
            deal_id = pos.get("position", {}).get("dealId", "")
            direction = pos.get("position", {}).get("direction", "")
            entry_price = float(pos.get("position", {}).get("level", 0))
            size = float(pos.get("position", {}).get("size", 0))

            # Priority 1: batch-fetched live market price
            # Priority 2: position market snapshot (bid/offer from API)
            # Priority 3: tick_history
            # Priority 4: entry price (fallback)
            if epic in live_prices:
                current_price = live_prices[epic]["mid"]
                bid = live_prices[epic]["bid"]
                ask = live_prices[epic]["ask"]
            else:
                market = pos.get("market", {})
                api_bid = market.get("bid")
                api_ask = market.get("offer") or market.get("ask")
                if api_bid and api_ask:
                    bid = float(api_bid)
                    ask = float(api_ask)
                    current_price = (bid + ask) / 2
                elif epic in tick_history and tick_history[epic]:
                    current_price = tick_history[epic][-1]["mid"]
                    bid = tick_history[epic][-1].get("bid", current_price)
                    ask = tick_history[epic][-1].get("ask", current_price)
                else:
                    current_price = entry_price
                    bid = ask = entry_price

            # Use the actual P&L from the API if available
            pos_data = pos.get("position", {})
            api_pnl = pos_data.get("profit")
            if api_pnl is not None:
                pnl = float(api_pnl)
            else:
                if direction == "BUY":
                    pnl = current_price - entry_price
                else:
                    pnl = entry_price - current_price

            tracked = pos_manager.tracked.get(deal_id, {})

            live_positions.append({
                "epic": epic,
                "direction": direction,
                "entry_price": entry_price,
                "current_price": round(current_price, 6),
                "bid": round(bid, 6),
                "ask": round(ask, 6),
                "size": size,
                "unrealized_pnl": round(pnl, 5),
                "locked_steps": tracked.get("locked_steps", 0),
                "category": config.get_category(epic),
            })

        state = {
            "status": "running",
            "balance": balance,
            "positions": live_positions,
            "updated_at": datetime.utcnow().strftime("%H:%M:%S.") + f"{datetime.utcnow().microsecond // 1000:03d}",
        }
        state_file = os.path.join(os.path.dirname(__file__), "live_state.json")
        with open(state_file, "w") as f:
            json.dump(state, f)
    except Exception as e:
        log.error(f"Failed to write live state: {e}")


def run():
    print(BANNER)
    log.info(f"Watchlist: {', '.join(config.WATCHLIST)}")
    log.info(f"⚡ Scan interval: {config.SCAN_INTERVAL_SECONDS}s (real-time)")
    log.info(f"Risk per trade: {config.RISK_PER_TRADE * 100}% | Max positions: {config.MAX_OPEN_POSITIONS}")
    log.info(f"📈 Stocks: {len(config.WATCHLIST_STOCKS)} | ₿ Crypto: {len(config.WATCHLIST_CRYPTO)} | 🪙 Commodities: {len(config.WATCHLIST_COMMODITIES)}")

    api = CapitalAPI()

    if not api.login():
        log.critical("Failed to login — check credentials in .env")
        sys.exit(1)

    # Start dashboard AFTER login so it can use the API session
    start_dashboard_thread(api=api)

    account = api.get_account()
    if not account:
        log.critical("Failed to fetch account")
        sys.exit(1)

    balance = account.get("balance", {}).get("balance", 0)
    log.info(f"Starting balance: {balance:.2f}")

    # Initialize smart systems
    pos_manager = PositionManager()
    journal = TradeJournal()
    discovery = AssetDiscovery(api)

    # --- Initial asset discovery: AI picks best stocks & crypto ---
    log.info("🔎 Running initial asset discovery...")
    discovered = discovery.discover(force=True)
    config.update_dynamic_watchlists(
        discovered["stock_epics"], discovered["crypto_epics"],
        forex_epics=discovered.get("forex_epics"),
    )
    log.info(
        f"📈 Stocks: {', '.join(config.WATCHLIST_STOCKS)} | "
        f"₿ Crypto: {', '.join(config.WATCHLIST_CRYPTO)} | "
        f"💱 Forex: {', '.join(config.WATCHLIST_FOREX)} | "
        f"🪙 Commodities: {', '.join(config.WATCHLIST_COMMODITIES)}"
    )

    scanner = MarketScanner(api, config.WATCHLIST)

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

    # ═══════════════════════════════════════════
    # 🔄 STARTUP: Reconcile existing open positions BEFORE main loop
    # ═══════════════════════════════════════════
    log.info("🔄 Checking for existing open positions on account...")
    positions = api.get_positions()
    if positions:
        log.info(f"🔄 Found {len(positions)} open position(s) — applying current rules...")

        # Collect epics for live price fetch
        startup_epics = []
        for pos in positions:
            epic = pos.get("market", {}).get("epic", "")
            if epic:
                startup_epics.append(epic)

        # Batch-fetch live prices for all open positions
        startup_prices = {}
        if startup_epics:
            try:
                details = api.get_markets_details(list(set(startup_epics))[:50])
                for m in details:
                    ep = m.get("epic", "")
                    snap = m.get("snapshot", {})
                    bid = snap.get("bid", 0)
                    ask = snap.get("offer", 0)
                    if bid and ask:
                        startup_prices[ep] = {
                            "bid": float(bid),
                            "ask": float(ask),
                            "mid": (float(bid) + float(ask)) / 2,
                            "spread": float(ask) - float(bid),
                        }
            except Exception as e:
                log.warning(f"Failed to fetch startup prices: {e}")

        # ═══════════════════════════════════════════
        # CLOSE ALL NON-CRYPTO POSITIONS (crypto-only mode)
        # Retry up to 3 times with delays for rate limiting
        # ═══════════════════════════════════════════
        for attempt in range(3):
            positions = api.get_positions()  # Re-fetch each attempt
            non_crypto = []
            for pos in positions:
                epic = pos.get("market", {}).get("epic", "")
                deal_id = pos.get("position", {}).get("dealId", "")
                if not deal_id or not epic:
                    continue
                category = config.get_category(epic)
                if category != config.CATEGORY_CRYPTO:
                    non_crypto.append((epic, deal_id, category))

            if not non_crypto:
                log.info(f"✅ All non-crypto positions closed (attempt {attempt + 1})")
                break

            log.info(f"🚫 Attempt {attempt + 1}: Closing {len(non_crypto)} non-crypto position(s)...")
            for epic, deal_id, category in non_crypto:
                log.info(f"  🚫 Closing {epic} ({category}) deal={deal_id}")
                try:
                    closed = api.close_position(deal_id)
                    if closed:
                        log.info(f"    ✅ Closed {epic}")
                        pos_manager.untrack(deal_id)
                        active_signals.pop(epic, None)
                    else:
                        log.warning(f"    ⚠️ Failed to close {epic} — will retry")
                except Exception as e:
                    log.error(f"    ❌ Error closing {epic}: {e}")
                time.sleep(0.3)  # Rate limit protection

            time.sleep(1)  # Wait before retry

        # Final refresh
        positions = api.get_positions()

        # ═══════════════════════════════════════════
        # RECOVER remaining (crypto) positions
        # ═══════════════════════════════════════════
        for pos in positions:
            try:
                epic = pos.get("market", {}).get("epic", "")
                deal_id = pos.get("position", {}).get("dealId", "")
                direction = pos.get("position", {}).get("direction", "")
                entry_price = float(pos.get("position", {}).get("level", 0))

                if not deal_id or not epic:
                    continue

                # Get current price from batch fetch
                live = startup_prices.get(epic, {})
                current_price = live.get("mid", entry_price)
                live_spread = live.get("spread", 0.0)

                # Parse created date
                created_str = pos.get("position", {}).get("createdDateUTC", "")
                created_ts = 0.0
                if created_str:
                    try:
                        from datetime import datetime as dt_parse
                        created_ts = dt_parse.fromisoformat(
                            created_str.replace("Z", "+00:00")
                        ).timestamp()
                    except Exception:
                        pass

                # Estimate stop distance from market info or price percentage
                stop_dist = entry_price * 0.01  # Default 1%
                try:
                    minfo = api.get_market_info(epic)
                    if minfo:
                        dealing = minfo.get("dealingRules", {})
                        min_stop = dealing.get("minNormalStopOrLimitDistance", {}).get("value", 0)
                        if min_stop and float(min_stop) > 0:
                            stop_dist = max(stop_dist, float(min_stop))
                except Exception:
                    pass

                # Track position with full state reconstruction
                pos_manager.track_position(
                    deal_id, epic, direction,
                    entry_price, stop_dist, stop_dist * 1.5,
                    spread=live_spread,
                    current_price=current_price,
                    created_date=created_ts,
                )

                # Mark as active signal to prevent duplicate entry
                active_signals[epic] = direction

                # Calculate P&L for logging
                if direction == "BUY":
                    pnl = current_price - entry_price
                else:
                    pnl = entry_price - current_price
                pnl_pct = (pnl / entry_price) * 100 if entry_price > 0 else 0

                tracked = pos_manager.tracked.get(deal_id, {})
                locked = tracked.get("locked_steps", 0)
                age_mins = (time.time() - created_ts) / 60 if created_ts > 0 else 0

                log.info(
                    f"  🔄 RECOVERED {direction} {epic} | "
                    f"Entry: {entry_price:.5f} → Now: {current_price:.5f} | "
                    f"P&L: {pnl:.5f} ({pnl_pct:+.2f}%) | "
                    f"Locked steps: {locked} | Age: {age_mins:.0f}m | "
                    f"Spread: {live_spread:.5f}"
                )

                # Immediately evaluate against current rules
                adaptive = journal.get_params(epic)
                # Seed minimal tick history for evaluation
                if live.get("mid"):
                    tick_history[epic].append({
                        "time": time.time(),
                        "bid": live.get("bid", current_price),
                        "ask": live.get("ask", current_price),
                        "mid": current_price,
                        "spread": live_spread,
                    })

                evaluation = pos_manager.evaluate_position(
                    deal_id, current_price,
                    tick_history.get(epic, []),
                    adaptive,
                )

                if evaluation["action"] in ("CLOSE_PROFIT", "CLOSE_LOSS"):
                    log.info(
                        f"  ⚡ STARTUP CLOSE {evaluation['action']} {epic} — {evaluation['reason']} | "
                        f"P&L: {evaluation['unrealized_pnl']:.5f}"
                    )
                    closed = api.close_position(deal_id)
                    if closed:
                        journal.log_trade({
                            "epic": epic,
                            "direction": direction,
                            "entry_price": entry_price,
                            "exit_price": current_price,
                            "pnl": evaluation["unrealized_pnl"],
                            "pnl_pct": pnl_pct,
                            "size": 0,
                            "entry_reason": "pre-restart",
                            "exit_reason": f"startup-{evaluation['reason']}",
                            "duration_seconds": time.time() - created_ts if created_ts > 0 else 0,
                            "momentum_at_entry": 0,
                            "momentum_at_exit": 0,
                            "rsi_at_entry": 50,
                            "stop_distance": stop_dist,
                            "profit_distance": stop_dist * 1.5,
                            "hit_tp": False,
                            "hit_sl": "LOSS" in evaluation["action"],
                            "early_exit": True,
                        })
                        pos_manager.untrack(deal_id)
                        active_signals.pop(epic, None)
                        log.info(f"  ✅ Startup-closed {epic}")
                else:
                    log.info(f"  ✅ {epic} passes rules — continuing to manage")

            except Exception as e:
                log.error(f"Startup position recovery error: {e}")

        # Refresh positions after any startup closes
        positions = api.get_positions()
        log.info(f"🔄 Startup reconciliation complete — {len(positions)} position(s) active")
    else:
        log.info("🔄 No existing positions found — starting fresh")

    # Session keepalive
    cycle_count = 0

    while True:
        try:
            cycle_start = time.time()
            cycle_count += 1

            # ═══════════════════════════════════════════
            # 📊 MULTI-TIMEFRAME MARKET SCAN — every 2 min
            # ═══════════════════════════════════════════
            # The scanner handles its own timing internally (120s interval)
            # It: 1) ranks all assets by volatility
            #     2) deep-analyzes top 5 on 60m/15m/5m
            #     3) only confirms entry when timeframes agree
            scan_results = scanner.scan_all()

            # Session keepalive every 60 cycles
            if cycle_count % 60 == 0:
                if not api.ping():
                    log.warning("Session expired, re-authenticating...")
                    api.login()

            # Refresh balance + re-discover assets every 5 minutes
            if cycle_count % 300 == 0:
                acct = api.get_account()
                if acct:
                    balance = acct.get("balance", {}).get("balance", balance)
                    log.info(f"💰 Balance refresh: {balance:.2f}")

                # Re-discover best stocks & crypto (rotates into hottest movers)
                discovered = discovery.discover()
                if discovered["stock_epics"] or discovered["crypto_epics"] or discovered.get("forex_epics"):
                    old_watchlist = set(config.WATCHLIST)
                    config.update_dynamic_watchlists(
                        discovered["stock_epics"], discovered["crypto_epics"],
                        forex_epics=discovered.get("forex_epics"),
                    )
                    new_watchlist = set(config.WATCHLIST)
                    added = new_watchlist - old_watchlist
                    removed = old_watchlist - new_watchlist
                    if added or removed:
                        scanner.watchlist = config.WATCHLIST  # Update scanner's watchlist
                        log.info(f"🔄 Watchlist rotated: +{len(added)} -{len(removed)} assets")

                # Print learning summary
                for epic in config.WATCHLIST:
                    s = journal.get_stats(epic)
                    if s["total"] > 0:
                        log.info(f"  🧠 {epic}: {s['total']} trades, {s['win_rate']:.0%} win rate")

            # Refresh positions every 3 cycles from API
            if cycle_count % 3 == 0:
                positions = api.get_positions()
            # Write live state every cycle — fetches live prices directly from API
            write_live_state(api, balance, positions, pos_manager, tick_history)

            # ═══════════════════════════════════════════
            # 🚫 ENFORCE CRYPTO-ONLY — close any non-crypto that snuck through
            # ═══════════════════════════════════════════
            if positions and cycle_count % 10 == 0:
                for pos in positions:
                    epic = pos.get("market", {}).get("epic", "")
                    deal_id = pos.get("position", {}).get("dealId", "")
                    if epic and deal_id and config.get_category(epic) != config.CATEGORY_CRYPTO:
                        log.info(f"🚫 Force-closing non-crypto: {epic} deal={deal_id}")
                        if api.close_position(deal_id):
                            pos_manager.untrack(deal_id)
                            active_signals.pop(epic, None)
                        time.sleep(0.3)

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

                        # Auto-track if not already tracked (restart recovery)
                        if deal_id not in pos_manager.tracked:
                            entry_price = float(pos.get("position", {}).get("level", current_price))
                            # Read spread from live tick data
                            last_tick = tick_history[pos_epic][-1] if tick_history.get(pos_epic) else {}
                            live_spread = last_tick.get("spread", 0.0)

                            # Read created date from Capital.com position data
                            created_str = pos.get("position", {}).get("createdDateUTC", "")
                            created_ts = 0.0
                            if created_str:
                                try:
                                    from datetime import datetime as dt_parse
                                    # Capital.com format: "2025-01-15T08:30:00.000"
                                    created_ts = dt_parse.fromisoformat(
                                        created_str.replace("Z", "+00:00")
                                    ).timestamp()
                                except Exception:
                                    pass

                            # Use scanner's ATR-based stop distance if available
                            scan = scanner.scan_cache.get(pos_epic)
                            stop_dist = scan.stop_distance if scan and scan.stop_distance > 0 else 0
                            if stop_dist <= 0:
                                # Fallback: estimate from recent ticks
                                recent = [t["mid"] for t in tick_history[pos_epic][-30:]]
                                stop_dist = (max(recent) - min(recent)) * 1.5 if recent else entry_price * 0.01

                            # Pass current_price so position_manager can reconstruct profit steps
                            pos_manager.track_position(
                                deal_id, pos_epic, pos_direction,
                                entry_price, stop_dist, stop_dist * 1.5,
                                spread=live_spread,
                                current_price=current_price,
                                created_date=created_ts,
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
            # ⚡ ENTRY SCANNING — tick collection + scanner-gated entry
            # ═══════════════════════════════════════════
            for epic in config.WATCHLIST:
                try:
                    # Check if this epic's category is disabled via dashboard toggle
                    from dashboard import is_category_disabled
                    _cat_map = {config.CATEGORY_STOCKS: "Stocks", config.CATEGORY_CRYPTO: "Crypto",
                                config.CATEGORY_COMMODITIES: "Commodities", config.CATEGORY_FOREX: "FX"}
                    epic_cat = config.get_category(epic)
                    display_cat = _cat_map.get(epic_cat, "Stocks")
                    if is_category_disabled(display_cat):
                        continue

                    tick_data = api.get_prices(epic, "MINUTE", num_points=2)
                    if not tick_data or not tick_data.get("prices"):
                        continue

                    latest = tick_data["prices"][-1]
                    bid = latest["closePrice"]["bid"]
                    ask = latest["closePrice"]["ask"]
                    mid = (bid + ask) / 2
                    spread = ask - bid
                    ts = time.time()

                    if (not all(math.isfinite(v) for v in (bid, ask, mid, spread))) or mid <= 0 or spread <= 0:
                        continue

                    tick_history[epic].append({
                        "time": ts, "bid": bid, "ask": ask,
                        "mid": mid, "spread": spread,
                    })

                    if len(tick_history[epic]) > MAX_TICKS:
                        tick_history[epic] = tick_history[epic][-MAX_TICKS:]

                    if len(tick_history[epic]) < 5:
                        continue

                    # Determine if this is a scalp asset (crypto/forex)
                    epic_category = config.get_category(epic)
                    is_scalp_asset = epic_category in (config.CATEGORY_CRYPTO, config.CATEGORY_FOREX)

                    # ═══════════════════════════════════════
                    # GATE 1: Multi-TF scanner must confirm direction
                    # ═══════════════════════════════════════
                    scan_signal = scanner.get_entry_signal(epic)
                    if not scan_signal:
                        # Scanner says HOLD or no data — skip this asset
                        if cycle_count % 30 == 0:
                            cached = scanner.scan_cache.get(epic)
                            reason = cached.reason if cached else "not scanned"
                            log.debug(f"  {epic}: Scanner HOLD — {reason}")
                        continue

                    scanner_direction = scan_signal.overall_signal  # "BUY" or "SELL"
                    scanner_confidence = scan_signal.confidence
                    stop_distance = scan_signal.stop_distance
                    atr = scan_signal.atr

                    # ═══════════════════════════════════════
                    # GATE 2: Tick momentum must align with scanner
                    # Scalp assets: much lower threshold for fast entries
                    # ═══════════════════════════════════════
                    adaptive = journal.get_params(epic)
                    default_threshold = 0.45 if is_scalp_asset else 0.65
                    entry_threshold = adaptive.get("momentum_entry_threshold", default_threshold)
                    # Cap threshold for scalp to prevent it going too low
                    if is_scalp_asset:
                        entry_threshold = max(entry_threshold, 0.40)
                    else:
                        entry_threshold = max(entry_threshold, 0.55)

                    momentum = tick_momentum(tick_history[epic])

                    entry_signal = Signal.HOLD

                    # Only enter if tick momentum CONFIRMS scanner direction with strong alignment
                    if scanner_direction == Signal.BUY:
                        if momentum["direction"] == "UP" and momentum["strength"] >= entry_threshold:
                            entry_signal = Signal.BUY
                        # Scalp: also enter on FLAT only with very strong scanner confidence
                        elif is_scalp_asset and scanner_confidence >= 0.6 and momentum["direction"] != "DOWN" and momentum["strength"] >= 0.3:
                            entry_signal = Signal.BUY
                    elif scanner_direction == Signal.SELL:
                        if momentum["direction"] == "DOWN" and momentum["strength"] >= entry_threshold:
                            entry_signal = Signal.SELL
                        elif is_scalp_asset and scanner_confidence >= 0.6 and momentum["direction"] != "UP" and momentum["strength"] >= 0.3:
                            entry_signal = Signal.SELL

                    if entry_signal == Signal.HOLD:
                        if cycle_count % 10 == 0:
                            log.debug(
                                f"  {epic}: Scanner={scanner_direction} but tick mom={momentum['direction']} "
                                f"str={momentum['strength']:.2f} thr={entry_threshold:.2f} — waiting"
                            )
                        continue

                    if active_signals.get(epic) == entry_signal:
                        continue

                    if not can_open_position(positions, epic):
                        continue

                    # Calculate stop distance from scanner's multi-TF ATR
                    try:
                        stop_is_finite = math.isfinite(float(stop_distance))
                    except Exception:
                        stop_is_finite = False
                    try:
                        atr_is_finite = math.isfinite(float(atr))
                    except Exception:
                        atr_is_finite = False

                    stop_invalid = (not stop_is_finite) or (not atr_is_finite) or float(stop_distance) <= 0 or float(atr) <= 0
                    if stop_invalid:
                        recent_prices = [t["mid"] for t in tick_history[epic][-30:] if math.isfinite(t.get("mid", 0))]
                        if len(recent_prices) >= 2:
                            price_range = max(recent_prices) - min(recent_prices)
                        else:
                            price_range = 0
                        stop_distance = max(price_range * 1.5, spread * 10, mid * 0.001)
                        stop_is_finite = math.isfinite(float(stop_distance))

                    # Ensure stop distance is always positive and reasonable
                    safe_stop = abs(float(stop_distance)) if stop_is_finite else 0.0
                    stop_distance = max(safe_stop, spread * 3, mid * 0.0005)

                    if not math.isfinite(stop_distance) or stop_distance <= 0:
                        log.warning(f"Skipping {epic}: invalid stop_distance computed ({stop_distance})")
                        continue

                    # Query market info for minimum stop distance
                    try:
                        minfo = api.get_market_info(epic)
                        if minfo:
                            dealing = minfo.get("dealingRules", {})
                            min_stop = dealing.get("minNormalStopOrLimitDistance", {}).get("value", 0)
                            if min_stop and float(min_stop) > 0:
                                stop_distance = max(stop_distance, float(min_stop))
                    except Exception:
                        pass

                    # profit_distance is set but won't be used (unlimited TP via position manager)
                    profit_distance = stop_distance * 3

                    size = calculate_position_size(balance, stop_distance, mid)
                    if size <= 0:
                        continue

                    # EXECUTE
                    log.info(
                        f"🎯 ENTRY CONFIRMED: {entry_signal} {epic} | "
                        f"Scanner: {scanner_direction} conf={scanner_confidence:.2f} | "
                        f"Tick: {momentum['direction']} str={momentum['strength']:.2f} RSI={momentum.get('micro_rsi', '?')} | "
                        f"TF: {scan_signal.reason}"
                    )

                    trade = api.open_position(
                        epic=epic,
                        direction=entry_signal,
                        size=size,
                        stop_distance=stop_distance,
                        profit_distance=None,  # No TP — unlimited profit riding
                    )

                    if trade:
                        deal_ref = trade.get("dealReference", "")
                        active_signals[epic] = entry_signal

                        # Immediately refresh positions to get the real dealId
                        positions = api.get_positions()

                        # Resolve real dealId from positions (dealReference ≠ dealId)
                        real_deal_id = deal_ref  # fallback
                        for p in positions:
                            p_epic = p.get("market", {}).get("epic", "")
                            p_deal = p.get("position", {}).get("dealId", "")
                            if p_epic == epic and p_deal:
                                real_deal_id = p_deal
                                if real_deal_id != deal_ref:
                                    log.info(f"🔗 Resolved dealRef {deal_ref} → dealId {real_deal_id}")
                                break

                        # Track for smart management (pass spread for fee calculation)
                        pos_manager.track_position(
                            real_deal_id, epic, entry_signal,
                            mid, stop_distance, profit_distance,
                            spread=spread
                        )

                        # Store entry info for journal
                        entry_info[real_deal_id] = {
                            "reason": scan_signal.reason,
                            "momentum": momentum["strength"],
                            "rsi": momentum.get("micro_rsi", 50),
                            "time": time.time(),
                            "scanner_confidence": scanner_confidence,
                        }

                        # Invalidate scanner cache for this asset (prevent duplicate entry)
                        scanner.invalidate(epic)

                        log.info(
                            f"✅ {entry_signal} {epic} @ {mid:.5f} | "
                            f"Size: {size} | SL: {stop_distance:.5f} | TP: UNLIMITED | "
                            f"Mom: {momentum['strength']:.2f} | Scanner conf: {scanner_confidence:.2f}"
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
