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
from risk import calculate_position_size, can_open_position, count_positions_by_category
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
                    pnl = (current_price - entry_price) * size
                else:
                    pnl = (entry_price - current_price) * size

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
                "trailing_stop_price": tracked.get("trailing_stop_price"),
                "stop_distance": tracked.get("stop_distance", 0),
                "category": tracked.get("category") or config.get_category(epic),
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
    start_dashboard_thread(api=api, pos_manager=None)  # pos_manager set later

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

    # Give dashboard access to position manager for SL data
    from dashboard import set_pos_manager_ref
    set_pos_manager_ref(pos_manager)

    # --- Initial asset discovery: AI picks best stocks & crypto ---
    log.info("🔎 Running initial asset discovery...")
    discovered = discovery.discover(force=True)
    config.update_dynamic_watchlists(
        discovered["stock_epics"], discovered["crypto_epics"],
        forex_epics=discovered.get("forex_epics"),
        commodity_epics=discovered.get("commodity_epics"),
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

    # ═══════════════════════════════════════════
    # LOSS COOLDOWN: prevent re-entering same epic right after a loss
    # epic -> {"time": timestamp, "consecutive_losses": int}
    # ═══════════════════════════════════════════
    loss_cooldowns: dict[str, dict] = {}
    COOLDOWN_AFTER_LOSS_SCALP = 300       # 5 min cooldown after 1 loss (scalp assets)
    COOLDOWN_AFTER_LOSS_STANDARD = 600    # 10 min cooldown after 1 loss (standard assets)
    COOLDOWN_CONSECUTIVE_LOSSES = 1800    # 30 min cooldown after 2+ consecutive losses
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
        # CLOSE POSITIONS IN DISABLED CATEGORIES (respects dashboard toggles)
        # ═══════════════════════════════════════════
        from dashboard import is_category_disabled
        _cat_map_startup = {
            config.CATEGORY_STOCKS: "Stocks", config.CATEGORY_CRYPTO: "Crypto",
            config.CATEGORY_COMMODITIES: "Commodities", config.CATEGORY_FOREX: "FX",
        }
        for attempt in range(3):
            positions = api.get_positions()
            disabled_pos = []
            for pos in positions:
                epic = pos.get("market", {}).get("epic", "")
                deal_id = pos.get("position", {}).get("dealId", "")
                if not deal_id or not epic:
                    continue
                category = config.get_category(epic)
                display_cat = _cat_map_startup.get(category, "Stocks")
                if is_category_disabled(display_cat):
                    disabled_pos.append((epic, deal_id, category))

            if not disabled_pos:
                log.info(f"✅ No disabled-category positions to close (attempt {attempt + 1})")
                break

            log.info(f"🚫 Attempt {attempt + 1}: Closing {len(disabled_pos)} disabled-category position(s)...")
            for epic, deal_id, category in disabled_pos:
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
                time.sleep(0.3)

            time.sleep(1)

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
                    category=config.get_category(epic),
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
            # 📊 CATEGORY CAPACITY CHECK — tell scanner which categories are full
            # ═══════════════════════════════════════════
            cat_counts = count_positions_by_category(positions) if positions else {}
            full_categories = set()
            for cat_key, count in cat_counts.items():
                if count >= config.MAX_POSITIONS_PER_CATEGORY:
                    full_categories.add(cat_key)
            scanner.set_full_categories(full_categories)

            if full_categories and cycle_count % 30 == 0:
                log.info(f"📊 Full categories (skipping scan): {', '.join(full_categories)} | Counts: {cat_counts}")

            # ═══════════════════════════════════════════
            # 📊 MULTI-TIMEFRAME MARKET SCAN — every 2 min
            # Scanner now skips full categories automatically
            # ═══════════════════════════════════════════
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
                if discovered["stock_epics"] or discovered["crypto_epics"] or discovered.get("forex_epics") or discovered.get("commodity_epics"):
                    old_watchlist = set(config.WATCHLIST)
                    config.update_dynamic_watchlists(
                        discovered["stock_epics"], discovered["crypto_epics"],
                        forex_epics=discovered.get("forex_epics"),
                        commodity_epics=discovered.get("commodity_epics"),
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
            # 🚫 ENFORCE DISABLED CATEGORIES — close positions in toggled-off categories
            # ═══════════════════════════════════════════
            if positions and cycle_count % 10 == 0:
                from dashboard import is_category_disabled
                _cat_map_loop = {config.CATEGORY_STOCKS: "Stocks", config.CATEGORY_CRYPTO: "Crypto",
                                 config.CATEGORY_COMMODITIES: "Commodities", config.CATEGORY_FOREX: "FX"}
                for pos in positions:
                    epic = pos.get("market", {}).get("epic", "")
                    deal_id = pos.get("position", {}).get("dealId", "")
                    if epic and deal_id:
                        cat = config.get_category(epic)
                        disp_cat = _cat_map_loop.get(cat, "Stocks")
                        if is_category_disabled(disp_cat):
                            log.info(f"🚫 Force-closing disabled-category: {epic} ({cat}) deal={deal_id}")
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
                                category=config.get_category(pos_epic),
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

                                # ═══════════════════════════════════════
                                # LOSS COOLDOWN: record loss for this epic
                                # ═══════════════════════════════════════
                                if "LOSS" in evaluation["action"]:
                                    prev = loss_cooldowns.get(pos_epic, {})
                                    consec = prev.get("consecutive_losses", 0) + 1
                                    loss_cooldowns[pos_epic] = {
                                        "time": time.time(),
                                        "consecutive_losses": consec,
                                    }
                                    # Also invalidate scanner cache so stale signal doesn't re-trigger
                                    scanner.invalidate(pos_epic)
                                    log.info(
                                        f"🧊 {pos_epic}: Loss cooldown activated "
                                        f"(consecutive: {consec})"
                                    )
                                else:
                                    # Profitable close: reset cooldown for this epic
                                    loss_cooldowns.pop(pos_epic, None)

                    except Exception as e:
                        log.error(f"Position management error: {e}")

            # ═══════════════════════════════════════════
            # ⚡ ENTRY SCANNING — balanced across categories
            # Prioritize categories with fewer open positions (fill empty slots first)
            # Skip categories that are already at max capacity
            # ═══════════════════════════════════════════

            # Build category-ordered epic list: categories with fewest positions first
            _cat_order = sorted(
                [config.CATEGORY_CRYPTO, config.CATEGORY_STOCKS, config.CATEGORY_COMMODITIES, config.CATEGORY_FOREX],
                key=lambda c: cat_counts.get(c, 0),
            )
            balanced_epics = []
            scanning_cats = []
            for cat in _cat_order:
                if cat in full_categories:
                    continue  # Skip full categories entirely
                cat_epics = {
                    config.CATEGORY_CRYPTO: config.WATCHLIST_CRYPTO,
                    config.CATEGORY_STOCKS: config.WATCHLIST_STOCKS,
                    config.CATEGORY_COMMODITIES: config.WATCHLIST_COMMODITIES,
                    config.CATEGORY_FOREX: config.WATCHLIST_FOREX,
                }.get(cat, [])
                balanced_epics.extend(cat_epics)
                scanning_cats.append(f"{cat}({cat_counts.get(cat, 0)}/{config.MAX_POSITIONS_PER_CATEGORY})")

            if cycle_count % 30 == 0 and scanning_cats:
                log.info(f"🔄 Entry scan order: {' → '.join(scanning_cats)} | {len(balanced_epics)} epics")

            # ═══════════════════════════════════════════
            # ⚡ BATCH PRICE FETCH — 1 API call instead of 30+ sequential calls
            # ═══════════════════════════════════════════
            batch_prices: dict[str, dict] = {}
            if balanced_epics:
                try:
                    for i in range(0, len(balanced_epics), 50):
                        chunk = balanced_epics[i:i+50]
                        details = api.get_markets_details(chunk)
                        for m in details:
                            ep = m.get("epic", "")
                            snap = m.get("snapshot", {})
                            bid_val = snap.get("bid", 0)
                            ask_val = snap.get("offer", 0)
                            if bid_val and ask_val:
                                b = float(bid_val)
                                a = float(ask_val)
                                batch_prices[ep] = {
                                    "bid": b, "ask": a,
                                    "mid": (b + a) / 2, "spread": a - b,
                                }
                except Exception as e:
                    log.warning(f"Batch price fetch error: {e}")

            for epic in balanced_epics:
                try:
                    # Check if this epic's category is disabled via dashboard toggle
                    from dashboard import is_category_disabled
                    _cat_map = {config.CATEGORY_STOCKS: "Stocks", config.CATEGORY_CRYPTO: "Crypto",
                                config.CATEGORY_COMMODITIES: "Commodities", config.CATEGORY_FOREX: "FX"}
                    epic_cat = config.get_category(epic)
                    display_cat = _cat_map.get(epic_cat, "Stocks")
                    if is_category_disabled(display_cat):
                        continue

                    # ═══════════════════════════════════════
                    # Use batch-fetched prices instead of per-epic API calls
                    # ═══════════════════════════════════════
                    if epic not in batch_prices:
                        continue  # No price data from batch fetch

                    bp = batch_prices[epic]
                    bid = bp["bid"]
                    ask = bp["ask"]
                    mid = bp["mid"]
                    spread = bp["spread"]
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
                    # GATE 0: LOSS COOLDOWN — don't re-enter an epic that just lost
                    # ═══════════════════════════════════════
                    cooldown_info = loss_cooldowns.get(epic)
                    if cooldown_info:
                        consec = cooldown_info.get("consecutive_losses", 1)
                        if consec >= 2:
                            cooldown_secs = COOLDOWN_CONSECUTIVE_LOSSES
                        else:
                            cooldown_secs = COOLDOWN_AFTER_LOSS_SCALP if is_scalp_asset else COOLDOWN_AFTER_LOSS_STANDARD
                        elapsed_since_loss = time.time() - cooldown_info["time"]
                        if elapsed_since_loss < cooldown_secs:
                            remaining = int(cooldown_secs - elapsed_since_loss)
                            if cycle_count % 60 == 0:
                                log.info(
                                    f"🧊 {epic}: Cooldown active ({consec} consecutive loss{'es' if consec > 1 else ''}) "
                                    f"— {remaining}s remaining"
                                )
                            continue
                        else:
                            # Cooldown expired — allow entry but keep consecutive count
                            # (will reset on next profitable trade)
                            pass

                    # ═══════════════════════════════════════
                    # GATE 1: Multi-TF scanner must confirm direction
                    # ═══════════════════════════════════════
                    scan_signal = scanner.get_entry_signal(epic)
                    if not scan_signal:
                        if cycle_count % 30 == 0:
                            cached = scanner.scan_cache.get(epic)
                            reason = cached.reason if cached else "not scanned"
                            log.debug(f"  {epic}: Scanner HOLD — {reason}")
                        continue

                    scanner_direction = scan_signal.overall_signal
                    scanner_confidence = scan_signal.confidence
                    stop_distance = scan_signal.stop_distance
                    atr = scan_signal.atr

                    # ═══════════════════════════════════════
                    # GATE 2: Minimum scanner confidence (raised)
                    # ═══════════════════════════════════════
                    min_conf = 0.45 if is_scalp_asset else 0.55
                    if scanner_confidence < min_conf:
                        if cycle_count % 30 == 0:
                            log.debug(f"  {epic}: Scanner conf {scanner_confidence:.2f} < {min_conf} — skipping")
                        continue

                    # ═══════════════════════════════════════
                    # GATE 3: Tick momentum must STRONGLY align with scanner
                    # Raised thresholds to prevent weak entries
                    # ═══════════════════════════════════════
                    adaptive = journal.get_params(epic)
                    default_threshold = 0.55 if is_scalp_asset else 0.70
                    entry_threshold = adaptive.get("momentum_entry_threshold", default_threshold)
                    if is_scalp_asset:
                        entry_threshold = max(entry_threshold, 0.50)
                    else:
                        entry_threshold = max(entry_threshold, 0.60)

                    momentum = tick_momentum(tick_history[epic])

                    entry_signal = Signal.HOLD

                    # Only enter if tick momentum CONFIRMS scanner direction with strong alignment
                    if scanner_direction == Signal.BUY:
                        if momentum["direction"] == "UP" and momentum["strength"] >= entry_threshold:
                            entry_signal = Signal.BUY
                        # Scalp: relaxed entry only with VERY strong scanner confidence
                        elif is_scalp_asset and scanner_confidence >= 0.70 and momentum["direction"] != "DOWN" and momentum["strength"] >= 0.40:
                            entry_signal = Signal.BUY
                    elif scanner_direction == Signal.SELL:
                        if momentum["direction"] == "DOWN" and momentum["strength"] >= entry_threshold:
                            entry_signal = Signal.SELL
                        elif is_scalp_asset and scanner_confidence >= 0.70 and momentum["direction"] != "UP" and momentum["strength"] >= 0.40:
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

                    # ═══════════════════════════════════════
                    # GATE 4: RISK/REWARD CHECK — estimated profit must exceed risk
                    # Use S/R levels: for BUY, distance to resistance vs stop
                    # For SELL, distance to support vs stop
                    # Require minimum 1.5:1 R:R ratio
                    # ═══════════════════════════════════════
                    MIN_RR_RATIO = 1.5
                    estimated_profit_room = 0.0

                    if scan_signal.nearest_resistance > 0 and entry_signal == Signal.BUY:
                        estimated_profit_room = scan_signal.nearest_resistance - mid
                    elif scan_signal.nearest_support > 0 and entry_signal == Signal.SELL:
                        estimated_profit_room = mid - scan_signal.nearest_support

                    # If S/R data unavailable, use ATR-based estimate (3× ATR as target)
                    if estimated_profit_room <= 0 and atr > 0:
                        estimated_profit_room = atr * 3.0

                    effective_stop = stop_distance if stop_distance > 0 else mid * 0.01
                    rr_ratio = estimated_profit_room / effective_stop if effective_stop > 0 else 0

                    if rr_ratio < MIN_RR_RATIO:
                        if cycle_count % 20 == 0:
                            log.info(
                                f"  ⚠️ {epic}: R:R ratio {rr_ratio:.2f} < {MIN_RR_RATIO} — "
                                f"profit room {estimated_profit_room:.5f} vs stop {effective_stop:.5f} — skipping"
                            )
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
                            spread=spread,
                            category=config.get_category(epic),
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
