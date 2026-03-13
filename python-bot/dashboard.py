"""
Local Trading Dashboard — runs on Mac Mini
Real-time 1s price updates with green/red flash on price changes.

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


def load_trades() -> list[dict]:
    if os.path.exists(JOURNAL_FILE):
        try:
            with open(JOURNAL_FILE, "r") as f:
                return json.load(f)
        except:
            return []
    return []


def load_live_state() -> dict:
    if os.path.exists(LIVE_STATE_FILE):
        try:
            with open(LIVE_STATE_FILE, "r") as f:
                return json.load(f)
        except:
            return {}
    return {}


def category_stats(trades: list[dict], category: str) -> dict:
    cat_trades = [t for t in trades if config.get_category(t.get("epic", "")) == category]
    if not cat_trades:
        return {"total": 0, "wins": 0, "losses": 0, "win_rate": 0, "total_pnl": 0,
                "avg_pnl": 0, "best_trade": 0, "worst_trade": 0, "avg_duration": 0}

    wins = sum(1 for t in cat_trades if t.get("won"))
    pnls = [t.get("pnl", 0) for t in cat_trades]
    durations = [t.get("duration_seconds", 0) for t in cat_trades]

    return {
        "total": len(cat_trades),
        "wins": wins,
        "losses": len(cat_trades) - wins,
        "win_rate": round(wins / len(cat_trades) * 100, 1),
        "total_pnl": round(sum(pnls), 5),
        "avg_pnl": round(sum(pnls) / len(pnls), 5),
        "best_trade": round(max(pnls), 5),
        "worst_trade": round(min(pnls), 5),
        "avg_duration": round(sum(durations) / len(durations), 0),
    }


def generate_api_response() -> dict:
    """Full JSON state for the dashboard frontend."""
    trades = load_trades()
    live = load_live_state()

    stocks_stats = category_stats(trades, config.CATEGORY_STOCKS)
    crypto_stats = category_stats(trades, config.CATEGORY_CRYPTO)
    commodities_stats = category_stats(trades, config.CATEGORY_COMMODITIES)

    total_trades = len(trades)
    total_wins = sum(1 for t in trades if t.get("won"))
    total_pnl = sum(t.get("pnl", 0) for t in trades)
    overall_wr = round(total_wins / total_trades * 100, 1) if total_trades > 0 else 0

    live_positions = live.get("positions", [])

    # Count per category
    cat_counts = {config.CATEGORY_STOCKS: 0, config.CATEGORY_CRYPTO: 0, config.CATEGORY_COMMODITIES: 0}
    for pos in live_positions:
        cat = pos.get("category", config.get_category(pos.get("epic", "")))
        if cat in cat_counts:
            cat_counts[cat] += 1

    best_cat = "—"
    if total_trades > 0:
        best_cat = max(
            [(config.CATEGORY_STOCKS, stocks_stats["total_pnl"]),
             (config.CATEGORY_CRYPTO, crypto_stats["total_pnl"]),
             (config.CATEGORY_COMMODITIES, commodities_stats["total_pnl"])],
            key=lambda x: x[1]
        )[0].upper()

    recent = trades[-50:][::-1]

    return {
        "status": live.get("status", "unknown"),
        "balance": live.get("balance", 0),
        "updated_at": live.get("updated_at", "—"),
        "positions": live_positions,
        "total_open": len(live_positions),
        "stocks": {**stocks_stats, "live_count": cat_counts[config.CATEGORY_STOCKS]},
        "crypto": {**crypto_stats, "live_count": cat_counts[config.CATEGORY_CRYPTO]},
        "commodities": {**commodities_stats, "live_count": cat_counts[config.CATEGORY_COMMODITIES]},
        "overall": {
            "total_pnl": round(total_pnl, 5),
            "win_rate": overall_wr,
            "total_trades": total_trades,
            "best_category": best_cat,
        },
        "recent_trades": [{
            "timestamp": t.get("timestamp", "?")[:19],
            "category": config.get_category(t.get("epic", "")),
            "direction": t.get("direction", "?"),
            "epic": t.get("epic", "?"),
            "pnl": t.get("pnl", 0),
            "pnl_pct": t.get("pnl_pct", 0),
            "duration_seconds": t.get("duration_seconds", 0),
            "exit_reason": t.get("exit_reason", "?")[:40],
        } for t in recent],
    }


def generate_html() -> str:
    return """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Trading Bot Dashboard</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body {
    background: #0a0a0f;
    color: #e0e0e0;
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    padding: 20px;
    min-height: 100vh;
}
.header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
    padding-bottom: 16px;
    border-bottom: 1px solid #1a1a2e;
}
.header h1 { font-size: 20px; color: #fff; letter-spacing: 2px; }
.header-stats { display: flex; gap: 24px; font-size: 13px; }
.header-stats .hs { display: flex; flex-direction: column; align-items: flex-end; }
.header-stats .hs-label { color: #666; font-size: 10px; text-transform: uppercase; }
.header-stats .hs-value { color: #fff; font-size: 16px; font-weight: bold; }
.status-dot {
    display: inline-block; width: 8px; height: 8px;
    border-radius: 50%; margin-right: 6px;
    animation: pulse 2s infinite;
}
.status-dot.running { background: #00ff88; }
.status-dot.stopped { background: #ff4444; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

.cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 24px; }
.card {
    background: #12121f; border: 1px solid #1a1a2e;
    border-radius: 12px; padding: 20px;
}
.card-header { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
.card-icon { font-size: 24px; }
.card-header h2 { font-size: 16px; color: #fff; flex: 1; }
.live-badge {
    background: #1a1a2e; color: #00ff88;
    padding: 3px 10px; border-radius: 20px; font-size: 11px;
}
.stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.stat { display: flex; flex-direction: column; }
.stat-label { font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: 1px; }
.stat-value { font-size: 15px; font-weight: bold; margin-top: 2px; }

.section { margin-bottom: 24px; }
.section h3 {
    font-size: 14px; color: #888; text-transform: uppercase;
    letter-spacing: 2px; margin-bottom: 12px;
}
table { width: 100%; border-collapse: collapse; font-size: 12px; }
th {
    text-align: left; padding: 8px 12px; color: #666;
    text-transform: uppercase; letter-spacing: 1px;
    font-size: 10px; border-bottom: 1px solid #1a1a2e;
}
td { padding: 8px 12px; border-bottom: 1px solid #0f0f1a; transition: background 0.3s ease; }
tr:hover { background: #15152a; }
.empty { color: #444; text-align: center; padding: 20px; }
.badge { padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: bold; }
.badge-buy, .badge-BUY { background: #0a3d2a; color: #00ff88; }
.badge-sell, .badge-SELL { background: #3d0a0a; color: #ff4444; }
.reason { color: #666; font-size: 11px; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.overall-bar {
    display: flex; gap: 20px; background: #12121f;
    border: 1px solid #1a1a2e; border-radius: 12px;
    padding: 16px 24px; margin-bottom: 24px; align-items: center;
}
.overall-bar .ob-item { display: flex; flex-direction: column; }
.overall-bar .ob-label { font-size: 10px; color: #666; text-transform: uppercase; }
.overall-bar .ob-value { font-size: 18px; font-weight: bold; }

.footer { text-align: center; color: #333; font-size: 11px; margin-top: 40px; }

/* Price flash animations */
.flash-green { animation: flashGreen 0.6s ease-out; }
.flash-red { animation: flashRed 0.6s ease-out; }
@keyframes flashGreen {
    0% { background: rgba(0, 255, 136, 0.35); }
    100% { background: transparent; }
}
@keyframes flashRed {
    0% { background: rgba(255, 68, 68, 0.35); }
    100% { background: transparent; }
}

/* Live price cell styling */
.price-up { color: #00ff88; }
.price-down { color: #ff4444; }
.price-neutral { color: #888; }

.pnl-positive { color: #00ff88; }
.pnl-negative { color: #ff4444; }
.pnl-zero { color: #888; }

/* Ping indicator */
.ping { font-size: 10px; color: #444; margin-left: 12px; }
.ping.live { color: #00ff88; }
</style>
</head>
<body>

<div class="header">
    <h1>
        <span id="statusDot" class="status-dot stopped"></span>
        TRADING BOT DASHBOARD
        <span id="ping" class="ping">●</span>
    </h1>
    <div class="header-stats">
        <div class="hs">
            <span class="hs-label">Balance</span>
            <span class="hs-value" id="balance">$0.00</span>
        </div>
        <div class="hs">
            <span class="hs-label">Open Trades</span>
            <span class="hs-value" id="openTrades">0 / 15</span>
        </div>
        <div class="hs">
            <span class="hs-label">Last Tick</span>
            <span class="hs-value" id="lastUpdate" style="font-size:12px">—</span>
        </div>
    </div>
</div>

<!-- Overall P&L Bar -->
<div class="overall-bar">
    <div class="ob-item">
        <span class="ob-label">Total P&L</span>
        <span class="ob-value" id="totalPnl">0.00000</span>
    </div>
    <div class="ob-item">
        <span class="ob-label">Win Rate</span>
        <span class="ob-value" id="winRate">0%</span>
    </div>
    <div class="ob-item">
        <span class="ob-label">Total Trades</span>
        <span class="ob-value" id="totalTrades">0</span>
    </div>
    <div class="ob-item" style="flex:1"></div>
    <div class="ob-item">
        <span class="ob-label">🏆 Best Category</span>
        <span class="ob-value" id="bestCategory" style="color:#00ff88">—</span>
    </div>
</div>

<!-- Category Cards -->
<div class="cards">
    <div class="card" id="card-stocks">
        <div class="card-header">
            <span class="card-icon">📈</span><h2>Stocks</h2>
            <span class="live-badge" id="stocks-live">0/5 live</span>
        </div>
        <div class="stat-grid" id="stocks-stats"></div>
    </div>
    <div class="card" id="card-crypto">
        <div class="card-header">
            <span class="card-icon">₿</span><h2>Crypto</h2>
            <span class="live-badge" id="crypto-live">0/5 live</span>
        </div>
        <div class="stat-grid" id="crypto-stats"></div>
    </div>
    <div class="card" id="card-commodities">
        <div class="card-header">
            <span class="card-icon">🪙</span><h2>Commodities</h2>
            <span class="live-badge" id="commodities-live">0/5 live</span>
        </div>
        <div class="stat-grid" id="commodities-stats"></div>
    </div>
</div>

<!-- Active Positions -->
<div class="section">
    <h3>⚡ Active Positions <span id="posCount" style="color:#00ff88"></span></h3>
    <table>
        <thead>
            <tr><th>Cat</th><th>Dir</th><th>Asset</th><th>Entry</th><th>Current Price</th><th>P&L</th><th>SL Steps</th></tr>
        </thead>
        <tbody id="positionsBody">
            <tr><td colspan="7" class="empty">No open positions</td></tr>
        </tbody>
    </table>
</div>

<!-- Trade History -->
<div class="section">
    <h3>📋 Recent Trade History (last 50)</h3>
    <table>
        <thead>
            <tr><th>Time</th><th>Cat</th><th>Dir</th><th>Asset</th><th>P&L</th><th>P&L %</th><th>Duration</th><th>Exit Reason</th></tr>
        </thead>
        <tbody id="historyBody">
            <tr><td colspan="8" class="empty">No trades yet</td></tr>
        </tbody>
    </table>
</div>

<div class="footer">
    Real-time 1s updates · Trading Bot Dashboard v2.0
</div>

<script>
const prevPrices = {};
const CAT_ICONS = { stocks: '📈', crypto: '₿', commodities: '🪙', unknown: '?' };

function pnlClass(val) {
    if (val > 0) return 'pnl-positive';
    if (val < 0) return 'pnl-negative';
    return 'pnl-zero';
}

function formatPnl(val) {
    return (val >= 0 ? '+' : '') + val.toFixed(5);
}

function formatDuration(secs) {
    if (secs < 60) return secs.toFixed(0) + 's';
    if (secs < 3600) return (secs / 60).toFixed(1) + 'm';
    return (secs / 3600).toFixed(1) + 'h';
}

function renderStats(containerId, stats) {
    const el = document.getElementById(containerId);
    el.innerHTML = `
        <div class="stat"><span class="stat-label">Total P&L</span><span class="stat-value ${pnlClass(stats.total_pnl)}">${formatPnl(stats.total_pnl)}</span></div>
        <div class="stat"><span class="stat-label">Win Rate</span><span class="stat-value">${stats.win_rate}%</span></div>
        <div class="stat"><span class="stat-label">Trades</span><span class="stat-value">${stats.total}</span></div>
        <div class="stat"><span class="stat-label">W / L</span><span class="stat-value">${stats.wins} / ${stats.losses}</span></div>
        <div class="stat"><span class="stat-label">Best</span><span class="stat-value pnl-positive">${formatPnl(stats.best_trade)}</span></div>
        <div class="stat"><span class="stat-label">Worst</span><span class="stat-value pnl-negative">${formatPnl(stats.worst_trade)}</span></div>
    `;
}

function renderPositions(positions) {
    const body = document.getElementById('positionsBody');
    if (!positions || positions.length === 0) {
        body.innerHTML = '<tr><td colspan="7" class="empty">No open positions</td></tr>';
        return;
    }

    let html = '';
    positions.forEach(p => {
        const epic = p.epic || '?';
        const prevPrice = prevPrices[epic];
        const currentPrice = p.current_price || 0;
        const pnl = p.unrealized_pnl || 0;
        const cat = p.category || 'unknown';

        let flashClass = '';
        if (prevPrice !== undefined && prevPrice !== currentPrice) {
            flashClass = currentPrice > prevPrice ? 'flash-green' : 'flash-red';
        }
        let priceColorClass = 'price-neutral';
        if (prevPrice !== undefined) {
            if (currentPrice > prevPrice) priceColorClass = 'price-up';
            else if (currentPrice < prevPrice) priceColorClass = 'price-down';
        }

        prevPrices[epic] = currentPrice;

        html += `<tr>
            <td>${CAT_ICONS[cat] || '?'}</td>
            <td><span class="badge badge-${p.direction || '?'}">${p.direction || '?'}</span></td>
            <td>${epic}</td>
            <td>${(p.entry_price || 0).toFixed(5)}</td>
            <td class="${flashClass} ${priceColorClass}" id="price-${epic}">${currentPrice.toFixed(5)}</td>
            <td class="${pnlClass(pnl)}">${formatPnl(pnl)}</td>
            <td>${p.locked_steps || 0} steps</td>
        </tr>`;
    });
    body.innerHTML = html;

    // Re-trigger flash animations by forcing reflow
    positions.forEach(p => {
        const el = document.getElementById('price-' + p.epic);
        if (el && (el.classList.contains('flash-green') || el.classList.contains('flash-red'))) {
            el.addEventListener('animationend', () => {
                el.classList.remove('flash-green', 'flash-red');
            }, { once: true });
        }
    });
}

function renderHistory(trades) {
    const body = document.getElementById('historyBody');
    if (!trades || trades.length === 0) {
        body.innerHTML = '<tr><td colspan="8" class="empty">No trades yet</td></tr>';
        return;
    }
    let html = '';
    trades.forEach(t => {
        const pnl = t.pnl || 0;
        const cat = t.category || 'unknown';
        html += `<tr>
            <td>${t.timestamp || '?'}</td>
            <td>${CAT_ICONS[cat] || '?'}</td>
            <td><span class="badge badge-${t.direction}">${t.direction}</span></td>
            <td>${t.epic}</td>
            <td class="${pnlClass(pnl)}">${formatPnl(pnl)}</td>
            <td>${(t.pnl_pct || 0).toFixed(2)}%</td>
            <td>${formatDuration(t.duration_seconds || 0)}</td>
            <td class="reason">${t.exit_reason || '?'}</td>
        </tr>`;
    });
    body.innerHTML = html;
}

async function fetchState() {
    try {
        const resp = await fetch('/api/state');
        if (!resp.ok) return;
        const d = await resp.json();

        // Header
        const dot = document.getElementById('statusDot');
        dot.className = 'status-dot ' + (d.status === 'running' ? 'running' : 'stopped');
        document.getElementById('balance').textContent = '$' + (d.balance || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
        document.getElementById('openTrades').textContent = (d.total_open || 0) + ' / 15';
        document.getElementById('lastUpdate').textContent = d.updated_at || '—';

        // Overall
        const ov = d.overall || {};
        const totalPnlEl = document.getElementById('totalPnl');
        totalPnlEl.textContent = formatPnl(ov.total_pnl || 0);
        totalPnlEl.className = 'ob-value ' + pnlClass(ov.total_pnl || 0);
        document.getElementById('winRate').textContent = (ov.win_rate || 0) + '%';
        document.getElementById('totalTrades').textContent = ov.total_trades || 0;
        document.getElementById('bestCategory').textContent = ov.best_category || '—';

        // Category cards
        ['stocks', 'crypto', 'commodities'].forEach(cat => {
            const s = d[cat] || {};
            renderStats(cat + '-stats', s);
            document.getElementById(cat + '-live').textContent = (s.live_count || 0) + '/5 live';
        });

        // Active positions with price flash
        renderPositions(d.positions || []);
        document.getElementById('posCount').textContent = d.positions && d.positions.length ? '(' + d.positions.length + ')' : '';

        // Trade history
        renderHistory(d.recent_trades || []);

        // Ping indicator
        const ping = document.getElementById('ping');
        ping.className = 'ping live';
        setTimeout(() => { ping.className = 'ping'; }, 500);

    } catch(e) {
        // silent
    }
}

// Poll every 1 second
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
        elif self.path == "/api/stats":
            # Legacy endpoint
            data = generate_api_response()
            self.send_response(200)
            self.send_header("Content-type", "application/json")
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
