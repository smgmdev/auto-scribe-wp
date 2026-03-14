"""Bybit V5 API wrapper for perpetual futures trading."""

import time
from typing import Optional, List, Dict, Any
from pybit.unified_trading import HTTP
from logger_setup import get_logger
import config

log = get_logger("bybit_api")


class BybitAPI:
    def __init__(self):
        self.client = HTTP(
            testnet="testnet" in config.BYBIT_BASE_URL,
            api_key=config.BYBIT_API_KEY,
            api_secret=config.BYBIT_API_SECRET,
        )

    def get_balance(self):
        # type: () -> Optional[Dict[str, Any]]
        """Get USDT balance from unified account."""
        try:
            resp = self.client.get_wallet_balance(accountType="UNIFIED")
            if resp["retCode"] == 0:
                for account in resp["result"]["list"]:
                    for coin in account.get("coin", []):
                        if coin["coin"] == "USDT":
                            balance = float(coin["walletBalance"])
                            available = float(coin["availableToWithdraw"])
                            pnl = float(coin.get("unrealisedPnl", 0))
                            log.info(
                                f"💰 Balance: {balance:.2f} USDT | "
                                f"Available: {available:.2f} | "
                                f"Unrealized P&L: {pnl:.2f}"
                            )
                            return {
                                "balance": balance,
                                "available": available,
                                "unrealized_pnl": pnl,
                            }
            else:
                log.error(f"Balance fetch failed: {resp['retMsg']}")
        except Exception as e:
            log.error(f"Balance exception: {e}")
        return None

    def get_klines(self, symbol, interval, limit=100):
        # type: (str, str, int) -> Optional[List[Dict]]
        """Fetch kline/candle data. Returns list of dicts sorted oldest-first."""
        try:
            resp = self.client.get_kline(
                category="linear",
                symbol=symbol,
                interval=interval,
                limit=limit,
            )
            if resp["retCode"] == 0:
                # Bybit returns newest first, reverse for oldest-first
                raw = resp["result"]["list"]
                candles = []
                for c in reversed(raw):
                    candles.append({
                        "timestamp": int(c[0]),
                        "open": float(c[1]),
                        "high": float(c[2]),
                        "low": float(c[3]),
                        "close": float(c[4]),
                        "volume": float(c[5]),
                    })
                return candles
            else:
                log.debug(f"Klines {symbol}: {resp['retMsg']}")
        except Exception as e:
            log.error(f"Klines exception {symbol}: {e}")
        return None

    def get_ticker(self, symbol):
        # type: (str) -> Optional[Dict[str, Any]]
        """Get current ticker price."""
        try:
            resp = self.client.get_tickers(
                category="linear",
                symbol=symbol,
            )
            if resp["retCode"] == 0:
                data = resp["result"]["list"][0]
                return {
                    "last_price": float(data["lastPrice"]),
                    "bid": float(data["bid1Price"]),
                    "ask": float(data["ask1Price"]),
                    "mark_price": float(data.get("markPrice", data["lastPrice"])),
                }
            else:
                log.debug(f"Ticker {symbol}: {resp['retMsg']}")
        except Exception as e:
            log.error(f"Ticker exception {symbol}: {e}")
        return None

    def set_leverage(self, symbol, leverage):
        # type: (str, int) -> bool
        """Set leverage for a symbol."""
        try:
            resp = self.client.set_leverage(
                category="linear",
                symbol=symbol,
                buyLeverage=str(leverage),
                sellLeverage=str(leverage),
            )
            if resp["retCode"] == 0 or "not modified" in resp.get("retMsg", "").lower():
                return True
            else:
                log.debug(f"Set leverage {symbol}: {resp['retMsg']}")
                return True  # Often fails if already set
        except Exception as e:
            log.debug(f"Leverage exception {symbol}: {e}")
            return True  # Non-critical

    def get_positions(self):
        # type: () -> List[Dict[str, Any]]
        """Get all open positions."""
        try:
            resp = self.client.get_positions(
                category="linear",
                settleCoin="USDT",
            )
            if resp["retCode"] == 0:
                positions = []
                for p in resp["result"]["list"]:
                    size = float(p.get("size", 0))
                    if size > 0:
                        positions.append({
                            "symbol": p["symbol"],
                            "side": p["side"],  # "Buy" or "Sell"
                            "size": size,
                            "entry_price": float(p["avgPrice"]),
                            "mark_price": float(p.get("markPrice", 0)),
                            "unrealized_pnl": float(p.get("unrealisedPnl", 0)),
                            "leverage": p.get("leverage", "1"),
                            "created_time": int(p.get("createdTime", 0)),
                        })
                return positions
            else:
                log.error(f"Positions fetch failed: {resp['retMsg']}")
        except Exception as e:
            log.error(f"Positions exception: {e}")
        return []

    def open_position(self, symbol, side, qty, sl_price=None):
        # type: (str, str, float, Optional[float]) -> Optional[Dict]
        """
        Open a position with market order.
        side: "Buy" or "Sell"
        qty: quantity in contracts/coins
        sl_price: optional stop-loss trigger price
        """
        try:
            params = {
                "category": "linear",
                "symbol": symbol,
                "side": side,
                "orderType": "Market",
                "qty": str(qty),
                "timeInForce": "GTC",
            }
            if sl_price is not None:
                params["stopLoss"] = str(round(sl_price, 4))
                params["slTriggerBy"] = "MarkPrice"

            resp = self.client.place_order(**params)
            if resp["retCode"] == 0:
                order_id = resp["result"]["orderId"]
                log.info(
                    f"📈 OPENED {side} {qty} {symbol} | "
                    f"SL: {sl_price} | OrderID: {order_id}"
                )
                return resp["result"]
            else:
                log.error(f"Open position failed: {resp['retMsg']}")
        except Exception as e:
            log.error(f"Open position exception: {e}")
        return None

    def close_position(self, symbol, side, qty):
        # type: (str, str, float) -> bool
        """Close position with market order. side = opposite of position side."""
        try:
            close_side = "Sell" if side == "Buy" else "Buy"
            resp = self.client.place_order(
                category="linear",
                symbol=symbol,
                side=close_side,
                orderType="Market",
                qty=str(qty),
                reduceOnly=True,
                timeInForce="GTC",
            )
            if resp["retCode"] == 0:
                log.info(f"🔴 CLOSED {symbol} | Size: {qty}")
                return True
            else:
                log.error(f"Close failed {symbol}: {resp['retMsg']}")
        except Exception as e:
            log.error(f"Close exception {symbol}: {e}")
        return False

    def update_stop_loss(self, symbol, side, sl_price):
        # type: (str, str, float) -> bool
        """Update the stop-loss for an open position via trading stop."""
        try:
            resp = self.client.set_trading_stop(
                category="linear",
                symbol=symbol,
                stopLoss=str(round(sl_price, 4)),
                slTriggerBy="MarkPrice",
                positionIdx=0,  # one-way mode
            )
            if resp["retCode"] == 0:
                return True
            else:
                log.debug(f"Update SL {symbol}: {resp['retMsg']}")
                return False
        except Exception as e:
            log.error(f"Update SL exception {symbol}: {e}")
            return False

    def get_instruments(self):
        # type: () -> List[Dict]
        """Get tradable linear instruments."""
        try:
            resp = self.client.get_instruments_info(
                category="linear",
            )
            if resp["retCode"] == 0:
                return resp["result"]["list"]
        except Exception as e:
            log.error(f"Instruments exception: {e}")
        return []

    def get_min_qty(self, symbol):
        # type: (str) -> float
        """Get minimum order quantity for a symbol."""
        try:
            instruments = self.get_instruments()
            for inst in instruments:
                if inst["symbol"] == symbol:
                    return float(inst["lotSizeFilter"]["minOrderQty"])
        except Exception:
            pass
        return 0.001  # fallback
