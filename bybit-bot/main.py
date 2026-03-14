"""
Bybit MacBook Pro Bot — Crypto Perpetuals
Momentum entry + fee-aware 1% trailing SL

Run: python main.py
"""

import time
import sys
from typing import Dict, Set

import config
from bybit_api import BybitAPI
from strategy import analyze
from position_manager import PositionManager
from logger_setup import get_logger

log = get_logger("main")

BANNER = """
╔══════════════════════════════════════════════════════╗
║   BYBIT PERPETUALS BOT  (MacBook Pro)               ║
║   ⚡ Momentum entry — EMA crossover + RSI            ║
║   🔒 Fee-aware 1% trailing SL                        ║
║   📉 Default SL: -1.5%                               ║
║   💰 Leverage: {leverage}x                                  ║
║   📊 Pairs: {pairs}                                  ║
╚══════════════════════════════════════════════════════╝
""".format(
    leverage=config.LEVERAGE,
    pairs=", ".join(config.WATCHLIST[:4]),
)


def calculate_qty(api, symbol, balance, price):
    # type: (BybitAPI, str, float, float) -> float
    """Calculate position size based on risk and leverage."""
    risk_amount = balance * config.RISK_PER_TRADE
    sl_distance = price * config.INITIAL_SL_PCT
    if sl_distance <= 0:
        return 0.0

    # With leverage, notional = qty * price, margin = notional / leverage
    # Risk = qty * sl_distance => qty = risk / sl_distance
    qty = risk_amount / sl_distance

    # Get minimum qty
    min_qty = api.get_min_qty(symbol)

    # Round to appropriate precision
    if price > 1000:
        qty = round(qty, 3)  # BTC
    elif price > 10:
        qty = round(qty, 2)  # ETH, SOL
    else:
        qty = round(qty, 1)  # smaller coins

    if qty < min_qty:
        log.debug(f"{symbol} qty {qty} < min {min_qty}, skipping")
        return 0.0

    return qty


def run():
    print(BANNER)
    log.info(f"Watchlist: {', '.join(config.WATCHLIST)}")
    log.info(f"Risk: {config.RISK_PER_TRADE*100}% | Max positions: {config.MAX_OPEN_POSITIONS}")
    log.info(f"SL: -{config.INITIAL_SL_PCT*100}% | Trailing step: {config.TRAILING_STEP_PCT*100}%")
    log.info(f"Round-trip fee: {config.ROUND_TRIP_FEE_PCT*100:.3f}%")

    api = BybitAPI()
    pos_manager = PositionManager()

    # Check connection
    wallet = api.get_balance()
    if not wallet:
        log.critical("Failed to connect to Bybit — check API keys in .env")
        sys.exit(1)

    balance = wallet["balance"]
    log.info(f"Starting balance: {balance:.2f} USDT")

    # Set leverage for all symbols
    for symbol in config.WATCHLIST:
        api.set_leverage(symbol, config.LEVERAGE)

    # ── RECOVER existing positions ──
    log.info("🔄 Checking for existing positions...")
    existing = api.get_positions()
    active_symbols = set()  # type: Set[str]

    for pos in existing:
        symbol = pos["symbol"]
        if symbol in config.WATCHLIST:
            pos_manager.recover_position(
                symbol=symbol,
                side=pos["side"],
                entry_price=pos["entry_price"],
                size=pos["size"],
                current_price=pos["mark_price"],
            )
            active_symbols.add(symbol)
            log.info(
                f"  🔄 {pos['side']} {symbol} @ {pos['entry_price']:.4f} | "
                f"P&L: {pos['unrealized_pnl']:.4f}"
            )

    if not existing:
        log.info("No existing positions found")

    # ── Cooldown tracking ──
    cooldowns = {}  # type: Dict[str, float]  # symbol -> cooldown_until timestamp
    COOLDOWN_SECONDS = 300  # 5 min after closing a position

    cycle = 0

    # ══════════════════════════════════════
    # MAIN LOOP
    # ══════════════════════════════════════
    log.info("🚀 Starting main loop...")

    while True:
        try:
            cycle += 1

            # ── 1. MANAGE EXISTING POSITIONS ──
            for symbol in list(pos_manager.positions.keys()):
                ticker = api.get_ticker(symbol)
                if not ticker:
                    continue

                price = ticker["mark_price"]
                result = pos_manager.evaluate(symbol, price)

                # Update SL on Bybit if it changed
                if result.get("new_sl"):
                    pos = pos_manager.positions[symbol]
                    success = api.update_stop_loss(symbol, pos.side, result["new_sl"])
                    if success:
                        log.info(f"✅ {symbol} SL updated on Bybit → {result['new_sl']:.4f}")

                # Close if SL hit (backup — Bybit SL should trigger, but just in case)
                if result["action"] == "CLOSE":
                    pos = pos_manager.positions[symbol]
                    log.info(f"🔴 CLOSING {symbol}: {result['reason']}")
                    closed = api.close_position(symbol, pos.side, pos.size)
                    if closed:
                        pos_manager.untrack(symbol)
                        active_symbols.discard(symbol)
                        cooldowns[symbol] = time.time() + COOLDOWN_SECONDS
                        log.info(f"  Cooldown {symbol} for {COOLDOWN_SECONDS}s")

            # ── 2. LOOK FOR NEW ENTRIES ──
            if len(pos_manager.positions) < config.MAX_OPEN_POSITIONS:
                for symbol in config.WATCHLIST:
                    # Skip if already in position
                    if symbol in pos_manager.positions:
                        continue

                    # Skip if in cooldown
                    if symbol in cooldowns and time.time() < cooldowns[symbol]:
                        continue

                    # Fetch candles and analyze
                    candles = api.get_klines(symbol, config.CANDLE_INTERVAL, limit=100)
                    if not candles or len(candles) < 30:
                        continue

                    signal = analyze(candles)

                    if signal["signal"] == "HOLD":
                        continue

                    # Get current price
                    ticker = api.get_ticker(symbol)
                    if not ticker:
                        continue

                    price = ticker["mark_price"]

                    # Refresh balance
                    wallet = api.get_balance()
                    if not wallet:
                        continue
                    balance = wallet["balance"]

                    # Calculate qty
                    qty = calculate_qty(api, symbol, balance, price)
                    if qty <= 0:
                        continue

                    # Determine side
                    side = "Buy" if signal["signal"] == "BUY" else "Sell"

                    # Calculate initial SL price
                    if side == "Buy":
                        sl_price = price * (1 - config.INITIAL_SL_PCT)
                    else:
                        sl_price = price * (1 + config.INITIAL_SL_PCT)

                    log.info(
                        f"🎯 ENTRY SIGNAL: {side} {symbol} @ {price:.4f} | "
                        f"Reason: {signal['reason']} | Qty: {qty} | SL: {sl_price:.4f}"
                    )

                    # Place order
                    order = api.open_position(symbol, side, qty, sl_price=sl_price)
                    if order:
                        # Track position
                        pos_manager.track(symbol, side, price, qty)
                        active_symbols.add(symbol)
                        log.info(f"✅ Position opened: {side} {qty} {symbol}")

                    # Only one entry per cycle
                    break

            # ── 3. PERIODIC LOGGING ──
            if cycle % 60 == 0:  # Every ~5 min at 5s interval
                n_pos = len(pos_manager.positions)
                positions_str = ", ".join(
                    f"{s}({p.side[0]}:{p.locked_steps})"
                    for s, p in pos_manager.positions.items()
                )
                log.info(
                    f"📊 Cycle {cycle} | Positions: {n_pos}/{config.MAX_OPEN_POSITIONS} "
                    f"| {positions_str or 'none'}"
                )

                # Refresh balance
                wallet = api.get_balance()
                if wallet:
                    balance = wallet["balance"]

            time.sleep(config.SCAN_INTERVAL_SECONDS)

        except KeyboardInterrupt:
            log.info("🛑 Shutting down...")
            break
        except Exception as e:
            log.error(f"Main loop error: {e}")
            time.sleep(10)

    log.info("Bot stopped. Open positions remain on Bybit.")


if __name__ == "__main__":
    run()
