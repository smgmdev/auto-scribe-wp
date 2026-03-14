"""
SQLite-backed Trading Memory — persistent learning database.

Stores:
- Complete trade history with full market context
- Win/loss patterns (which conditions lead to profit)
- Market regime snapshots (trending/ranging/volatile)
- Time-of-day profitability stats
- Asset performance scores & blacklist
- AI trade reviews
- Strategy scoring
- Correlation data between assets

All data persists across bot restarts.
"""

import sqlite3
import json
import os
import time
from datetime import datetime, timezone
from typing import Optional
from logger_setup import get_logger

log = get_logger("learning_db")

DB_PATH = os.path.join(os.path.dirname(__file__), "trading_brain.db")


class TradingBrain:
    """Persistent learning database for the trading bot."""

    def __init__(self, db_path: str = DB_PATH):
        self.db_path = db_path
        self.conn = sqlite3.connect(db_path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA busy_timeout=5000")
        self._create_tables()
        log.info(f"🧠 Trading Brain initialized — {db_path}")

    def _create_tables(self):
        cur = self.conn.cursor()

        # ═══════════════════════════════════════════
        # TRADE HISTORY — complete record of every trade
        # ═══════════════════════════════════════════
        cur.execute("""
            CREATE TABLE IF NOT EXISTS trades (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                epic TEXT NOT NULL,
                direction TEXT NOT NULL,
                category TEXT,
                entry_price REAL,
                exit_price REAL,
                size REAL,
                pnl REAL,
                pnl_pct REAL,
                won INTEGER,  -- 1=win, 0=loss
                entry_reason TEXT,
                exit_reason TEXT,
                duration_seconds REAL,
                
                -- Market context at entry
                momentum_at_entry REAL,
                momentum_at_exit REAL,
                rsi_at_entry REAL,
                rsi_at_exit REAL,
                volatility_at_entry REAL,
                spread_at_entry REAL,
                atr_at_entry REAL,
                scanner_confidence REAL,
                
                -- Market regime at entry
                regime TEXT,  -- 'trending_up', 'trending_down', 'ranging', 'volatile', 'quiet'
                
                -- Time context
                hour_utc INTEGER,
                day_of_week INTEGER,  -- 0=Monday, 6=Sunday
                
                -- S/R context
                nearest_support REAL,
                nearest_resistance REAL,
                distance_to_support_pct REAL,
                distance_to_resistance_pct REAL,
                
                -- Stop/profit distances
                stop_distance REAL,
                profit_distance REAL,
                hit_tp INTEGER,
                hit_sl INTEGER,
                
                -- Timestamps
                entry_time TEXT,
                exit_time TEXT,
                created_at TEXT DEFAULT (datetime('now'))
            )
        """)

        # ═══════════════════════════════════════════
        # ASSET PERFORMANCE — running stats per epic
        # ═══════════════════════════════════════════
        cur.execute("""
            CREATE TABLE IF NOT EXISTS asset_performance (
                epic TEXT PRIMARY KEY,
                category TEXT,
                total_trades INTEGER DEFAULT 0,
                wins INTEGER DEFAULT 0,
                losses INTEGER DEFAULT 0,
                win_rate REAL DEFAULT 0.0,
                total_pnl REAL DEFAULT 0.0,
                avg_pnl REAL DEFAULT 0.0,
                avg_win REAL DEFAULT 0.0,
                avg_loss REAL DEFAULT 0.0,
                max_consecutive_losses INTEGER DEFAULT 0,
                current_consecutive_losses INTEGER DEFAULT 0,
                blacklisted_until TEXT,  -- ISO timestamp, NULL = not blacklisted
                best_hour_utc INTEGER,
                worst_hour_utc INTEGER,
                avg_duration_seconds REAL DEFAULT 0.0,
                last_trade_at TEXT,
                updated_at TEXT DEFAULT (datetime('now'))
            )
        """)

        # ═══════════════════════════════════════════
        # HOURLY PERFORMANCE — profitability by hour per asset
        # ═══════════════════════════════════════════
        cur.execute("""
            CREATE TABLE IF NOT EXISTS hourly_performance (
                epic TEXT NOT NULL,
                hour_utc INTEGER NOT NULL,
                total_trades INTEGER DEFAULT 0,
                wins INTEGER DEFAULT 0,
                total_pnl REAL DEFAULT 0.0,
                avg_pnl REAL DEFAULT 0.0,
                PRIMARY KEY (epic, hour_utc)
            )
        """)

        # ═══════════════════════════════════════════
        # REGIME HISTORY — market regime snapshots
        # ═══════════════════════════════════════════
        cur.execute("""
            CREATE TABLE IF NOT EXISTS regime_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                epic TEXT NOT NULL,
                regime TEXT NOT NULL,
                detected_at TEXT DEFAULT (datetime('now')),
                atr REAL,
                volatility REAL,
                trend_strength REAL,
                ema_alignment TEXT  -- 'bullish', 'bearish', 'mixed'
            )
        """)

        # ═══════════════════════════════════════════
        # PATTERN MEMORY — what entry conditions lead to wins
        # ═══════════════════════════════════════════
        cur.execute("""
            CREATE TABLE IF NOT EXISTS entry_patterns (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                epic TEXT,
                category TEXT,
                direction TEXT,
                regime TEXT,
                hour_utc INTEGER,
                rsi_bucket TEXT,  -- 'oversold', 'neutral', 'overbought'
                momentum_bucket TEXT,  -- 'weak', 'moderate', 'strong'
                volatility_bucket TEXT,  -- 'low', 'medium', 'high'
                scanner_confidence_bucket TEXT,  -- 'low', 'medium', 'high'
                won INTEGER,
                pnl REAL,
                count INTEGER DEFAULT 1,
                created_at TEXT DEFAULT (datetime('now'))
            )
        """)

        # ═══════════════════════════════════════════
        # STRATEGY SCORES — which entry strategies work best
        # ═══════════════════════════════════════════
        cur.execute("""
            CREATE TABLE IF NOT EXISTS strategy_scores (
                strategy_name TEXT PRIMARY KEY,
                total_trades INTEGER DEFAULT 0,
                wins INTEGER DEFAULT 0,
                total_pnl REAL DEFAULT 0.0,
                win_rate REAL DEFAULT 0.0,
                avg_pnl REAL DEFAULT 0.0,
                score REAL DEFAULT 0.5,  -- 0.0 = terrible, 1.0 = excellent
                enabled INTEGER DEFAULT 1,
                updated_at TEXT DEFAULT (datetime('now'))
            )
        """)

        # ═══════════════════════════════════════════
        # AI REVIEWS — LLM analysis of trades
        # ═══════════════════════════════════════════
        cur.execute("""
            CREATE TABLE IF NOT EXISTS ai_reviews (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                trade_id INTEGER,
                review_text TEXT,
                lessons_learned TEXT,  -- JSON array of key takeaways
                suggested_adjustments TEXT,  -- JSON dict of param changes
                confidence_in_review REAL,
                created_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (trade_id) REFERENCES trades(id)
            )
        """)

        # ═══════════════════════════════════════════
        # CORRELATION TRACKER — price correlation between assets
        # ═══════════════════════════════════════════
        cur.execute("""
            CREATE TABLE IF NOT EXISTS asset_correlations (
                epic_a TEXT NOT NULL,
                epic_b TEXT NOT NULL,
                correlation REAL,  -- -1.0 to 1.0
                sample_size INTEGER,
                updated_at TEXT DEFAULT (datetime('now')),
                PRIMARY KEY (epic_a, epic_b)
            )
        """)

        # ═══════════════════════════════════════════
        # ADAPTIVE PARAMS — per-asset learned parameters
        # ═══════════════════════════════════════════
        cur.execute("""
            CREATE TABLE IF NOT EXISTS adaptive_params (
                epic TEXT PRIMARY KEY,
                params TEXT,  -- JSON string
                updated_at TEXT DEFAULT (datetime('now'))
            )
        """)

        # ═══════════════════════════════════════════
        # DRAWDOWN TRACKER — session-level performance
        # ═══════════════════════════════════════════
        cur.execute("""
            CREATE TABLE IF NOT EXISTS session_stats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_start TEXT,
                session_end TEXT,
                starting_balance REAL,
                ending_balance REAL,
                total_trades INTEGER DEFAULT 0,
                wins INTEGER DEFAULT 0,
                total_pnl REAL DEFAULT 0.0,
                max_drawdown_pct REAL DEFAULT 0.0,
                peak_balance REAL DEFAULT 0.0
            )
        """)

        # Indexes for fast queries
        cur.execute("CREATE INDEX IF NOT EXISTS idx_trades_epic ON trades(epic)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_trades_category ON trades(category)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_trades_won ON trades(won)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_trades_exit_time ON trades(exit_time)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_hourly_epic ON hourly_performance(epic)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_patterns_category ON entry_patterns(category)")

        self.conn.commit()
        log.info("🧠 Database tables verified")

    # ═══════════════════════════════════════════════════
    # TRADE LOGGING
    # ═══════════════════════════════════════════════════

    def log_trade(self, trade: dict) -> int:
        """Log a completed trade with full context. Returns trade ID."""
        now = datetime.now(timezone.utc)
        cur = self.conn.cursor()
        cur.execute("""
            INSERT INTO trades (
                epic, direction, category, entry_price, exit_price, size,
                pnl, pnl_pct, won, entry_reason, exit_reason, duration_seconds,
                momentum_at_entry, momentum_at_exit, rsi_at_entry, rsi_at_exit,
                volatility_at_entry, spread_at_entry, atr_at_entry, scanner_confidence,
                regime, hour_utc, day_of_week,
                nearest_support, nearest_resistance,
                distance_to_support_pct, distance_to_resistance_pct,
                stop_distance, profit_distance, hit_tp, hit_sl,
                entry_time, exit_time
            ) VALUES (
                ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?,
                ?, ?, ?, ?,
                ?, ?, ?,
                ?, ?,
                ?, ?,
                ?, ?, ?, ?,
                ?, ?
            )
        """, (
            trade.get("epic"), trade.get("direction"), trade.get("category"),
            trade.get("entry_price"), trade.get("exit_price"), trade.get("size"),
            trade.get("pnl", 0), trade.get("pnl_pct", 0),
            1 if trade.get("pnl", 0) > 0 else 0,
            trade.get("entry_reason"), trade.get("exit_reason"),
            trade.get("duration_seconds", 0),
            trade.get("momentum_at_entry", 0), trade.get("momentum_at_exit", 0),
            trade.get("rsi_at_entry", 50), trade.get("rsi_at_exit", 50),
            trade.get("volatility_at_entry", 0), trade.get("spread_at_entry", 0),
            trade.get("atr_at_entry", 0), trade.get("scanner_confidence", 0),
            trade.get("regime", "unknown"),
            now.hour, now.weekday(),
            trade.get("nearest_support", 0), trade.get("nearest_resistance", 0),
            trade.get("distance_to_support_pct", 0), trade.get("distance_to_resistance_pct", 0),
            trade.get("stop_distance", 0), trade.get("profit_distance", 0),
            1 if trade.get("hit_tp") else 0,
            1 if trade.get("hit_sl") else 0,
            trade.get("entry_time", now.isoformat()),
            now.isoformat(),
        ))
        trade_id = cur.lastrowid
        self.conn.commit()

        # Update aggregated tables
        self._update_asset_performance(trade)
        self._update_hourly_performance(trade, now.hour)
        self._record_entry_pattern(trade, now.hour)

        won = trade.get("pnl", 0) > 0
        emoji = "💚" if won else "💔"
        log.info(
            f"{emoji} Brain logged trade #{trade_id}: {trade['direction']} {trade['epic']} | "
            f"P&L: {trade.get('pnl', 0):.5f} | Regime: {trade.get('regime', '?')}"
        )
        return trade_id

    def _update_asset_performance(self, trade: dict):
        """Update running performance stats for an asset."""
        epic = trade["epic"]
        won = 1 if trade.get("pnl", 0) > 0 else 0
        pnl = trade.get("pnl", 0)

        cur = self.conn.cursor()
        cur.execute("SELECT * FROM asset_performance WHERE epic = ?", (epic,))
        row = cur.fetchone()

        if row is None:
            cur.execute("""
                INSERT INTO asset_performance (epic, category, total_trades, wins, losses,
                    total_pnl, current_consecutive_losses, max_consecutive_losses, last_trade_at)
                VALUES (?, ?, 1, ?, ?, ?, ?, ?, datetime('now'))
            """, (epic, trade.get("category"), won, 1 - won, pnl,
                  0 if won else 1, 0 if won else 1))
        else:
            total = row["total_trades"] + 1
            wins = row["wins"] + won
            losses = total - wins
            total_pnl = row["total_pnl"] + pnl
            consec = 0 if won else row["current_consecutive_losses"] + 1
            max_consec = max(row["max_consecutive_losses"], consec)

            # Auto-blacklist after 5 consecutive losses (24h)
            blacklisted = row["blacklisted_until"]
            if consec >= 5 and not blacklisted:
                blacklist_until = datetime.now(timezone.utc).isoformat()
                # 24 hours from now
                from datetime import timedelta
                blacklist_until = (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat()
                blacklisted = blacklist_until
                log.warning(f"🚫 {epic}: Auto-blacklisted for 24h after {consec} consecutive losses")

            # Calculate averages
            win_trades = cur.execute(
                "SELECT AVG(pnl) FROM trades WHERE epic = ? AND won = 1", (epic,)
            ).fetchone()[0] or 0
            loss_trades = cur.execute(
                "SELECT AVG(pnl) FROM trades WHERE epic = ? AND won = 0", (epic,)
            ).fetchone()[0] or 0

            cur.execute("""
                UPDATE asset_performance SET
                    total_trades = ?, wins = ?, losses = ?,
                    win_rate = ?, total_pnl = ?, avg_pnl = ?,
                    avg_win = ?, avg_loss = ?,
                    current_consecutive_losses = ?, max_consecutive_losses = ?,
                    blacklisted_until = ?,
                    last_trade_at = datetime('now'), updated_at = datetime('now')
                WHERE epic = ?
            """, (total, wins, losses,
                  wins / total if total > 0 else 0, total_pnl, total_pnl / total,
                  win_trades, loss_trades,
                  consec, max_consec, blacklisted, epic))

        self.conn.commit()

    def _update_hourly_performance(self, trade: dict, hour: int):
        """Update hour-of-day performance stats."""
        epic = trade["epic"]
        won = 1 if trade.get("pnl", 0) > 0 else 0
        pnl = trade.get("pnl", 0)

        cur = self.conn.cursor()
        cur.execute("""
            INSERT INTO hourly_performance (epic, hour_utc, total_trades, wins, total_pnl, avg_pnl)
            VALUES (?, ?, 1, ?, ?, ?)
            ON CONFLICT(epic, hour_utc) DO UPDATE SET
                total_trades = total_trades + 1,
                wins = wins + ?,
                total_pnl = total_pnl + ?,
                avg_pnl = (total_pnl + ?) / (total_trades + 1)
        """, (epic, hour, won, pnl, pnl, won, pnl, pnl))
        self.conn.commit()

    def _record_entry_pattern(self, trade: dict, hour: int):
        """Record the entry conditions pattern for pattern learning."""
        rsi = trade.get("rsi_at_entry", 50)
        if rsi < 30:
            rsi_bucket = "oversold"
        elif rsi > 70:
            rsi_bucket = "overbought"
        else:
            rsi_bucket = "neutral"

        mom = abs(trade.get("momentum_at_entry", 0))
        if mom < 0.3:
            mom_bucket = "weak"
        elif mom < 0.6:
            mom_bucket = "moderate"
        else:
            mom_bucket = "strong"

        vol = trade.get("volatility_at_entry", 0)
        if vol < 0.1:
            vol_bucket = "low"
        elif vol < 0.3:
            vol_bucket = "medium"
        else:
            vol_bucket = "high"

        conf = trade.get("scanner_confidence", 0)
        if conf < 0.45:
            conf_bucket = "low"
        elif conf < 0.65:
            conf_bucket = "medium"
        else:
            conf_bucket = "high"

        cur = self.conn.cursor()
        cur.execute("""
            INSERT INTO entry_patterns (
                epic, category, direction, regime, hour_utc,
                rsi_bucket, momentum_bucket, volatility_bucket,
                scanner_confidence_bucket, won, pnl
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            trade.get("epic"), trade.get("category"), trade.get("direction"),
            trade.get("regime", "unknown"), hour,
            rsi_bucket, mom_bucket, vol_bucket, conf_bucket,
            1 if trade.get("pnl", 0) > 0 else 0, trade.get("pnl", 0),
        ))
        self.conn.commit()

    # ═══════════════════════════════════════════════════
    # QUERIES — Intelligence retrieval
    # ═══════════════════════════════════════════════════

    def is_blacklisted(self, epic: str) -> bool:
        """Check if an asset is currently blacklisted."""
        cur = self.conn.cursor()
        row = cur.execute(
            "SELECT blacklisted_until FROM asset_performance WHERE epic = ?", (epic,)
        ).fetchone()
        if not row or not row["blacklisted_until"]:
            return False
        try:
            bl_time = datetime.fromisoformat(row["blacklisted_until"])
            if bl_time.tzinfo is None:
                bl_time = bl_time.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) < bl_time:
                return True
            # Expired — clear it
            cur.execute(
                "UPDATE asset_performance SET blacklisted_until = NULL WHERE epic = ?", (epic,)
            )
            self.conn.commit()
        except Exception:
            pass
        return False

    def get_asset_win_rate(self, epic: str) -> float:
        """Get historical win rate for an asset."""
        row = self.conn.execute(
            "SELECT win_rate FROM asset_performance WHERE epic = ?", (epic,)
        ).fetchone()
        return row["win_rate"] if row else 0.5

    def get_best_hours(self, epic: str, min_trades: int = 3) -> list[int]:
        """Get the most profitable hours for an asset."""
        rows = self.conn.execute("""
            SELECT hour_utc, avg_pnl, total_trades
            FROM hourly_performance
            WHERE epic = ? AND total_trades >= ?
            ORDER BY avg_pnl DESC
        """, (epic, min_trades)).fetchall()
        return [r["hour_utc"] for r in rows if r["avg_pnl"] > 0]

    def get_worst_hours(self, epic: str, min_trades: int = 3) -> list[int]:
        """Get hours where this asset consistently loses."""
        rows = self.conn.execute("""
            SELECT hour_utc, avg_pnl, total_trades
            FROM hourly_performance
            WHERE epic = ? AND total_trades >= ? AND avg_pnl < 0
            ORDER BY avg_pnl ASC
        """, (epic, min_trades)).fetchall()
        return [r["hour_utc"] for r in rows]

    def get_pattern_win_rate(self, category: str, direction: str, regime: str,
                              rsi_bucket: str, momentum_bucket: str) -> Optional[float]:
        """Get win rate for a specific entry pattern combination."""
        rows = self.conn.execute("""
            SELECT COUNT(*) as total, SUM(won) as wins
            FROM entry_patterns
            WHERE category = ? AND direction = ? AND regime = ?
              AND rsi_bucket = ? AND momentum_bucket = ?
        """, (category, direction, regime, rsi_bucket, momentum_bucket)).fetchone()
        if not rows or rows["total"] < 3:
            return None  # Not enough data
        return rows["wins"] / rows["total"]

    def should_trade_now(self, epic: str) -> tuple[bool, str]:
        """
        Master intelligence gate: should we trade this epic right now?
        Returns (allowed, reason).
        """
        # Check blacklist
        if self.is_blacklisted(epic):
            return False, f"Blacklisted (consecutive losses)"

        # Check worst hours
        hour = datetime.now(timezone.utc).hour
        worst = self.get_worst_hours(epic, min_trades=5)
        if hour in worst:
            return False, f"Hour {hour} historically unprofitable for {epic}"

        # Check overall asset performance (if enough data)
        row = self.conn.execute(
            "SELECT total_trades, win_rate, current_consecutive_losses FROM asset_performance WHERE epic = ?",
            (epic,)
        ).fetchone()
        if row and row["total_trades"] >= 15 and row["win_rate"] < 0.20:
            return False, f"Win rate too low ({row['win_rate']:.0%} over {row['total_trades']} trades)"

        if row and row["current_consecutive_losses"] >= 4:
            return False, f"{row['current_consecutive_losses']} consecutive losses — cooling down"

        return True, "OK"

    def get_pattern_score(self, trade_context: dict) -> float:
        """
        Score a potential trade based on historical pattern matching.
        Returns 0.0 (avoid) to 1.0 (strong history of winning).
        """
        rsi = trade_context.get("rsi", 50)
        rsi_bucket = "oversold" if rsi < 30 else ("overbought" if rsi > 70 else "neutral")

        mom = abs(trade_context.get("momentum", 0))
        mom_bucket = "weak" if mom < 0.3 else ("moderate" if mom < 0.6 else "strong")

        # Look up pattern win rate
        wr = self.get_pattern_win_rate(
            trade_context.get("category", ""),
            trade_context.get("direction", ""),
            trade_context.get("regime", "unknown"),
            rsi_bucket, mom_bucket,
        )

        if wr is not None:
            return wr

        # Not enough pattern data — check general category win rate
        row = self.conn.execute("""
            SELECT COUNT(*) as total, SUM(won) as wins
            FROM trades WHERE category = ?
        """, (trade_context.get("category", ""),)).fetchone()

        if row and row["total"] >= 5:
            return row["wins"] / row["total"]

        return 0.5  # No data — neutral

    # ═══════════════════════════════════════════════════
    # CORRELATION TRACKING
    # ═══════════════════════════════════════════════════

    def update_correlation(self, epic_a: str, epic_b: str, correlation: float, sample_size: int):
        """Store price correlation between two assets."""
        # Always store alphabetically to avoid duplicates
        a, b = sorted([epic_a, epic_b])
        self.conn.execute("""
            INSERT INTO asset_correlations (epic_a, epic_b, correlation, sample_size, updated_at)
            VALUES (?, ?, ?, ?, datetime('now'))
            ON CONFLICT(epic_a, epic_b) DO UPDATE SET
                correlation = ?, sample_size = ?, updated_at = datetime('now')
        """, (a, b, correlation, sample_size, correlation, sample_size))
        self.conn.commit()

    def get_correlated_assets(self, epic: str, threshold: float = 0.75) -> list[str]:
        """Get assets highly correlated with the given epic."""
        rows = self.conn.execute("""
            SELECT epic_a, epic_b, correlation FROM asset_correlations
            WHERE (epic_a = ? OR epic_b = ?) AND ABS(correlation) >= ?
            ORDER BY ABS(correlation) DESC
        """, (epic, epic, threshold)).fetchall()
        result = []
        for r in rows:
            other = r["epic_b"] if r["epic_a"] == epic else r["epic_a"]
            result.append(other)
        return result

    # ═══════════════════════════════════════════════════
    # REGIME DETECTION
    # ═══════════════════════════════════════════════════

    def record_regime(self, epic: str, regime: str, atr: float = 0,
                      volatility: float = 0, trend_strength: float = 0,
                      ema_alignment: str = "mixed"):
        """Record a market regime observation."""
        self.conn.execute("""
            INSERT INTO regime_history (epic, regime, atr, volatility, trend_strength, ema_alignment)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (epic, regime, atr, volatility, trend_strength, ema_alignment))
        self.conn.commit()

    def get_current_regime(self, epic: str) -> str:
        """Get the most recently detected regime for an asset."""
        row = self.conn.execute("""
            SELECT regime FROM regime_history WHERE epic = ?
            ORDER BY detected_at DESC LIMIT 1
        """, (epic,)).fetchone()
        return row["regime"] if row else "unknown"

    def get_regime_win_rate(self, regime: str) -> float:
        """Get win rate when trading in a specific regime."""
        row = self.conn.execute("""
            SELECT COUNT(*) as total, SUM(won) as wins
            FROM trades WHERE regime = ?
        """, (regime,)).fetchone()
        if not row or row["total"] < 5:
            return 0.5
        return row["wins"] / row["total"]

    # ═══════════════════════════════════════════════════
    # STRATEGY SCORING
    # ═══════════════════════════════════════════════════

    def update_strategy_score(self, strategy_name: str, won: bool, pnl: float):
        """Update score for a named strategy."""
        cur = self.conn.cursor()
        row = cur.execute(
            "SELECT * FROM strategy_scores WHERE strategy_name = ?", (strategy_name,)
        ).fetchone()

        if row is None:
            score = 0.6 if won else 0.4
            cur.execute("""
                INSERT INTO strategy_scores (strategy_name, total_trades, wins, total_pnl, win_rate, score)
                VALUES (?, 1, ?, ?, ?, ?)
            """, (strategy_name, 1 if won else 0, pnl, 1.0 if won else 0.0, score))
        else:
            total = row["total_trades"] + 1
            wins = row["wins"] + (1 if won else 0)
            total_pnl = row["total_pnl"] + pnl
            wr = wins / total
            # Exponential moving score: recent trades weighted more
            alpha = 0.15
            new_score = row["score"] * (1 - alpha) + (1.0 if won else 0.0) * alpha
            cur.execute("""
                UPDATE strategy_scores SET
                    total_trades = ?, wins = ?, total_pnl = ?,
                    win_rate = ?, avg_pnl = ?, score = ?,
                    updated_at = datetime('now')
                WHERE strategy_name = ?
            """, (total, wins, total_pnl, wr, total_pnl / total, new_score, strategy_name))

        self.conn.commit()

    def get_strategy_score(self, strategy_name: str) -> float:
        """Get the current score for a strategy (0-1)."""
        row = self.conn.execute(
            "SELECT score FROM strategy_scores WHERE strategy_name = ?", (strategy_name,)
        ).fetchone()
        return row["score"] if row else 0.5

    def is_strategy_enabled(self, strategy_name: str) -> bool:
        """Check if a strategy is still enabled (not auto-disabled due to poor performance)."""
        row = self.conn.execute(
            "SELECT enabled, score FROM strategy_scores WHERE strategy_name = ?", (strategy_name,)
        ).fetchone()
        if not row:
            return True
        return bool(row["enabled"]) and row["score"] > 0.2

    # ═══════════════════════════════════════════════════
    # AI REVIEW STORAGE
    # ═══════════════════════════════════════════════════

    def store_ai_review(self, trade_id: int, review_text: str,
                        lessons: list[str], adjustments: dict,
                        confidence: float = 0.5):
        """Store an AI-generated trade review."""
        self.conn.execute("""
            INSERT INTO ai_reviews (trade_id, review_text, lessons_learned,
                suggested_adjustments, confidence_in_review)
            VALUES (?, ?, ?, ?, ?)
        """, (trade_id, review_text, json.dumps(lessons),
              json.dumps(adjustments), confidence))
        self.conn.commit()

    def get_recent_lessons(self, limit: int = 10) -> list[dict]:
        """Get recent AI-learned lessons."""
        rows = self.conn.execute("""
            SELECT r.trade_id, r.review_text, r.lessons_learned,
                   r.suggested_adjustments, r.confidence_in_review,
                   t.epic, t.direction, t.pnl
            FROM ai_reviews r
            JOIN trades t ON t.id = r.trade_id
            ORDER BY r.created_at DESC LIMIT ?
        """, (limit,)).fetchall()
        return [dict(r) for r in rows]

    # ═══════════════════════════════════════════════════
    # ADAPTIVE PARAMS (replaces JSON file)
    # ═══════════════════════════════════════════════════

    def save_params(self, epic: str, params: dict):
        """Save adaptive params to DB."""
        self.conn.execute("""
            INSERT INTO adaptive_params (epic, params, updated_at)
            VALUES (?, ?, datetime('now'))
            ON CONFLICT(epic) DO UPDATE SET params = ?, updated_at = datetime('now')
        """, (epic, json.dumps(params), json.dumps(params)))
        self.conn.commit()

    def load_params(self, epic: str) -> Optional[dict]:
        """Load adaptive params from DB."""
        row = self.conn.execute(
            "SELECT params FROM adaptive_params WHERE epic = ?", (epic,)
        ).fetchone()
        if row and row["params"]:
            return json.loads(row["params"])
        return None

    # ═══════════════════════════════════════════════════
    # DRAWDOWN TRACKING
    # ═══════════════════════════════════════════════════

    def get_session_drawdown(self) -> dict:
        """Get current session P&L stats for drawdown management."""
        rows = self.conn.execute("""
            SELECT pnl, won FROM trades
            WHERE exit_time >= datetime('now', '-4 hours')
            ORDER BY exit_time ASC
        """).fetchall()

        if not rows:
            return {"session_pnl": 0, "session_trades": 0, "consecutive_losses": 0,
                    "drawdown_active": False}

        total_pnl = sum(r["pnl"] for r in rows)
        consec_losses = 0
        for r in reversed(rows):
            if r["won"] == 0:
                consec_losses += 1
            else:
                break

        return {
            "session_pnl": total_pnl,
            "session_trades": len(rows),
            "consecutive_losses": consec_losses,
            "drawdown_active": consec_losses >= 3 or total_pnl < -50,
            "win_rate": sum(r["won"] for r in rows) / len(rows),
        }

    # ═══════════════════════════════════════════════════
    # SUMMARY & REPORTING
    # ═══════════════════════════════════════════════════

    def get_brain_summary(self) -> dict:
        """Get a full summary of what the brain has learned."""
        total = self.conn.execute("SELECT COUNT(*) FROM trades").fetchone()[0]
        wins = self.conn.execute("SELECT COUNT(*) FROM trades WHERE won = 1").fetchone()[0]
        total_pnl = self.conn.execute("SELECT COALESCE(SUM(pnl), 0) FROM trades").fetchone()[0]

        # Best/worst assets
        best = self.conn.execute("""
            SELECT epic, win_rate, total_trades, total_pnl FROM asset_performance
            WHERE total_trades >= 5 ORDER BY win_rate DESC LIMIT 3
        """).fetchall()

        worst = self.conn.execute("""
            SELECT epic, win_rate, total_trades, total_pnl FROM asset_performance
            WHERE total_trades >= 5 ORDER BY win_rate ASC LIMIT 3
        """).fetchall()

        # Best strategies
        strategies = self.conn.execute("""
            SELECT strategy_name, score, win_rate, total_trades FROM strategy_scores
            ORDER BY score DESC LIMIT 5
        """).fetchall()

        # Regime performance
        regimes = self.conn.execute("""
            SELECT regime, COUNT(*) as total, SUM(won) as wins,
                   ROUND(CAST(SUM(won) AS REAL) / COUNT(*), 2) as wr
            FROM trades WHERE regime != 'unknown'
            GROUP BY regime HAVING total >= 3
            ORDER BY wr DESC
        """).fetchall()

        return {
            "total_trades": total,
            "wins": wins,
            "win_rate": wins / total if total > 0 else 0,
            "total_pnl": round(total_pnl, 2),
            "best_assets": [dict(r) for r in best],
            "worst_assets": [dict(r) for r in worst],
            "strategies": [dict(r) for r in strategies],
            "regime_performance": [dict(r) for r in regimes],
        }

    def close(self):
        self.conn.close()
