"""Capital.com REST API wrapper for demo/live trading."""

import math
import requests
from typing import Optional
from logger_setup import get_logger
import config

log = get_logger("capital_api")


class CapitalAPI:
    def __init__(self):
        self.base_url = config.CAPITAL_API_URL
        self.session = requests.Session()
        self.cst: Optional[str] = None
        self.security_token: Optional[str] = None

    def login(self) -> bool:
        """Authenticate and obtain session tokens."""
        url = f"{self.base_url}/api/v1/session"
        headers = {"X-CAP-API-KEY": config.CAPITAL_API_KEY}
        payload = {
            "identifier": config.CAPITAL_EMAIL,
            "password": config.CAPITAL_PASSWORD,
        }
        try:
            resp = self.session.post(url, json=payload, headers=headers)
            if resp.status_code == 200:
                self.cst = resp.headers.get("CST")
                self.security_token = resp.headers.get("X-SECURITY-TOKEN")
                log.info("✅ Logged in to Capital.com (demo)")
                return True
            else:
                log.error(f"Login failed: {resp.status_code} — {resp.text}")
                return False
        except Exception as e:
            log.error(f"Login exception: {e}")
            return False

    def _headers(self) -> dict:
        return {
            "X-SECURITY-TOKEN": self.security_token or "",
            "CST": self.cst or "",
            "Content-Type": "application/json",
        }

    def get_account(self) -> Optional[dict]:
        """Get account balance and details."""
        try:
            resp = self.session.get(
                f"{self.base_url}/api/v1/accounts", headers=self._headers()
            )
            if resp.status_code == 200:
                accounts = resp.json().get("accounts", [])
                if accounts:
                    acct = accounts[0]
                    balance = acct.get("balance", {})
                    log.info(
                        f"💰 Balance: {balance.get('balance', 0):.2f} | "
                        f"Available: {balance.get('available', 0):.2f} | "
                        f"P&L: {balance.get('profitLoss', 0):.2f}"
                    )
                    return acct
            else:
                log.error(f"Account fetch failed: {resp.status_code}")
        except Exception as e:
            log.error(f"Account exception: {e}")
        return None

    def get_prices(self, epic: str, resolution: str, num_points: int = 60) -> Optional[dict]:
        """Fetch historical price candles."""
        try:
            resp = self.session.get(
                f"{self.base_url}/api/v1/prices/{epic}",
                params={"resolution": resolution, "max": num_points},
                headers=self._headers(),
            )
            if resp.status_code == 200:
                return resp.json()
            else:
                log.warning(f"Prices for {epic}: {resp.status_code}")
        except Exception as e:
            log.error(f"Prices exception for {epic}: {e}")
        return None

    def get_market_info(self, epic: str) -> Optional[dict]:
        """Get market details (min size, lot size, etc.)."""
        try:
            resp = self.session.get(
                f"{self.base_url}/api/v1/markets/{epic}",
                headers=self._headers(),
            )
            if resp.status_code == 200:
                return resp.json()
        except Exception as e:
            log.error(f"Market info exception for {epic}: {e}")
        return None

    def get_positions(self) -> list:
        """Get all open positions."""
        try:
            resp = self.session.get(
                f"{self.base_url}/api/v1/positions", headers=self._headers()
            )
            if resp.status_code == 200:
                return resp.json().get("positions", [])
        except Exception as e:
            log.error(f"Positions exception: {e}")
        return []

    def get_min_stop_distance(self, epic: str) -> float:
        """Fetch the minimum stop/limit distance for an instrument from the API."""
        try:
            info = self.get_market_info(epic)
            if info:
                dealing = info.get("dealingRules", {})
                # Try multiple possible paths Capital.com uses
                for key in (
                    "minNormalStopOrLimitDistance",
                    "minStopOrLimitDistance",
                    "minControlledRiskStopDistance",
                ):
                    node = dealing.get(key, {})
                    val = node.get("value", 0)
                    if val and float(val) > 0:
                        log.info(f"📏 {epic} min stop distance from API: {float(val)} (unit: {node.get('unit', '?')})")
                        return float(val)
                # Also check snapshot fallbacks
                snap = info.get("snapshot", {})
                for snap_key in ("minNormalStopOrLimitDistance", "minStopOrLimitDistance"):
                    min_stop = snap.get(snap_key, 0)
                    if min_stop and float(min_stop) > 0:
                        log.info(f"📏 {epic} min stop from snapshot {snap_key}: {float(min_stop)}")
                        return float(min_stop)
        except Exception as e:
            log.warning(f"Could not fetch min stop for {epic}: {e}")
        return 0.0

    def open_position(
        self,
        epic: str,
        direction: str,
        size: float,
        stop_distance: Optional[float] = None,
        profit_distance: Optional[float] = None,
    ) -> Optional[dict]:
        """Open a new position (BUY or SELL)."""
        payload = {
            "epic": epic,
            "direction": direction,
            "size": size,
        }
        if stop_distance is not None:
            # Capital.com requires stopDistance to be positive + finite
            try:
                sd = abs(float(stop_distance))
            except Exception:
                sd = 0.0

            if not math.isfinite(sd):
                sd = 0.0

            # Enforce minimum from API
            min_sd = self.get_min_stop_distance(epic)
            if min_sd > 0 and sd < min_sd:
                log.warning(f"⚠️ {epic} SL {sd} < min {min_sd}, bumping to {min_sd}")
                sd = min_sd * 1.05  # 5% above minimum for safety margin

            if sd <= 0:
                # Non-zero hard fallback to avoid minvalue:0 rejections
                sd = max(min_sd * 1.05, 0.01)

            # Keep precision for forex/crypto instruments
            sd = round(sd, 6)
            payload["stopDistance"] = sd
            log.info(f"📏 {epic} final stopDistance={sd} (raw={stop_distance})")
        if profit_distance is not None:
            pd = round(abs(profit_distance), 2)
            if pd > 0:
                payload["profitDistance"] = pd

        try:
            log.debug(f"Order payload {epic}: {payload}")
            resp = self.session.post(
                f"{self.base_url}/api/v1/positions",
                json=payload,
                headers=self._headers(),
            )
            if resp.status_code == 200:
                deal_ref = resp.json().get("dealReference", "?")
                log.info(
                    f"📈 OPENED {direction} {size} {epic} | "
                    f"SL: {stop_distance} | TP: {profit_distance} | Ref: {deal_ref}"
                )
                return resp.json()
            else:
                log.error(f"Open position failed: {resp.status_code} — {resp.text}")
        except Exception as e:
            log.error(f"Open position exception: {e}")
        return None

    def close_position(self, deal_id: str) -> bool:
        """Close a position by deal ID."""
        try:
            resp = self.session.delete(
                f"{self.base_url}/api/v1/positions/{deal_id}",
                headers=self._headers(),
            )
            if resp.status_code == 200:
                log.info(f"🔴 CLOSED position {deal_id}")
                return True
            else:
                log.error(f"Close failed: {resp.status_code} — {resp.text}")
        except Exception as e:
            log.error(f"Close exception: {e}")
        return False

    def ping(self) -> bool:
        """Keep session alive."""
        try:
            resp = self.session.get(
                f"{self.base_url}/api/v1/session", headers=self._headers()
            )
            return resp.status_code == 200
        except:
            return False

    def get_market_categories(self) -> list:
        """Get all top-level market navigation categories."""
        try:
            resp = self.session.get(
                f"{self.base_url}/api/v1/marketnavigation", headers=self._headers()
            )
            if resp.status_code == 200:
                return resp.json().get("nodes", [])
        except Exception as e:
            log.error(f"Market categories exception: {e}")
        return []

    def get_category_markets(self, node_id: str, limit: int = 500) -> dict:
        """Get sub-nodes and markets within a category."""
        try:
            resp = self.session.get(
                f"{self.base_url}/api/v1/marketnavigation/{node_id}",
                params={"limit": limit},
                headers=self._headers(),
            )
            if resp.status_code == 200:
                return resp.json()
        except Exception as e:
            log.error(f"Category markets exception for {node_id}: {e}")
        return {}

    def search_markets(self, search_term: str) -> list:
        """Search for markets by name."""
        try:
            resp = self.session.get(
                f"{self.base_url}/api/v1/markets",
                params={"searchTerm": search_term},
                headers=self._headers(),
            )
            if resp.status_code == 200:
                return resp.json().get("markets", [])
        except Exception as e:
            log.error(f"Search markets exception: {e}")
        return []

    def get_markets_details(self, epics: list[str]) -> list:
        """Get details for multiple markets by epic codes (max 50)."""
        if not epics:
            return []
        try:
            resp = self.session.get(
                f"{self.base_url}/api/v1/markets",
                params={"epics": ",".join(epics[:50])},
                headers=self._headers(),
            )
            if resp.status_code == 200:
                return resp.json().get("markets", [])
        except Exception as e:
            log.error(f"Markets details exception: {e}")
        return []
