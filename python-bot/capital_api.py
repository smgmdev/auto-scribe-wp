"""Capital.com REST API wrapper for demo/live trading.

Includes rate-limit detection, automatic retry with backoff,
and request pacing to avoid 429 errors.
"""

import math
import time
import threading
import requests
from typing import Optional
from logger_setup import get_logger
import config

log = get_logger("capital_api")

# Rate limit protection — thread-safe with Lock
_MIN_REQUEST_INTERVAL = 0.5  # 500ms between requests to stay below broker rate limits
_request_lock = threading.Lock()
_last_request_time = 0.0
_consecutive_errors = 0
_MAX_RETRIES = 2
_BACKOFF_BASE = 1.5  # seconds (was 1.0)


def _pace_request():
    """Enforce minimum interval between API requests across ALL threads."""
    global _last_request_time
    with _request_lock:
        now = time.time()
        elapsed = now - _last_request_time
        if elapsed < _MIN_REQUEST_INTERVAL:
            wait = _MIN_REQUEST_INTERVAL - elapsed
            time.sleep(wait)
        _last_request_time = time.time()


def _handle_error(resp_status: int):
    """Track consecutive errors and back off if needed."""
    global _consecutive_errors
    _consecutive_errors += 1
    if resp_status == 429:
        wait = min(30, _BACKOFF_BASE * (2 ** min(_consecutive_errors, 5)))
        log.info(f"⏳ Rate limited (429) — backing off {wait:.1f}s")
        time.sleep(wait)
    elif _consecutive_errors >= 5:
        wait = min(10, _consecutive_errors * 0.5)
        log.info(f"⏳ {_consecutive_errors} consecutive API errors — cooling {wait:.1f}s")
        time.sleep(wait)


def _handle_success():
    global _consecutive_errors
    _consecutive_errors = 0


class CapitalAPI:
    def __init__(self):
        self.base_url = config.CAPITAL_API_URL
        self.session = requests.Session()
        self.cst: Optional[str] = None
        self.security_token: Optional[str] = None
        self._invalid_epics: set[str] = set()

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
        _pace_request()
        try:
            resp = self.session.get(
                f"{self.base_url}/api/v1/accounts", headers=self._headers(), timeout=10
            )
            if resp.status_code == 200:
                _handle_success()
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
                _handle_error(resp.status_code)
                log.error(f"Account fetch failed: {resp.status_code}")
        except Exception as e:
            log.error(f"Account exception: {e}")
        return None

    def get_prices(self, epic: str, resolution: str, num_points: int = 60) -> Optional[dict]:
        """Fetch historical price candles."""
        _pace_request()
        try:
            resp = self.session.get(
                f"{self.base_url}/api/v1/prices/{epic}",
                params={"resolution": resolution, "max": num_points},
                headers=self._headers(),
                timeout=10,
            )
            if resp.status_code == 200:
                _handle_success()
                return resp.json()
            else:
                _handle_error(resp.status_code)
                log.debug(f"Prices for {epic}: {resp.status_code}")
        except Exception as e:
            log.error(f"Prices exception for {epic}: {e}")
        return None

    def get_market_info(self, epic: str) -> Optional[dict]:
        """Get market details (min size, lot size, etc.)."""
        _pace_request()
        try:
            resp = self.session.get(
                f"{self.base_url}/api/v1/markets/{epic}",
                headers=self._headers(),
                timeout=10,
            )
            if resp.status_code == 200:
                _handle_success()
                return resp.json()
            else:
                _handle_error(resp.status_code)
        except Exception as e:
            log.error(f"Market info exception for {epic}: {e}")
        return None

    def get_positions(self) -> list:
        """Get all open positions."""
        _pace_request()
        try:
            resp = self.session.get(
                f"{self.base_url}/api/v1/positions", headers=self._headers(), timeout=10
            )
            if resp.status_code == 200:
                _handle_success()
                return resp.json().get("positions", [])
            _handle_error(resp.status_code)
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
            log.info(f"Could not fetch min stop for {epic}: {e}")
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
                log.info(f"{epic} SL {sd} < min {min_sd}, bumping to {min_sd}")
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

        for attempt in range(_MAX_RETRIES + 1):
            _pace_request()
            try:
                log.debug(f"Order payload {epic}: {payload}")
                resp = self.session.post(
                    f"{self.base_url}/api/v1/positions",
                    json=payload,
                    headers=self._headers(),
                    timeout=15,
                )
                if resp.status_code == 200:
                    _handle_success()
                    deal_ref = resp.json().get("dealReference", "?")
                    log.info(
                        f"📈 OPENED {direction} {size} {epic} | "
                        f"SL: {stop_distance} | TP: {profit_distance} | Ref: {deal_ref}"
                    )
                    return resp.json()

                _handle_error(resp.status_code)
                log.error(f"Open position failed (attempt {attempt + 1}): {resp.status_code} — {resp.text}")
                if resp.status_code in (429, 500, 502, 503, 504) and attempt < _MAX_RETRIES:
                    time.sleep(_BACKOFF_BASE * (attempt + 1))
                    continue
                break
            except Exception as e:
                log.error(f"Open position exception (attempt {attempt + 1}): {e}")
                if attempt < _MAX_RETRIES:
                    time.sleep(_BACKOFF_BASE * (attempt + 1))

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
        _pace_request()
        try:
            resp = self.session.get(
                f"{self.base_url}/api/v1/session", headers=self._headers(), timeout=10
            )
            ok = resp.status_code == 200
            if ok:
                _handle_success()
            else:
                _handle_error(resp.status_code)
            return ok
        except Exception:
            return False

    def get_market_categories(self) -> list:
        """Get all top-level market navigation categories."""
        _pace_request()
        try:
            resp = self.session.get(
                f"{self.base_url}/api/v1/marketnavigation", headers=self._headers(),
                timeout=10,
            )
            if resp.status_code == 200:
                _handle_success()
                return resp.json().get("nodes", [])
            else:
                _handle_error(resp.status_code)
                log.info(f"Market categories: {resp.status_code}")
        except Exception as e:
            log.error(f"Market categories exception: {e}")
        return []

    def get_category_markets(self, node_id: str, limit: int = 500) -> dict:
        """Get sub-nodes and markets within a category."""
        _pace_request()
        for attempt in range(_MAX_RETRIES + 1):
            try:
                resp = self.session.get(
                    f"{self.base_url}/api/v1/marketnavigation/{node_id}",
                    params={"limit": limit},
                    headers=self._headers(),
                    timeout=10,
                )
                if resp.status_code == 200:
                    _handle_success()
                    return resp.json()
                else:
                    _handle_error(resp.status_code)
                    log.info(f"Category markets {node_id} attempt {attempt+1}: {resp.status_code}")
            except Exception as e:
                log.error(f"Category markets exception for {node_id} (attempt {attempt+1}): {e}")
                if attempt < _MAX_RETRIES:
                    time.sleep(1 * (attempt + 1))
        return {}

    def search_markets(self, search_term: str) -> list:
        """Search for markets by name."""
        _pace_request()
        for attempt in range(_MAX_RETRIES + 1):
            try:
                resp = self.session.get(
                    f"{self.base_url}/api/v1/markets",
                    params={"searchTerm": search_term},
                    headers=self._headers(),
                    timeout=10,
                )
                if resp.status_code == 200:
                    _handle_success()
                    return resp.json().get("markets", [])
                else:
                    _handle_error(resp.status_code)
                    log.info(f"Search markets '{search_term}' attempt {attempt+1}: {resp.status_code}")
            except Exception as e:
                log.error(f"Search markets exception '{search_term}' (attempt {attempt+1}): {e}")
                if attempt < _MAX_RETRIES:
                    time.sleep(1 * (attempt + 1))
        return []

    def get_markets_details(self, epics: list[str]) -> list:
        """Get details for multiple markets by epic codes (max 50 per request).
        Resilient to invalid epics: splits failed chunks recursively.
        """
        if not epics:
            return []

        cleaned_epics = [
            e for e in dict.fromkeys(epics)
            if e and e not in self._invalid_epics
        ]
        if not cleaned_epics:
            return []

        def _fetch_chunk(chunk: list[str], depth: int = 0) -> list:
            if not chunk:
                return []

            should_split = False
            last_status = None
            for attempt in range(_MAX_RETRIES + 1):
                _pace_request()
                try:
                    resp = self.session.get(
                        f"{self.base_url}/api/v1/markets",
                        params={"epics": ",".join(chunk[:50])},
                        headers=self._headers(),
                        timeout=15,
                    )
                    last_status = resp.status_code
                    if resp.status_code == 200:
                        _handle_success()
                        return resp.json().get("markets", [])

                    _handle_error(resp.status_code)
                    if resp.status_code >= 500:
                        log.info(
                            f"Markets details attempt {attempt+1} (chunk={len(chunk)}): {resp.status_code}"
                        )
                    else:
                        log.debug(
                            f"Markets details attempt {attempt+1} (chunk={len(chunk)}): {resp.status_code}"
                        )

                    # Split only for invalid/oversized chunk responses
                    if resp.status_code in (400, 404, 413, 414) and len(chunk) > 1:
                        should_split = True
                        break

                except Exception as e:
                    log.error(f"Markets details exception (attempt {attempt+1}, chunk={len(chunk)}): {e}")
                    if attempt < _MAX_RETRIES:
                        time.sleep(1 * (attempt + 1))

            # Split recursively only when chunk shape/content likely invalid
            if should_split and len(chunk) > 1:
                mid = len(chunk) // 2
                left = _fetch_chunk(chunk[:mid], depth + 1)
                time.sleep(0.2)
                right = _fetch_chunk(chunk[mid:], depth + 1)
                return left + right

            # Single epic failed as invalid/unavailable -> blacklist it
            if len(chunk) == 1 and last_status in (400, 404):
                bad_epic = chunk[0]
                if bad_epic not in self._invalid_epics:
                    self._invalid_epics.add(bad_epic)
                    log.info(f"🚫 Blacklisting invalid epic from batch fetch: {bad_epic}")
            return []

        all_markets: list = []
        for i in range(0, len(cleaned_epics), 50):
            chunk = cleaned_epics[i:i+50]
            all_markets.extend(_fetch_chunk(chunk))
            if i + 50 < len(cleaned_epics):
                time.sleep(0.2)

        return all_markets
