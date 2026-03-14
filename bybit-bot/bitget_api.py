"""Bitget V2 API wrapper for USDT-M perpetual futures trading."""

import time
import hmac
import hashlib
import base64
import json
import requests
from typing import Optional, List, Dict, Any
from logger_setup import get_logger
import config

log = get_logger("bitget_api")

# Bitget candle granularity mapping (minutes → Bitget granularity string)
GRANULARITY_MAP = {
    "1": "1m", "3": "3m", "5": "5m", "15": "15m",
    "30": "30m", "60": "1H", "120": "2H", "240": "4H",
    "360": "6H", "720": "12H", "1440": "1D",
}


class BitgetAPI:
    """Bitget V2 REST API client for USDT-M futures."""

    PRODUCT_TYPE = "USDT-FUTURES"
    MARGIN_COIN = "USDT"

    def __init__(self):
        self.base_url = config.BITGET_BASE_URL
        self.api_key = config.BITGET_API_KEY
        self.api_secret = config.BITGET_API_SECRET
        self.passphrase = config.BITGET_API_PASSPHRASE
        self.demo = config.BITGET_DEMO
        self.session = requests.Session()

        mode = "DEMO" if self.demo else "LIVE"
        log.info(f"Bitget API initialized ({mode})")

    # ─── Auth helpers ───────────────────────────────────────

    def _timestamp(self) -> str:
        return str(int(time.time() * 1000))

    def _sign(self, timestamp: str, method: str, request_path: str, body: str = "") -> str:
        message = timestamp + method.upper() + request_path + body
        mac = hmac.new(
            self.api_secret.encode("utf-8"),
            message.encode("utf-8"),
            hashlib.sha256,
        )
        return base64.b64encode(mac.digest()).decode("utf-8")

    def _headers(self, method: str, request_path: str, body: str = "") -> dict:
        ts = self._timestamp()
        sign = self._sign(ts, method, request_path, body)
        headers = {
            "ACCESS-KEY": self.api_key,
            "ACCESS-SIGN": sign,
            "ACCESS-TIMESTAMP": ts,
            "ACCESS-PASSPHRASE": self.passphrase,
            "Content-Type": "application/json",
            "locale": "en-US",
        }
        if self.demo:
            headers["paptrading"] = "1"
        return headers

    # ─── HTTP helpers ───────────────────────────────────────

    def _get(self, path: str, params: dict = None) -> Optional[dict]:
        query = ""
        if params:
            query = "?" + "&".join(f"{k}={v}" for k, v in params.items() if v is not None)
        request_path = path + query
        url = self.base_url + request_path
        try:
            resp = self.session.get(url, headers=self._headers("GET", request_path), timeout=10)
            data = resp.json()
            if data.get("code") == "00000":
                return data.get("data")
            else:
                log.debug(f"GET {path}: {data.get('msg', data.get('code'))}")
        except Exception as e:
            log.error(f"GET {path} exception: {e}")
        return None

    def _post(self, path: str, body: dict = None) -> Optional[dict]:
        body_str = json.dumps(body) if body else ""
        url = self.base_url + path
        try:
            resp = self.session.post(
                url,
                headers=self._headers("POST", path, body_str),
                data=body_str,
                timeout=10,
            )
            data = resp.json()
            if data.get("code") == "00000":
                return data.get("data")
            else:
                log.error(f"POST {path}: {data.get('msg', data.get('code'))}")
        except Exception as e:
            log.error(f"POST {path} exception: {e}")
        return None

    # ─── Account ────────────────────────────────────────────

    def get_balance(self) -> Optional[Dict[str, Any]]:
        """Get USDT futures account balance."""
        data = self._get("/api/v2/mix/account/accounts", {
            "productType": self.PRODUCT_TYPE,
        })
        if data and isinstance(data, list):
            for acc in data:
                if acc.get("marginCoin") == self.MARGIN_COIN:
                    balance = float(acc.get("usdtEquity", 0) or acc.get("accountEquity", 0))
                    available = float(acc.get("crossedMaxAvailable", 0) or acc.get("available", 0))
                    pnl = float(acc.get("unrealizedPL", 0))
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
        return None

    # ─── Market data ────────────────────────────────────────

    def get_klines(self, symbol: str, interval: str, limit: int = 100) -> Optional[List[Dict]]:
        """Fetch candle data. Returns list sorted oldest-first."""
        granularity = GRANULARITY_MAP.get(str(interval), f"{interval}m")
        data = self._get("/api/v2/mix/market/candles", {
            "symbol": symbol,
            "productType": self.PRODUCT_TYPE,
            "granularity": granularity,
            "limit": str(limit),
        })
        if data and isinstance(data, list):
            candles = []
            for c in data:
                # Bitget V2 candle: [ts, open, high, low, close, vol, quoteVol]
                candles.append({
                    "timestamp": int(c[0]),
                    "open": float(c[1]),
                    "high": float(c[2]),
                    "low": float(c[3]),
                    "close": float(c[4]),
                    "volume": float(c[5]),
                })
            # Bitget returns newest first — reverse for oldest-first
            candles.reverse()
            return candles
        return None

    def get_ticker(self, symbol: str) -> Optional[Dict[str, Any]]:
        """Get current ticker price."""
        data = self._get("/api/v2/mix/market/ticker", {
            "symbol": symbol,
            "productType": self.PRODUCT_TYPE,
        })
        if data and isinstance(data, list) and len(data) > 0:
            t = data[0]
            return {
                "last_price": float(t.get("lastPr", 0)),
                "bid": float(t.get("bidPr", 0)),
                "ask": float(t.get("askPr", 0)),
                "mark_price": float(t.get("markPrice", t.get("lastPr", 0))),
            }
        return None

    # ─── Trading config ─────────────────────────────────────

    def set_leverage(self, symbol: str, leverage: int) -> bool:
        """Set leverage for a symbol (both sides)."""
        result = self._post("/api/v2/mix/account/set-leverage", {
            "symbol": symbol,
            "productType": self.PRODUCT_TYPE,
            "marginCoin": self.MARGIN_COIN,
            "leverage": str(leverage),
        })
        if result is not None:
            return True
        # Often fails if already set — non-critical
        return True

    # ─── Positions ──────────────────────────────────────────

    def get_positions(self) -> List[Dict[str, Any]]:
        """Get all open positions."""
        data = self._get("/api/v2/mix/position/all-position", {
            "productType": self.PRODUCT_TYPE,
            "marginCoin": self.MARGIN_COIN,
        })
        if data and isinstance(data, list):
            positions = []
            for p in data:
                size = float(p.get("total", 0) or p.get("available", 0))
                if size > 0:
                    side_str = p.get("holdSide", "long")
                    positions.append({
                        "symbol": p.get("symbol", ""),
                        "side": "Buy" if side_str == "long" else "Sell",
                        "size": size,
                        "entry_price": float(p.get("openPriceAvg", 0)),
                        "mark_price": float(p.get("markPrice", 0)),
                        "unrealized_pnl": float(p.get("unrealizedPL", 0)),
                        "leverage": p.get("leverage", "1"),
                        "created_time": int(p.get("cTime", 0)),
                    })
            return positions
        return []

    # ─── Orders ─────────────────────────────────────────────

    def open_position(self, symbol: str, side: str, qty: float, sl_price: float = None) -> Optional[Dict]:
        """
        Open a position with market order.
        side: "Buy" or "Sell"
        """
        hold_side = "long" if side == "Buy" else "short"
        body = {
            "symbol": symbol,
            "productType": self.PRODUCT_TYPE,
            "marginMode": "crossed",
            "marginCoin": self.MARGIN_COIN,
            "size": str(qty),
            "side": "buy" if side == "Buy" else "sell",
            "tradeSide": "open",
            "orderType": "market",
            "force": "gtc",
        }
        if sl_price is not None:
            body["presetStopLossPrice"] = str(round(sl_price, 6))
            body["stopLossTriggerPrice"] = str(round(sl_price, 6))

        result = self._post("/api/v2/mix/order/place-order", body)
        if result:
            order_id = result.get("orderId", result.get("clientOid", ""))
            log.info(
                f"📈 OPENED {side} {qty} {symbol} | "
                f"SL: {sl_price} | OrderID: {order_id}"
            )
            return result
        return None

    def close_position(self, symbol: str, side: str, qty: float) -> bool:
        """Close position with market order."""
        close_side = "sell" if side == "Buy" else "buy"
        hold_side = "long" if side == "Buy" else "short"
        body = {
            "symbol": symbol,
            "productType": self.PRODUCT_TYPE,
            "marginMode": "crossed",
            "marginCoin": self.MARGIN_COIN,
            "size": str(qty),
            "side": close_side,
            "tradeSide": "close",
            "orderType": "market",
            "force": "gtc",
        }
        result = self._post("/api/v2/mix/order/place-order", body)
        if result:
            log.info(f"🔴 CLOSED {symbol} | Size: {qty}")
            return True
        return False

    def update_stop_loss(self, symbol: str, side: str, sl_price: float) -> bool:
        """Update SL via modify-tpsl-order for the position."""
        hold_side = "long" if side == "Buy" else "short"
        body = {
            "symbol": symbol,
            "productType": self.PRODUCT_TYPE,
            "marginCoin": self.MARGIN_COIN,
            "holdSide": hold_side,
            "stopLossTriggerPrice": str(round(sl_price, 6)),
            "stopLossExecutePrice": "",  # market price execution
            "stopLossTriggerType": "mark_price",
        }
        # First try placing a new TPSL plan
        result = self._post("/api/v2/mix/order/place-tpsl-order", body)
        if result:
            return True
        return False

    # ─── Instrument info ────────────────────────────────────

    def get_instruments(self) -> List[Dict]:
        """Get all USDT-M futures instruments."""
        data = self._get("/api/v2/mix/market/contracts", {
            "productType": self.PRODUCT_TYPE,
        })
        return data if data and isinstance(data, list) else []

    def get_min_qty(self, symbol: str) -> float:
        """Get minimum order quantity for a symbol."""
        try:
            instruments = self.get_instruments()
            for inst in instruments:
                if inst.get("symbol") == symbol:
                    return float(inst.get("minTradeNum", 0.001))
        except Exception:
            pass
        return 0.001  # fallback
