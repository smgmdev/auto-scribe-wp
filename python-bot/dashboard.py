"""
Local Trading Dashboard — runs on Mac Mini
Shows live trades, P&L, and category performance.

Run: python dashboard.py
Opens at: http://localhost:8050
"""

import json
import os
import time
from datetime import datetime, timedelta
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
    """Calculate P&L stats for a category."""
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


def generate_html() -> str:
    trades = load_trades()
    live = load_live_state()
    
    stocks_stats = category_stats(trades, config.CATEGORY_STOCKS)
    crypto_stats = category_stats(trades, config.CATEGORY_CRYPTO)
    commodities_stats = category_stats(trades, config.CATEGORY_COMMODITIES)
    
    # Overall stats
    total_trades = len(trades)
    total_wins = sum(1 for t in trades if t.get("won"))
    total_pnl = sum(t.get("pnl", 0) for t in trades)
    overall_wr = round(total_wins / total_trades * 100, 1) if total_trades > 0 else 0

    # Live positions
    live_positions = live.get("positions", [])
    live_by_cat = {
        config.CATEGORY_STOCKS: [],
        config.CATEGORY_CRYPTO: [],
        config.CATEGORY_COMMODITIES: [],
    }
    for pos in live_positions:
        cat = config.get_category(pos.get("epic", ""))
        if cat in live_by_cat:
            live_by_cat[cat].append(pos)

    # Recent trades (last 50)
    recent = trades[-50:][::-1]

    def pnl_color(val):
        if val > 0: return "#00ff88"
        if val < 0: return "#ff4444"
        return "#888"

    def format_duration(secs):
        if secs < 60: return f"{secs:.0f}s"
        if secs < 3600: return f"{secs/60:.1f}m"
        return f"{secs/3600:.1f}h"

    def cat_icon(cat):
        if cat == config.CATEGORY_STOCKS: return "📈"
        if cat == config.CATEGORY_CRYPTO: return "₿"
        if cat == config.CATEGORY_COMMODITIES: return "🪙"
        return "?"

    def render_stat_card(title, icon, stats, live_count):
        pnl_c = pnl_color(stats["total_pnl"])
        return f"""
        <div class="card">
            <div class="card-header">
                <span class="card-icon">{icon}</span>
                <h2>{title}</h2>
                <span class="live-badge">{live_count}/5 live</span>
            </div>
            <div class="stat-grid">
                <div class="stat">
                    <span class="stat-label">Total P&L</span>
                    <span class="stat-value" style="color:{pnl_c}">{stats['total_pnl']:+.5f}</span>
                </div>
                <div class="stat">
                    <span class="stat-label">Win Rate</span>
                    <span class="stat-value">{stats['win_rate']}%</span>
                </div>
                <div class="stat">
                    <span class="stat-label">Trades</span>
                    <span class="stat-value">{stats['total']}</span>
                </div>
                <div class="stat">
                    <span class="stat-label">W / L</span>
                    <span class="stat-value">{stats['wins']} / {stats['losses']}</span>
                </div>
                <div class="stat">
                    <span class="stat-label">Best</span>
                    <span class="stat-value" style="color:#00ff88">{stats['best_trade']:+.5f}</span>
                </div>
                <div class="stat">
                    <span class="stat-label">Worst</span>
                    <span class="stat-value" style="color:#ff4444">{stats['worst_trade']:+.5f}</span>
                </div>
            </div>
        </div>
        """

    # Live positions table rows
    def render_live_positions(positions):
        if not positions:
            return '<tr><td colspan="6" class="empty">No open positions</td></tr>'
        rows = ""
        for p in positions:
            pnl = p.get("unrealized_pnl", 0)
            rows += f"""
            <tr>
                <td><span class="badge badge-{p.get('direction','').lower()}">{p.get('direction','?')}</span></td>
                <td>{p.get('epic','?')}</td>
                <td>{p.get('entry_price', 0):.5f}</td>
                <td>{p.get('current_price', 0):.5f}</td>
                <td style="color:{pnl_color(pnl)}">{pnl:+.5f}</td>
                <td>{p.get('locked_steps', 0)} steps</td>
            </tr>"""
        return rows

    # Trade history rows
    history_rows = ""
    for t in recent:
        cat = config.get_category(t.get("epic", ""))
        pnl = t.get("pnl", 0)
        history_rows += f"""
        <tr>
            <td>{t.get('timestamp', '?')[:19]}</td>
            <td>{cat_icon(cat)}</td>
            <td><span class="badge badge-{t.get('direction','').lower()}">{t.get('direction','?')}</span></td>
            <td>{t.get('epic','?')}</td>
            <td style="color:{pnl_color(pnl)}">{pnl:+.5f}</td>
            <td>{t.get('pnl_pct', 0):.2f}%</td>
            <td>{format_duration(t.get('duration_seconds', 0))}</td>
            <td class="reason">{t.get('exit_reason', '?')[:40]}</td>
        </tr>"""

    last_update = live.get("updated_at", "—")
    bot_status = live.get("status", "unknown")
    balance = live.get("balance", 0)

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Trading Bot Dashboard</title>
<meta http-equiv="refresh" content="5">
<style>
* {{ margin:0; padding:0; box-sizing:border-box; }}
body {{
    background: #0a0a0f;
    color: #e0e0e0;
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    padding: 20px;
    min-height: 100vh;
}}
.header {{
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
    padding-bottom: 16px;
    border-bottom: 1px solid #1a1a2e;
}}
.header h1 {{
    font-size: 20px;
    color: #fff;
    letter-spacing: 2px;
}}
.header-stats {{
    display: flex;
    gap: 24px;
    font-size: 13px;
}}
.header-stats .hs {{
    display: flex;
    flex-direction: column;
    align-items: flex-end;
}}
.header-stats .hs-label {{ color: #666; font-size: 10px; text-transform: uppercase; }}
.header-stats .hs-value {{ color: #fff; font-size: 16px; font-weight: bold; }}
.status-dot {{
    display: inline-block;
    width: 8px; height: 8px;
    border-radius: 50%;
    margin-right: 6px;
    animation: pulse 2s infinite;
}}
.status-dot.running {{ background: #00ff88; }}
.status-dot.stopped {{ background: #ff4444; }}
@keyframes pulse {{
    0%, 100% {{ opacity: 1; }}
    50% {{ opacity: 0.4; }}
}}

/* Category Cards */
.cards {{
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    margin-bottom: 24px;
}}
.card {{
    background: #12121f;
    border: 1px solid #1a1a2e;
    border-radius: 12px;
    padding: 20px;
}}
.card-header {{
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 16px;
}}
.card-icon {{ font-size: 24px; }}
.card-header h2 {{ font-size: 16px; color: #fff; flex: 1; }}
.live-badge {{
    background: #1a1a2e;
    color: #00ff88;
    padding: 3px 10px;
    border-radius: 20px;
    font-size: 11px;
}}
.stat-grid {{
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
}}
.stat {{ display: flex; flex-direction: column; }}
.stat-label {{ font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: 1px; }}
.stat-value {{ font-size: 15px; font-weight: bold; margin-top: 2px; }}

/* Live Positions */
.section {{ margin-bottom: 24px; }}
.section h3 {{
    font-size: 14px;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 2px;
    margin-bottom: 12px;
}}
table {{
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
}}
th {{
    text-align: left;
    padding: 8px 12px;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 1px;
    font-size: 10px;
    border-bottom: 1px solid #1a1a2e;
}}
td {{
    padding: 8px 12px;
    border-bottom: 1px solid #0f0f1a;
}}
tr:hover {{ background: #15152a; }}
.empty {{ color: #444; text-align: center; padding: 20px; }}
.badge {{
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: bold;
}}
.badge-buy {{ background: #0a3d2a; color: #00ff88; }}
.badge-sell {{ background: #3d0a0a; color: #ff4444; }}
.reason {{ color: #666; font-size: 11px; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }}

/* Overall bar */
.overall-bar {{
    display: flex;
    gap: 20px;
    background: #12121f;
    border: 1px solid #1a1a2e;
    border-radius: 12px;
    padding: 16px 24px;
    margin-bottom: 24px;
    align-items: center;
}}
.overall-bar .ob-item {{
    display: flex;
    flex-direction: column;
}}
.overall-bar .ob-label {{ font-size: 10px; color: #666; text-transform: uppercase; }}
.overall-bar .ob-value {{ font-size: 18px; font-weight: bold; }}
.footer {{
    text-align: center;
    color: #333;
    font-size: 11px;
    margin-top: 40px;
}}
</style>
</head>
<body>
<div class="header">
    <h1>
        <span class="status-dot {'running' if bot_status == 'running' else 'stopped'}"></span>
        TRADING BOT DASHBOARD
    </h1>
    <div class="header-stats">
        <div class="hs">
            <span class="hs-label">Balance</span>
            <span class="hs-value">${balance:,.2f}</span>
        </div>
        <div class="hs">
            <span class="hs-label">Open Trades</span>
            <span class="hs-value">{len(live_positions)} / 15</span>
        </div>
        <div class="hs">
            <span class="hs-label">Last Update</span>
            <span class="hs-value" style="font-size:12px">{last_update}</span>
        </div>
    </div>
</div>

<!-- Overall P&L Bar -->
<div class="overall-bar">
    <div class="ob-item">
        <span class="ob-label">Total P&L</span>
        <span class="ob-value" style="color:{pnl_color(total_pnl)}">{total_pnl:+.5f}</span>
    </div>
    <div class="ob-item">
        <span class="ob-label">Win Rate</span>
        <span class="ob-value">{overall_wr}%</span>
    </div>
    <div class="ob-item">
        <span class="ob-label">Total Trades</span>
        <span class="ob-value">{total_trades}</span>
    </div>
    <div class="ob-item" style="flex:1"></div>
    <div class="ob-item">
        <span class="ob-label">🏆 Best Category</span>
        <span class="ob-value" style="color:#00ff88">{
            max(
                [(config.CATEGORY_STOCKS, stocks_stats['total_pnl']),
                 (config.CATEGORY_CRYPTO, crypto_stats['total_pnl']),
                 (config.CATEGORY_COMMODITIES, commodities_stats['total_pnl'])],
                key=lambda x: x[1]
            )[0].upper() if total_trades > 0 else '—'
        }</span>
    </div>
</div>

<!-- Category Cards -->
<div class="cards">
    {render_stat_card("Stocks", "📈", stocks_stats, len(live_by_cat[config.CATEGORY_STOCKS]))}
    {render_stat_card("Crypto", "₿", crypto_stats, len(live_by_cat[config.CATEGORY_CRYPTO]))}
    {render_stat_card("Commodities", "🪙", commodities_stats, len(live_by_cat[config.CATEGORY_COMMODITIES]))}
</div>

<!-- Live Positions -->
<div class="section">
    <h3>⚡ Live Positions</h3>
    <table>
        <thead>
            <tr><th>Dir</th><th>Asset</th><th>Entry</th><th>Current</th><th>P&L</th><th>SL Steps</th></tr>
        </thead>
        <tbody>
            {render_live_positions(live_positions)}
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
        <tbody>
            {history_rows if history_rows else '<tr><td colspan="8" class="empty">No trades yet</td></tr>'}
        </tbody>
    </table>
</div>

<div class="footer">
    Auto-refreshes every 5 seconds · Trading Bot Dashboard v1.0
</div>
</body>
</html>"""
    return html


class DashboardHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/" or self.path == "/index.html":
            html = generate_html()
            self.send_response(200)
            self.send_header("Content-type", "text/html")
            self.end_headers()
            self.wfile.write(html.encode())
        elif self.path == "/api/stats":
            trades = load_trades()
            live = load_live_state()
            data = {
                "stocks": category_stats(trades, config.CATEGORY_STOCKS),
                "crypto": category_stats(trades, config.CATEGORY_CRYPTO),
                "commodities": category_stats(trades, config.CATEGORY_COMMODITIES),
                "live": live,
                "total_trades": len(trades),
            }
            self.send_response(200)
            self.send_header("Content-type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(data).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        pass  # Suppress access logs


def run_dashboard():
    """Start the dashboard server."""
    server = HTTPServer(("0.0.0.0", DASHBOARD_PORT), DashboardHandler)
    log.info(f"📊 Dashboard running at http://localhost:{DASHBOARD_PORT}")
    print(f"\n  📊 Dashboard: http://localhost:{DASHBOARD_PORT}\n")
    server.serve_forever()


def start_dashboard_thread():
    """Start dashboard in background thread (called from main.py)."""
    t = threading.Thread(target=run_dashboard, daemon=True)
    t.start()
    return t


if __name__ == "__main__":
    print("╔══════════════════════════════════════════╗")
    print("║   TRADING BOT DASHBOARD                  ║")
    print(f"║   http://localhost:{DASHBOARD_PORT}                  ║")
    print("╚══════════════════════════════════════════╝")
    run_dashboard()
