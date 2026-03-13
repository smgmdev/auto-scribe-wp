"""
Local Trading Dashboard — Category Grid Layout
Real-time 1s price updates with red/green box backgrounds.

Run: python dashboard.py
Opens at: http://localhost:8050
"""

import json
import os
import time
from datetime import datetime
from http.server import HTTPServer, SimpleHTTPRequestHandler
import threading

from logger_setup import get_logger
import config

log = get_logger("dashboard")

JOURNAL_FILE = os.path.join(os.path.dirname(__file__), "trade_history.json")
LIVE_STATE_FILE = os.path.join(os.path.dirname(__file__), "live_state.json")
DASHBOARD_PORT = int(os.getenv("DASHBOARD_PORT", "8050"))


def load_live_state() -> dict:
    if os.path.exists(LIVE_STATE_FILE):
        try:
            with open(LIVE_STATE_FILE, "r") as f:
                return json.load(f)
        except:
            return {}
    return {}


def generate_api_response() -> dict:
    """JSON state grouped by category for the grid dashboard."""
    live = load_live_state()
    positions = live.get("positions", [])

    categories = {
        "Stocks": [],
        "Commodities": [],
        "Crypto": [],
        "FX": [],
    }

    cat_map = {
        config.CATEGORY_STOCKS: "Stocks",
        config.CATEGORY_CRYPTO: "Crypto",
        config.CATEGORY_COMMODITIES: "Commodities",
        config.CATEGORY_FOREX: "FX",
    }

    for pos in positions:
        raw_cat = pos.get("category", config.get_category(pos.get("epic", "")))
        display_cat = cat_map.get(raw_cat, "Stocks")

        epic = pos.get("epic", "?")
        # Format as PAIR (e.g. BTCUSD → BTC/USD)
        pair = epic
        if len(epic) >= 6 and epic.endswith("USD"):
            pair = epic[:-3] + "/USD"
        elif len(epic) >= 6 and epic.endswith("JPY"):
            pair = epic[:-3] + "/JPY"
        elif len(epic) >= 6 and epic.endswith("GBP"):
            pair = epic[:-3] + "/GBP"
        elif len(epic) >= 6 and epic.endswith("CHF"):
            pair = epic[:-3] + "/CHF"
        elif len(epic) >= 6 and epic.endswith("CAD"):
            pair = epic[:-3] + "/CAD"
        elif len(epic) >= 6 and epic.endswith("AUD"):
            pair = epic[:-3] + "/AUD"
        elif len(epic) >= 6 and epic.endswith("NZD"):
            pair = epic[:-3] + "/NZD"

        categories[display_cat].append({
            "epic": epic,
            "pair": pair,
            "price": pos.get("current_price", 0),
            "bid": pos.get("bid", 0),
            "ask": pos.get("ask", 0),
            "pnl": pos.get("unrealized_pnl", 0),
            "direction": pos.get("direction", ""),
            "entry_price": pos.get("entry_price", 0),
            "size": pos.get("size", 0),
            "locked_steps": pos.get("locked_steps", 0),
        })

    return {
        "status": live.get("status", "unknown"),
        "balance": live.get("balance", 0),
        "updated_at": live.get("updated_at", "—"),
        "total_open": len(positions),
        "categories": categories,
    }


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
    padding: 16px 32px;
    border-bottom: 1px solid #1a1a1a;
}
.topbar-left {
    display: flex;
    align-items: center;
    gap: 12px;
}
.status-dot {
    width: 10px; height: 10px;
    border-radius: 50%;
    animation: pulse 2s infinite;
}
.status-dot.running { background: #00ff88; }
.status-dot.stopped { background: #ff4444; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
.topbar-title { font-size: 14px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; }
.topbar-right { display: flex; gap: 24px; font-size: 13px; color: #888; }
.topbar-right .val { color: #fff; font-weight: 600; }

/* Grid layout */
.grid-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 40px 48px;
    gap: 24px;
}

.category-row {
    display: flex;
    align-items: center;
    gap: 24px;
}

.category-label {
    width: 140px;
    min-width: 140px;
    font-size: 28px;
    font-weight: 700;
    text-align: right;
    color: #fff;
}

.slots {
    display: flex;
    gap: 12px;
    flex: 1;
}

.slot {
    flex: 1;
    max-width: 200px;
    min-height: 80px;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 12px 8px;
    transition: background-color 0.4s ease, border-color 0.4s ease;
    position: relative;
    border: 1px solid #222;
}

.slot.empty {
    background: #111;
    border: 1px dashed #222;
}

.slot.up {
    background: #22c55e;
    border-color: #22c55e;
}

.slot.down {
    background: #dc2626;
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
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0.5px;
    text-transform: uppercase;
}

.slot-price {
    font-size: 13px;
    font-weight: 500;
    margin-top: 4px;
    opacity: 0.95;
}

.slot-pnl {
    font-size: 10px;
    margin-top: 2px;
    opacity: 0.85;
}

.slot-dir {
    position: absolute;
    top: 4px;
    right: 6px;
    font-size: 9px;
    font-weight: 700;
    opacity: 0.7;
    letter-spacing: 1px;
}

.slot-empty-text {
    font-size: 11px;
    color: #333;
    letter-spacing: 1px;
}

/* Footer */
.footer {
    text-align: center;
    padding: 12px;
    color: #333;
    font-size: 11px;
    border-top: 1px solid #111;
}
</style>
</head>
<body>

<div class="topbar">
    <div class="topbar-left">
        <span id="statusDot" class="status-dot stopped"></span>
        <span class="topbar-title">Trading Bot</span>
    </div>
    <div class="topbar-right">
        <span>Balance: <span class="val" id="balance">$0.00</span></span>
        <span>Open: <span class="val" id="openCount">0/20</span></span>
        <span>Updated: <span class="val" id="lastTick">—</span></span>
    </div>
</div>

<div class="grid-container" id="gridContainer">
    <!-- Rendered by JS -->
</div>

<div class="footer">
    Real-time 1s updates · Trading Bot v3.0
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
        html += '<div class="category-row">';
        html += '<div class="category-label">' + cat + '</div>';
        html += '<div class="slots" id="slots-' + cat + '">';
        for (let i = 0; i < MAX_SLOTS; i++) {
            html += '<div class="slot empty" id="slot-' + cat + '-' + i + '">' +
                    '<span class="slot-dir"></span>' +
                    '<span class="slot-pair"></span>' +
                    '<span class="slot-price"></span>' +
                    '<span class="slot-pnl"></span>' +
                    '<span class="slot-empty-text">—</span>' +
                    '</div>';
        }
        html += '</div></div>';
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
                const pnl = t.pnl || 0;
                const dir = t.direction || '';

                // Update text content (no DOM rebuild)
                el.querySelector('.slot-dir').textContent = dir;
                el.querySelector('.slot-pair').textContent = t.pair || epic;
                el.querySelector('.slot-price').textContent = formatPrice(price);
                el.querySelector('.slot-pnl').textContent = formatPnl(pnl);
                el.querySelector('.slot-empty-text').textContent = '';

                // Flash logic: compare to previous price
                if (prev !== undefined && prev !== price) {
                    const flash = price > prev ? 'up' : 'down';
                    el.className = 'slot ' + flash;

                    // Clear previous timer for this slot
                    const slotKey = cat + '-' + i;
                    if (flashTimers[slotKey]) clearTimeout(flashTimers[slotKey]);

                    // Keep flash for 800ms then fade to neutral-active
                    flashTimers[slotKey] = setTimeout(() => {
                        el.className = 'slot neutral-active';
                    }, 800);
                } else if (prev === undefined) {
                    // First time seeing this trade — show as active neutral
                    el.className = 'slot neutral-active';
                }
                // If price === prev, keep current class (holds last flash/neutral)

                prevPrices[epic] = price;
            } else {
                // Empty slot
                el.className = 'slot empty';
                el.querySelector('.slot-dir').textContent = '';
                el.querySelector('.slot-pair').textContent = '';
                el.querySelector('.slot-price').textContent = '';
                el.querySelector('.slot-pnl').textContent = '';
                el.querySelector('.slot-empty-text').textContent = '—';
            }
        }
    });
}

async function fetchState() {
    try {
        const resp = await fetch('/api/state');
        if (!resp.ok) return;
        const d = await resp.json();

        // Top bar
        const dot = document.getElementById('statusDot');
        dot.className = 'status-dot ' + (d.status === 'running' ? 'running' : 'stopped');
        document.getElementById('balance').textContent = '$' + (d.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        document.getElementById('openCount').textContent = (d.total_open || 0) + '/20';
        document.getElementById('lastTick').textContent = d.updated_at || '—';

        updateGrid(d);
    } catch(e) {}
}

buildGrid();
fetchState();
setInterval(fetchState, 1000);
</script>
</body>
</html>"""


class DashboardHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/" or self.path == "/index.html":
            html = generate_html()
            self.send_response(200)
            self.send_header("Content-type", "text/html")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            self.wfile.write(html.encode())
        elif self.path == "/api/state":
            data = generate_api_response()
            self.send_response(200)
            self.send_header("Content-type", "application/json")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            self.wfile.write(json.dumps(data).encode())
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


def start_dashboard_thread():
    t = threading.Thread(target=run_dashboard, daemon=True)
    t.start()
    return t


if __name__ == "__main__":
    print("╔══════════════════════════════════════════╗")
    print("║   TRADING BOT DASHBOARD                  ║")
    print(f"║   http://localhost:{DASHBOARD_PORT}                  ║")
    print("╚══════════════════════════════════════════╝")
    run_dashboard()
