"""
Local Trading Dashboard — Category Grid Layout
Real-time 1s price updates with red/green box backgrounds.

The dashboard runs its own price-fetching thread that polls Capital.com
directly every 1 second for live bid/ask on open positions.
This is independent of the main bot loop, so prices update even when
the bot is busy scanning assets.

Run: python dashboard.py
Opens at: http://localhost:8050
"""

import json
import math
import os
import time
import subprocess
import sys
import threading
from datetime import datetime
from http.server import HTTPServer, ThreadingHTTPServer, SimpleHTTPRequestHandler

from logger_setup import get_logger
import config

log = get_logger("dashboard")

JOURNAL_FILE = os.path.join(os.path.dirname(__file__), "trade_history.json")
LIVE_STATE_FILE = os.path.join(os.path.dirname(__file__), "live_state.json")
DASHBOARD_PORT = int(os.getenv("DASHBOARD_PORT", "8050"))

# ═══════════════════════════════════════════════
# LIVE PRICE CACHE — updated by dedicated thread
# ═══════════════════════════════════════════════
_live_cache = {
    "status": "starting",
    "balance": 0,
    "positions": [],
    "updated_at": "—",
    "total_open": 0,
    "categories": {"Stocks": [], "Commodities": [], "Crypto": [], "FX": []},
    "tick_count": 0,
}
_cache_lock = threading.Lock()
_api_ref = None  # Set by start_dashboard_thread

# Categories disabled by toggle — positions get closed, no new trades
_disabled_categories: set = set()
_disabled_lock = threading.Lock()


def is_category_disabled(display_cat: str) -> bool:
    with _disabled_lock:
        return display_cat in _disabled_categories


def set_category_disabled(display_cat: str, disabled: bool):
    with _disabled_lock:
        if disabled:
            _disabled_categories.add(display_cat)
        else:
            _disabled_categories.discard(display_cat)


def _price_fetcher_loop():
    """
    Dedicated thread: fetches positions + live prices from Capital.com
    every ~1 second. Completely independent of the main bot loop.
    """
    global _live_cache

    cat_map = {
        config.CATEGORY_STOCKS: "Stocks",
        config.CATEGORY_CRYPTO: "Crypto",
        config.CATEGORY_COMMODITIES: "Commodities",
        config.CATEGORY_FOREX: "FX",
    }

    tick_count = 0

    while True:
        try:
            tick_count += 1

            # Fallback mode: if dashboard is started standalone, read live_state.json
            if _api_ref is None:
                try:
                    if os.path.exists(LIVE_STATE_FILE):
                        with open(LIVE_STATE_FILE, "r") as f:
                            state = json.load(f)

                        categories = {"Stocks": [], "Commodities": [], "Crypto": [], "FX": []}
                        for p in state.get("positions", []):
                            epic = p.get("epic", "")
                            raw_cat = p.get("category") or config.get_category(epic)
                            display_cat = cat_map.get(raw_cat, "Stocks")

                            pair = epic
                            for suffix in ("USD", "JPY", "GBP", "CHF", "CAD", "AUD", "NZD", "EUR"):
                                if len(epic) >= 6 and epic.endswith(suffix):
                                    pair = epic[:-len(suffix)] + "/" + suffix
                                    break

                            categories[display_cat].append({
                                "epic": epic,
                                "pair": pair,
                                "price": round(float(p.get("current_price", 0) or 0), 6),
                                "bid": round(float(p.get("bid", 0) or 0), 6),
                                "ask": round(float(p.get("ask", 0) or 0), 6),
                                "pnl": round(float(p.get("unrealized_pnl", 0) or 0), 5),
                                "direction": p.get("direction", ""),
                                "entry_price": float(p.get("entry_price", 0) or 0),
                                "size": float(p.get("size", 0) or 0),
                            })

                        with _cache_lock:
                            _live_cache = {
                                "status": "running-file",
                                "balance": state.get("balance", _live_cache.get("balance", 0)),
                                "positions": [],
                                "updated_at": state.get("updated_at", "—"),
                                "total_open": len(state.get("positions", [])),
                                "categories": categories,
                                "tick_count": tick_count,
                            }
                    else:
                        with _cache_lock:
                            _live_cache["status"] = "waiting-file"
                            _live_cache["tick_count"] = tick_count
                except Exception as e:
                    log.debug(f"Fallback state read error: {e}")

                time.sleep(1)
                continue

            # 1) Fetch open positions (includes entry price, direction, P&L)
            positions = _api_ref.get_positions()

            # 2) Batch-fetch live bid/ask for all position epics
            epics = []
            for pos in positions:
                epic = pos.get("market", {}).get("epic", "")
                if epic and epic not in epics:
                    epics.append(epic)

            live_prices = {}
            if epics:
                try:
                    details = _api_ref.get_markets_details(epics[:50])
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
                except Exception:
                    pass

            # 3) Fetch balance every 10 ticks
            balance = _live_cache.get("balance", 0)
            if tick_count % 10 == 1:
                try:
                    acct = _api_ref.get_account()
                    if acct:
                        balance = acct.get("balance", {}).get("balance", 0)
                except Exception:
                    pass

            # 4) Build categorized position list
            categories = {"Stocks": [], "Commodities": [], "Crypto": [], "FX": []}

            for pos in positions:
                epic = pos.get("market", {}).get("epic", "")
                direction = pos.get("position", {}).get("direction", "")
                entry_price = float(pos.get("position", {}).get("level", 0))
                size = float(pos.get("position", {}).get("size", 0))

                # Use live-fetched price (priority) or position market data (fallback)
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
                    else:
                        current_price = entry_price
                        bid = ask = entry_price

                # P&L from API or calculate
                api_pnl = pos.get("position", {}).get("profit")
                if api_pnl is not None:
                    pnl = float(api_pnl)
                else:
                    if direction == "BUY":
                        pnl = current_price - entry_price
                    else:
                        pnl = entry_price - current_price

                # Format pair name
                pair = epic
                for suffix in ("USD", "JPY", "GBP", "CHF", "CAD", "AUD", "NZD", "EUR"):
                    if len(epic) >= 6 and epic.endswith(suffix):
                        pair = epic[:-len(suffix)] + "/" + suffix
                        break

                raw_cat = config.get_category(epic)
                display_cat = cat_map.get(raw_cat, "Stocks")

                categories[display_cat].append({
                    "epic": epic,
                    "pair": pair,
                    "price": round(current_price, 6),
                    "bid": round(bid, 6),
                    "ask": round(ask, 6),
                    "pnl": round(pnl, 5),
                    "direction": direction,
                    "entry_price": entry_price,
                    "size": size,
                })

            now = datetime.utcnow()
            updated_at = now.strftime("%H:%M:%S.") + f"{now.microsecond // 1000:03d}"

            with _cache_lock:
                _live_cache = {
                    "status": "running",
                    "balance": balance,
                    "positions": [],  # not used by frontend
                    "updated_at": updated_at,
                    "total_open": len(positions),
                    "categories": categories,
                    "tick_count": tick_count,
                }

        except Exception as e:
            log.debug(f"Price fetcher error: {e}")

        time.sleep(1)


def generate_api_response() -> dict:
    """Return the live cache (updated every 1s by dedicated thread)."""
    with _cache_lock:
        data = dict(_live_cache)
    with _disabled_lock:
        data["disabled_categories"] = list(_disabled_categories)
    return data


def generate_html() -> str:
    return """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Trading Bot — Live Grid</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
    background: #000;
    color: #fff;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
}

/* Top bar */
.topbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 20px;
    border-bottom: 1px solid #1a1a1a;
    flex-wrap: wrap;
    gap: 8px;
}
.topbar-left {
    display: flex;
    align-items: center;
    gap: 10px;
}
.status-dot {
    width: 10px; height: 10px;
    border-radius: 50%;
    animation: pulse 2s infinite;
}
.status-dot.running { background: #00ff88; }
.status-dot.stopped { background: #ff4444; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
.topbar-title { font-size: 13px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; }
.topbar-right { display: flex; gap: 16px; font-size: 12px; color: #888; flex-wrap: wrap; }
.topbar-right .val { color: #fff; font-weight: 600; }
#updateBtn {
    background: #222;
    color: #fff;
    border: 1px solid #444;
    padding: 4px 12px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    letter-spacing: 0.5px;
    transition: background 0.2s;
}
#updateBtn:hover { background: #333; border-color: #666; }
#updateBtn:disabled { opacity: 0.5; cursor: not-allowed; }
#updateBtn.success { background: #16a34a; border-color: #22c55e; }
#updateBtn.error { background: #b91c1c; border-color: #dc2626; }
.tick-counter { font-variant-numeric: tabular-nums; }

/* Grid layout */
.grid-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 20px;
    gap: 16px;
    overflow: hidden;
}

.category-row {
    display: flex;
    align-items: stretch;
    gap: 16px;
}

.category-label {
    width: 100px;
    min-width: 100px;
    font-size: 18px;
    font-weight: 700;
    text-align: right;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: flex-end;
}

.slots {
    display: flex;
    gap: 8px;
    flex: 1;
    min-width: 0;
}

.slot {
    flex: 1;
    min-width: 0;
    min-height: 70px;
    border-radius: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 10px 6px;
    transition: background-color 0.15s ease, border-color 0.15s ease;
    position: relative;
    border: 1px solid #222;
    overflow: hidden;
}

.slot.empty {
    background: #111;
    border: 1px dashed #222;
}

.slot.up {
    background: #16a34a;
    border-color: #22c55e;
}

.slot.down {
    background: #b91c1c;
    border-color: #dc2626;
}

.slot.neutral {
    background: #333;
    border-color: #444;
}

.slot.neutral-active {
    background: #1a1a2e;
    border-color: #333;
}

.slot-pair {
    font-size: clamp(10px, 1.4vw, 15px);
    font-weight: 700;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
}

.slot-price {
    font-size: clamp(9px, 1.2vw, 13px);
    font-weight: 500;
    margin-top: 3px;
    opacity: 0.95;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}

.slot-entry {
    font-size: clamp(8px, 1vw, 11px);
    margin-top: 2px;
    opacity: 0.6;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}

.slot-pnl {
    font-size: clamp(9px, 1.1vw, 13px);
    margin-top: 3px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
}

.slot-dir {
    position: absolute;
    top: 3px;
    right: 5px;
    font-size: 8px;
    font-weight: 700;
    opacity: 0.7;
    letter-spacing: 1px;
}

.slot-empty-text {
    font-size: 11px;
    color: #333;
    letter-spacing: 1px;
}

/* Category toggle */
.cat-toggle {
    position: relative;
    width: 32px; height: 16px;
    background: #b91c1c;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.2s;
    margin-top: 6px;
    flex-shrink: 0;
}
.cat-toggle.on { background: #16a34a; }
.cat-toggle .knob {
    position: absolute;
    top: 2px; left: 2px;
    width: 12px; height: 12px;
    background: #fff;
    border-radius: 50%;
    transition: left 0.2s;
}
.cat-toggle.on .knob { left: 18px; }
.category-label { flex-direction: column; }
.cat-status {
    font-size: 8px;
    color: #666;
    margin-top: 2px;
    letter-spacing: 0.5px;
    text-transform: uppercase;
}

/* Footer */
.footer {
    text-align: center;
    padding: 10px;
    color: #333;
    font-size: 11px;
    border-top: 1px solid #111;
}

/* ═══ Responsive ═══ */
@media (max-width: 900px) {
    .grid-container { padding: 16px 12px; gap: 12px; }
    .category-label { width: 70px; min-width: 70px; font-size: 14px; }
    .slots { gap: 6px; }
    .slot { min-height: 60px; padding: 8px 4px; border-radius: 0; }
}

@media (max-width: 600px) {
    .topbar { padding: 10px 12px; }
    .topbar-right { gap: 10px; font-size: 11px; }
    .grid-container { padding: 12px 8px; gap: 10px; }
    .category-row { gap: 8px; }
    .category-label { width: 50px; min-width: 50px; font-size: 12px; }
    .slots { gap: 4px; }
    .slot { min-height: 50px; padding: 6px 3px; border-radius: 0; }
    .slot-dir { font-size: 7px; top: 2px; right: 3px; }
}
</style>
</head>
<body>

<div class="topbar">
    <div class="topbar-left">
        <span id="statusDot" class="status-dot stopped"></span>
    </div>
    <div class="topbar-right">
        <span>Balance: <span class="val" id="balance">$0.00</span></span>
        <span>Open: <span class="val" id="openCount">0/5</span></span>
        <span>Updated: <span class="val tick-counter" id="lastTick">—</span></span>
        <button id="updateBtn" onclick="pullAndRestart()" title="Git pull &amp; restart bot">⟳ Update</button>
    </div>
</div>

<div class="grid-container" id="gridContainer">
    <!-- Rendered by JS -->
</div>

<div class="footer">
    Direct API price feed · 1s updates · Trading Bot v3.1
</div>

<script>
const MAX_SLOTS = 5;
const CATEGORIES = ['Stocks', 'Commodities', 'Crypto', 'FX'];
const prevPrices = {};
const flashTimers = {};
let gridBuilt = false;

function formatPrice(val) {
    if (val === 0) return '—';
    if (val >= 1000) return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (val >= 1) return val.toFixed(4);
    return val.toFixed(6);
}

function formatPnl(val) {
    return (val >= 0 ? '+' : '') + val.toFixed(2);
}

function buildGrid() {
    const container = document.getElementById('gridContainer');
    let html = '';

    CATEGORIES.forEach(cat => {
        html += `<div class="category-row" id="row-${cat}">`;
        html += `<div class="category-label">${cat}` +
                `<div class="cat-toggle on" id="toggle-${cat}" onclick="toggleCategory('${cat}')">` +
                `<div class="knob"></div></div>` +
                `<span class="cat-status" id="status-${cat}">ACTIVE</span></div>`;
        html += `<div class="slots" id="slots-${cat}">`;

        for (let i = 0; i < MAX_SLOTS; i++) {
            html += `<div class="slot empty" id="slot-${cat}-${i}">` +
                    `<span class="slot-dir"></span>` +
                    `<span class="slot-pair"></span>` +
                    `<span class="slot-price"></span>` +
                    `<span class="slot-entry"></span>` +
                    `<span class="slot-pnl"></span>` +
                    `<span class="slot-empty-text">—</span>` +
                    `</div>`;
        }

        html += `</div></div>`;
    });

    container.innerHTML = html;
    gridBuilt = true;
}

function updateGrid(data) {
    if (!gridBuilt) buildGrid();
    const cats = data.categories || {};

    CATEGORIES.forEach(cat => {
        const trades = cats[cat] || [];
        for (let i = 0; i < MAX_SLOTS; i++) {
            const el = document.getElementById('slot-' + cat + '-' + i);
            if (!el) continue;

            if (i < trades.length) {
                const t = trades[i];
                const epic = t.epic || '?';
                const price = t.price || 0;
                const prev = prevPrices[epic];
                const pnl = (t.pnl !== undefined && t.pnl !== null) ? t.pnl : 0;
                const dir = t.direction || '';
                const entryP = t.entry_price || 0;

                // Update text
                el.querySelector('.slot-dir').textContent = dir;
                el.querySelector('.slot-pair').textContent = t.pair || epic;
                el.querySelector('.slot-price').textContent = formatPrice(price);
                el.querySelector('.slot-entry').textContent = 'Entry: ' + formatPrice(entryP);

                // P&L number + percentage
                var pnlPct = (entryP > 0) ? (((price - entryP) / entryP) * 100 * (dir === 'BUY' ? 1 : -1)) : 0;
                var pnlAbs = (dir === 'BUY') ? (price - entryP) : (entryP - price);
                var pnlText = formatPnl(pnl) + ' (' + (pnlPct >= 0 ? '+' : '') + pnlPct.toFixed(2) + '%)';
                el.querySelector('.slot-pnl').textContent = pnlText;
                el.querySelector('.slot-pnl').style.color = pnlPct >= 0 ? '#4ade80' : '#f87171';
                el.querySelector('.slot-empty-text').textContent = '';

                // Flash on price change — quick 150ms transition
                if (prev !== undefined && prev !== price) {
                    const flash = price > prev ? 'up' : 'down';
                    el.className = 'slot ' + flash;

                    const slotKey = cat + '-' + i;
                    if (flashTimers[slotKey]) clearTimeout(flashTimers[slotKey]);

                    // Keep flash for 800ms then fade to neutral-active
                    flashTimers[slotKey] = setTimeout(() => {
                        el.className = 'slot neutral-active';
                    }, 600);
                } else if (prev === undefined) {
                    el.className = 'slot neutral-active';
                }

                prevPrices[epic] = price;
            } else {
                el.className = 'slot empty';
                el.querySelector('.slot-dir').textContent = '';
                el.querySelector('.slot-pair').textContent = '';
                el.querySelector('.slot-price').textContent = '';
                el.querySelector('.slot-entry').textContent = '';
                el.querySelector('.slot-pnl').textContent = '';
                el.querySelector('.slot-pnl').style.color = '';
                el.querySelector('.slot-empty-text').textContent = '—';
            }
        }
    });
}

async function toggleCategory(cat) {
    const toggle = document.getElementById('toggle-' + cat);
    const isOn = toggle.classList.contains('on');
    const newState = !isOn;

    // Optimistic UI
    toggle.classList.toggle('on');
    document.getElementById('status-' + cat).textContent = newState ? 'ACTIVE' : 'OFF';

    try {
        const resp = await fetch('/api/toggle-category', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ category: cat, enabled: newState })
        });
        const d = await resp.json();
        if (!d.ok) {
            // Revert
            toggle.classList.toggle('on');
            document.getElementById('status-' + cat).textContent = isOn ? 'ACTIVE' : 'OFF';
        }
    } catch(e) {
        toggle.classList.toggle('on');
        document.getElementById('status-' + cat).textContent = isOn ? 'ACTIVE' : 'OFF';
    }
}

function syncToggles(disabledList) {
    CATEGORIES.forEach(cat => {
        const toggle = document.getElementById('toggle-' + cat);
        const status = document.getElementById('status-' + cat);
        if (!toggle) return;
        const isDisabled = (disabledList || []).includes(cat);
        if (isDisabled) {
            toggle.classList.remove('on');
            status.textContent = 'OFF';
        } else {
            toggle.classList.add('on');
            status.textContent = 'ACTIVE';
        }
    });
}

async function fetchState() {
    try {
        const resp = await fetch('/api/state?t=' + Date.now(), { cache: 'no-store' });
        if (!resp.ok) return;
        const d = await resp.json();

        const dot = document.getElementById('statusDot');
        dot.className = 'status-dot ' + ((d.status === 'running' || d.status === 'running-file') ? 'running' : 'stopped');
        document.getElementById('balance').textContent = '$' + (d.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        document.getElementById('openCount').textContent = (d.total_open || 0) + '/5';
        document.getElementById('lastTick').textContent = d.updated_at || '—';

        syncToggles(d.disabled_categories);
        updateGrid(d);
    } catch(e) {
        console.error('fetchState failed:', e);
        const dot = document.getElementById('statusDot');
        if (dot) dot.className = 'status-dot stopped';
        const tick = document.getElementById('lastTick');
        if (tick) tick.textContent = 'API ERR';
    }
}

async function pullAndRestart() {
    const btn = document.getElementById('updateBtn');
    btn.disabled = true;
    btn.textContent = '⟳ Pulling...';
    btn.className = '';
    try {
        const resp = await fetch('/api/pull-restart', { method: 'POST' });
        const d = await resp.json();
        if (d.ok) {
            btn.textContent = '✓ Restarting...';
            btn.className = 'success';
            setTimeout(() => { location.reload(); }, 3000);
        } else {
            btn.textContent = '✗ Failed';
            btn.className = 'error';
            setTimeout(() => { btn.textContent = '⟳ Update'; btn.className = ''; btn.disabled = false; }, 3000);
        }
    } catch(e) {
        btn.textContent = '✗ Error';
        btn.className = 'error';
        setTimeout(() => { btn.textContent = '⟳ Update'; btn.className = ''; btn.disabled = false; }, 3000);
    }
}

buildGrid();
fetchState();
setInterval(fetchState, 1000);
</script>
</body>
</html>"""


def _safe_json(value):
    """Recursively sanitize data so JSON output is always browser-parseable."""
    if isinstance(value, float):
        return value if math.isfinite(value) else 0.0
    if isinstance(value, dict):
        return {k: _safe_json(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_safe_json(v) for v in value]
    if isinstance(value, tuple):
        return [_safe_json(v) for v in value]
    return value


class DashboardHandler(SimpleHTTPRequestHandler):
    def _json_response(self, data, status=200):
        safe_data = _safe_json(data)
        self.send_response(status)
        self.send_header("Content-type", "application/json")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(json.dumps(safe_data, allow_nan=False).encode())

    def do_GET(self):
        if self.path == "/" or self.path == "/index.html":
            html = generate_html()
            self.send_response(200)
            self.send_header("Content-type", "text/html")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            self.wfile.write(html.encode())
        elif self.path.startswith("/api/state"):
            data = _safe_json(generate_api_response())
            self.send_response(200)
            self.send_header("Content-type", "application/json")
            self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
            self.send_header("Pragma", "no-cache")
            self.send_header("Expires", "0")
            self.end_headers()
            self.wfile.write(json.dumps(data, allow_nan=False).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path == "/api/toggle-category":
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = json.loads(self.rfile.read(content_length)) if content_length > 0 else {}
                cat = body.get("category", "")
                enabled = body.get("enabled", True)

                if cat not in ['Stocks', 'Commodities', 'Crypto', 'FX']:
                    self._json_response({"ok": False, "error": "Invalid category"})
                    return

                set_category_disabled(cat, not enabled)
                log.info(f"{'✅' if enabled else '🚫'} Category {cat} {'ENABLED' if enabled else 'DISABLED'}")

                # If disabling, close all positions in that category
                if not enabled and _api_ref:
                    cat_map_reverse = {"Stocks": "stocks", "Commodities": "commodities", "Crypto": "crypto", "FX": "forex"}
                    target_cat = cat_map_reverse.get(cat, "")

                    def _close_cat_positions():
                        try:
                            positions = _api_ref.get_positions()
                            import config as cfg
                            for pos in positions:
                                epic = pos.get("market", {}).get("epic", "")
                                deal_id = pos.get("position", {}).get("dealId", "")
                                if epic and deal_id and cfg.get_category(epic) == target_cat:
                                    log.info(f"  🚫 Toggle-closing {epic} deal={deal_id}")
                                    _api_ref.close_position(deal_id)
                                    time.sleep(0.3)
                        except Exception as e:
                            log.error(f"Toggle close error: {e}")

                    threading.Thread(target=_close_cat_positions, daemon=True).start()

                self._json_response({"ok": True, "category": cat, "enabled": enabled})
            except Exception as e:
                log.error(f"Toggle error: {e}")
                self._json_response({"ok": False, "error": str(e)})

        elif self.path == "/api/pull-restart":
            try:
                bot_dir = os.path.dirname(os.path.abspath(__file__))
                # Git pull
                result = subprocess.run(
                    ["git", "pull"], cwd=bot_dir, capture_output=True, text=True, timeout=30
                )
                log.info(f"Git pull: {result.stdout.strip()}")
                if result.returncode != 0:
                    log.error(f"Git pull error: {result.stderr.strip()}")
                    self.send_response(200)
                    self.send_header("Content-type", "application/json")
                    self.end_headers()
                    self.wfile.write(json.dumps({"ok": False, "error": result.stderr.strip()}).encode())
                    return

                self.send_response(200)
                self.send_header("Content-type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"ok": True, "git": result.stdout.strip()}).encode())

                # Restart the bot process after response is sent
                def _restart():
                    time.sleep(1)
                    log.info("🔄 Restarting bot process...")
                    os.execv(sys.executable, [sys.executable, os.path.join(bot_dir, "main.py")])

                restart_thread = threading.Thread(target=_restart, daemon=True)
                restart_thread.start()

            except Exception as e:
                log.error(f"Pull/restart error: {e}")
                self.send_response(200)
                self.send_header("Content-type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"ok": False, "error": str(e)}).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        pass


def run_dashboard():
    server = HTTPServer(("0.0.0.0", DASHBOARD_PORT), DashboardHandler)
    log.info(f"📊 Dashboard running at http://localhost:{DASHBOARD_PORT}")
    print(f"\n  📊 Dashboard: http://localhost:{DASHBOARD_PORT}\n")
    server.serve_forever()


def start_dashboard_thread(api=None):
    """Start dashboard HTTP server + live price fetcher threads."""
    global _api_ref
    _api_ref = api

    # Start the dedicated price fetcher thread
    fetcher = threading.Thread(target=_price_fetcher_loop, daemon=True)
    fetcher.start()

    # Start the HTTP server thread
    t = threading.Thread(target=run_dashboard, daemon=True)
    t.start()
    return t


if __name__ == "__main__":
    print("╔══════════════════════════════════════════╗")
    print("║   TRADING BOT DASHBOARD                  ║")
    print(f"║   http://localhost:{DASHBOARD_PORT}                  ║")
    print("╚══════════════════════════════════════════╝")
    run_dashboard()
