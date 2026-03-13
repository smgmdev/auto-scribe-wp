"""
Dynamic Asset Discovery — AI selects best stocks, crypto & forex to trade.

Instead of a hardcoded watchlist, the bot:
1. Queries Capital.com for available markets
2. Ranks stocks, crypto, and forex by volatility (percentageChange) and liquidity (spread)
3. Selects the top movers that are currently tradeable
4. Re-scans periodically to rotate into the hottest assets
5. Ensures pinned assets (e.g. BTCUSD) are always included

Commodities are also dynamically discovered from Capital.com categories.
"""

import time
from typing import Optional
from logger_setup import get_logger
import config

log = get_logger("discovery")

# How many assets to select per category
TOP_STOCKS = 10
TOP_CRYPTO = 15
TOP_FOREX = 12
TOP_COMMODITIES = 8

# Re-discover every N minutes (faster for volatile markets)
DISCOVERY_INTERVAL = 300  # 5 minutes

# Instrument type mapping from Capital.com API
INSTRUMENT_TYPE_MAP = {
    "SHARES": "stocks",
    "CRYPTOCURRENCIES": "crypto",
    "COMMODITIES": "commodities",
    "CURRENCIES": "forex",
    "INDICES": "indices",   # excluded for now
}

# Delay between search API calls to avoid rate limits
_SEARCH_DELAY = 0.3  # 300ms


class AssetDiscovery:
    """
    Dynamically discovers the best stocks, crypto, and forex to trade
    based on real-time exchange data.
    """

    def __init__(self, api):
        self.api = api
        self.last_discovery: float = 0
        self.discovered_stocks: list[dict] = []
        self.discovered_crypto: list[dict] = []
        self.discovered_forex: list[dict] = []
        self.discovered_commodities: list[dict] = []
        self.stock_epics: list[str] = []
        self.crypto_epics: list[str] = []
        self.forex_epics: list[str] = []
        self.commodity_epics: list[str] = []

    def _discover_category_assets(self, node_id: str, max_depth: int = 2) -> list[dict]:
        """Recursively discover tradeable assets from a market navigation node."""
        result = self.api.get_category_markets(node_id)
        markets = result.get("markets", [])
        sub_nodes = result.get("nodes", [])

        assets = []

        # Collect direct markets
        for m in markets:
            if m.get("marketStatus") == "TRADEABLE":
                assets.append(m)

        # Recurse into sub-nodes with delay between calls
        if max_depth > 0 and sub_nodes:
            priority_keywords = ["most_traded", "most_volatile", "top_gainers", "top_losers", "major", "minor"]
            for node in sub_nodes:
                nid = node.get("id", "")
                name = node.get("name", "")
                is_priority = any(kw in nid.lower() or kw in name.lower()
                                  for kw in priority_keywords)
                if is_priority or max_depth >= 2:
                    time.sleep(_SEARCH_DELAY)  # Pace recursive calls
                    sub_assets = self._discover_category_assets(nid, max_depth - 1)
                    assets.extend(sub_assets)

        return assets

    def _rank_assets(self, assets: list[dict]) -> list[dict]:
        """
        Rank assets by trading quality:
        - Higher abs(percentageChange) = more movement = better for trading
        - Lower spread relative to price = better liquidity
        - Must be TRADEABLE
        """
        ranked = []
        seen_epics = set()

        for m in assets:
            epic = m.get("epic", "")
            if epic in seen_epics:
                continue
            seen_epics.add(epic)

            if m.get("marketStatus") != "TRADEABLE":
                continue

            pct_change = abs(m.get("percentageChange", 0) or 0)
            bid = m.get("bid", 0) or 0
            offer = m.get("offer", 0) or 0

            if bid <= 0 or offer <= 0:
                continue

            spread = offer - bid
            mid = (bid + offer) / 2
            spread_pct = (spread / mid) * 100 if mid > 0 else 100

            # Score: high movement + low spread = good tradeable asset
            vol_score = min(pct_change, 15)
            liq_score = max(0, 5 - spread_pct * 10)

            total_score = vol_score * 0.8 + liq_score * 0.2

            ranked.append({
                "epic": epic,
                "name": m.get("instrumentName", epic),
                "type": m.get("instrumentType", "unknown"),
                "pct_change": round(pct_change, 2),
                "spread_pct": round(spread_pct, 4),
                "bid": bid,
                "offer": offer,
                "score": round(total_score, 3),
            })

        ranked.sort(key=lambda x: x["score"], reverse=True)
        return ranked

    def _search_fallback(
        self,
        terms: list[str],
        instrument_types: tuple[str, ...],
        require_tradeable: bool = True,
        limit_per_term: int = 5,
    ) -> list[dict]:
        """Search for assets by terms with pacing between calls."""
        results: list[dict] = []
        seen_epics: set[str] = set()
        allowed_types = {t.upper() for t in instrument_types}

        for term in terms:
            try:
                markets = self.api.search_markets(term)
                matched = []
                for r in markets:
                    epic = r.get("epic", "")
                    r_type = str(r.get("instrumentType", "")).upper()
                    r_status = str(r.get("marketStatus", "")).upper()
                    if not epic or epic in seen_epics:
                        continue
                    if r_type not in allowed_types:
                        continue
                    if require_tradeable and r_status != "TRADEABLE":
                        continue
                    matched.append(r)
                    seen_epics.add(epic)
                    if len(matched) >= limit_per_term:
                        break

                results.extend(matched)
                if matched:
                    mode = "TRADEABLE" if require_tradeable else "ANY"
                    log.info(f"  🔍 Search '{term}' [{mode}]: found {len(matched)}")
            except Exception as e:
                log.warning(f"  Search '{term}' failed: {e}")
            time.sleep(_SEARCH_DELAY)
        return results

    def _placeholder_ranked(self, markets: list[dict], top_n: int, fallback_type: str) -> list[dict]:
        """Build ranked-like fallback list from raw market records (even if not tradeable)."""
        ranked: list[dict] = []
        seen_epics: set[str] = set()
        for m in markets:
            epic = m.get("epic", "")
            if not epic or epic in seen_epics:
                continue
            seen_epics.add(epic)
            ranked.append({
                "epic": epic,
                "name": m.get("instrumentName", epic),
                "type": m.get("instrumentType", fallback_type),
                "pct_change": round(abs(m.get("percentageChange", 0) or 0), 2),
                "spread_pct": 0,
                "bid": m.get("bid", 0) or 0,
                "offer": m.get("offer", 0) or 0,
                "score": 0.0,
            })
            if len(ranked) >= top_n:
                break
        return ranked

    def discover(self, force: bool = False) -> dict:
        """
        Discover the best stocks, crypto, and forex to trade right now.
        """
        now = time.time()
        if not force and (now - self.last_discovery < DISCOVERY_INTERVAL) and self.stock_epics:
            return {
                "stocks": self.discovered_stocks,
                "crypto": self.discovered_crypto,
                "forex": self.discovered_forex,
                "commodities": self.discovered_commodities,
                "stock_epics": self.stock_epics,
                "crypto_epics": self.crypto_epics,
                "forex_epics": self.forex_epics,
                "commodity_epics": self.commodity_epics,
            }

        log.info("🔎 ═══ ASSET DISCOVERY — Finding best movers ═══")

        categories = self.api.get_market_categories()
        if categories:
            log.info(f"📂 Found {len(categories)} top-level categories: {[n.get('name', n.get('id')) for n in categories]}")
        else:
            log.warning("⚠️ No market categories returned — will use fallback searches only")

        # --- Discover stocks ---
        log.info("📈 Scanning stocks...")
        all_stocks = []

        stock_nodes = [n for n in categories if "share" in n.get("name", "").lower()
                       or "stock" in n.get("name", "").lower()
                       or "equit" in n.get("name", "").lower()
                       or "commons" in n.get("id", "").lower()]

        if stock_nodes:
            for node in stock_nodes:
                assets = self._discover_category_assets(node["id"], max_depth=2)
                stock_assets = [a for a in assets if a.get("instrumentType") in ("SHARES", "EQUITIES")]
                all_stocks.extend(stock_assets)
                log.info(f"  Found {len(stock_assets)} stocks from {node.get('name', node.get('id'))}")
        else:
            log.warning("  ⚠️ No stock category nodes found — using search fallback")

        # ALWAYS run fallback to fill gaps
        stock_search_terms = ["AAPL", "TSLA", "NVDA", "MSFT", "AMZN", "GOOGL", "META", "AMD", "NFLX", "JPM",
                              "BA", "DIS", "PYPL", "INTC", "UBER", "COIN", "PLTR", "SNAP", "SQ", "SHOP"]
        if len(all_stocks) < TOP_STOCKS:
            log.info(f"  📡 Running stock search fallback ({len(all_stocks)}/{TOP_STOCKS} found so far)...")
            fallback = self._search_fallback(
                stock_search_terms,
                ("SHARES", "EQUITIES"),
                require_tradeable=True,
            )
            if len(fallback) < TOP_STOCKS:
                fallback += self._search_fallback(
                    stock_search_terms,
                    ("SHARES", "EQUITIES"),
                    require_tradeable=False,
                    limit_per_term=2,
                )
            all_stocks.extend(fallback)

        ranked_stocks = self._rank_assets(all_stocks)[:TOP_STOCKS]

        # --- Discover crypto ---
        log.info("₿ Scanning crypto...")
        all_crypto = []

        crypto_nodes = [n for n in categories if "crypto" in n.get("name", "").lower()
                        or "crypto" in n.get("id", "").lower()]

        if crypto_nodes:
            for node in crypto_nodes:
                assets = self._discover_category_assets(node["id"], max_depth=2)
                crypto_assets = [a for a in assets if a.get("instrumentType") == "CRYPTOCURRENCIES"]
                all_crypto.extend(crypto_assets)
                log.info(f"  Found {len(crypto_assets)} crypto from {node.get('name', node.get('id'))}")
        else:
            log.warning("  ⚠️ No crypto category nodes found — using search fallback")

        if len(all_crypto) < TOP_CRYPTO:
            log.info(f"  📡 Running crypto search fallback ({len(all_crypto)}/{TOP_CRYPTO} found so far)...")
            crypto_terms = ["BTC", "ETH", "SOL", "XRP", "BNB", "DOGE", "ADA", "AVAX",
                            "DOT", "MATIC", "LINK", "UNI", "NEAR", "APT", "ARB",
                            "PEPE", "SHIB", "WIF", "BONK", "SUI", "SEI", "TIA",
                            "FET", "RENDER", "INJ", "JUP", "ONDO", "OP", "STX"]
            all_crypto.extend(
                self._search_fallback(
                    crypto_terms,
                    ("CRYPTOCURRENCIES",),
                    require_tradeable=True,
                )
            )
            if len(all_crypto) < TOP_CRYPTO:
                all_crypto.extend(
                    self._search_fallback(
                        crypto_terms,
                        ("CRYPTOCURRENCIES",),
                        require_tradeable=False,
                        limit_per_term=2,
                    )
                )

        ranked_crypto = self._rank_assets(all_crypto)[:TOP_CRYPTO]

        # Ensure pinned crypto (BTCUSD) is always in the list
        pinned_epics = [c["epic"] for c in ranked_crypto]
        for pinned in config.CRYPTO_PINNED:
            if pinned not in pinned_epics:
                results = self.api.search_markets(pinned)
                time.sleep(_SEARCH_DELAY)
                for r in results:
                    if r.get("epic") == pinned and r.get("marketStatus") == "TRADEABLE":
                        ranked_crypto.insert(0, {
                            "epic": pinned,
                            "name": r.get("instrumentName", pinned),
                            "type": "CRYPTOCURRENCIES",
                            "pct_change": abs(r.get("percentageChange", 0) or 0),
                            "spread_pct": 0,
                            "bid": r.get("bid", 0),
                            "offer": r.get("offer", 0),
                            "score": 99.0,
                        })
                        break

        # --- Discover forex ---
        log.info("💱 Scanning forex...")
        all_forex = []

        forex_nodes = [n for n in categories if "currenc" in n.get("name", "").lower()
                       or "forex" in n.get("name", "").lower()
                       or "fx" in n.get("name", "").lower()
                       or "currenc" in n.get("id", "").lower()]

        if forex_nodes:
            for node in forex_nodes:
                assets = self._discover_category_assets(node["id"], max_depth=2)
                forex_assets = [a for a in assets if a.get("instrumentType") == "CURRENCIES"]
                all_forex.extend(forex_assets)
                log.info(f"  Found {len(forex_assets)} forex from {node.get('name', node.get('id'))}")
        else:
            log.warning("  ⚠️ No forex category nodes found — using search fallback")

        # ALWAYS run forex fallback if insufficient
        if len(all_forex) < TOP_FOREX:
            log.info(f"  📡 Running forex search fallback ({len(all_forex)}/{TOP_FOREX} found so far)...")
            forex_terms = ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD",
                           "USDCHF", "NZDUSD", "EURGBP", "EURJPY", "GBPJPY",
                           "AUDJPY", "EURAUD", "EURCHF", "CADJPY", "GBPAUD"]
            all_forex.extend(
                self._search_fallback(
                    forex_terms,
                    ("CURRENCIES",),
                    require_tradeable=True,
                )
            )
            if len(all_forex) < TOP_FOREX:
                all_forex.extend(
                    self._search_fallback(
                        forex_terms,
                        ("CURRENCIES",),
                        require_tradeable=False,
                        limit_per_term=2,
                    )
                )

        ranked_forex = self._rank_assets(all_forex)[:TOP_FOREX]

        # If ranked forex is STILL empty, use the fallback watchlist directly
        if not ranked_forex:
            log.warning("  ⚠️ Discovery found 0 forex — using hardcoded fallback epics")
            ranked_forex = [{"epic": ep, "name": ep, "type": "CURRENCIES",
                             "pct_change": 0, "spread_pct": 0, "bid": 0,
                             "offer": 0, "score": 0} for ep in config.WATCHLIST_FOREX_FALLBACK]

        # --- Discover commodities ---
        log.info("🪙 Scanning commodities...")
        all_commodities = []

        commodity_nodes = [n for n in categories if "commodit" in n.get("name", "").lower()
                           or "commodit" in n.get("id", "").lower()]

        if commodity_nodes:
            for node in commodity_nodes:
                assets = self._discover_category_assets(node["id"], max_depth=2)
                commodity_assets = [a for a in assets if a.get("instrumentType") == "COMMODITIES"]
                all_commodities.extend(commodity_assets)
                log.info(f"  Found {len(commodity_assets)} commodities from {node.get('name', node.get('id'))}")
        else:
            log.warning("  ⚠️ No commodity category nodes found — using search fallback")

        # ALWAYS run commodity fallback if insufficient
        if len(all_commodities) < TOP_COMMODITIES:
            log.info(f"  📡 Running commodity search fallback ({len(all_commodities)}/{TOP_COMMODITIES} found so far)...")
            commodity_terms = ["GOLD", "SILVER", "OIL_CRUDE", "NATURALGAS", "COPPER",
                               "PLATINUM", "PALLADIUM", "OIL_BRENT"]
            all_commodities.extend(
                self._search_fallback(
                    commodity_terms,
                    ("COMMODITIES",),
                    require_tradeable=True,
                )
            )
            if len(all_commodities) < TOP_COMMODITIES:
                all_commodities.extend(
                    self._search_fallback(
                        commodity_terms,
                        ("COMMODITIES",),
                        require_tradeable=False,
                        limit_per_term=2,
                    )
                )

        ranked_commodities = self._rank_assets(all_commodities)[:TOP_COMMODITIES]

        # If ranked commodities is STILL empty, use fallback
        if not ranked_commodities:
            log.warning("  ⚠️ Discovery found 0 commodities — using hardcoded fallback epics")
            ranked_commodities = [{"epic": ep, "name": ep, "type": "COMMODITIES",
                                   "pct_change": 0, "spread_pct": 0, "bid": 0,
                                   "offer": 0, "score": 0} for ep in config.WATCHLIST_COMMODITIES_FALLBACK]

        # Store results
        self.discovered_stocks = ranked_stocks
        self.discovered_crypto = ranked_crypto
        self.discovered_forex = ranked_forex
        self.discovered_commodities = ranked_commodities
        self.stock_epics = [s["epic"] for s in ranked_stocks]
        self.crypto_epics = [c["epic"] for c in ranked_crypto]
        self.forex_epics = [f["epic"] for f in ranked_forex]
        self.commodity_epics = [c["epic"] for c in ranked_commodities]
        self.last_discovery = now

        # Log results
        log.info(f"📈 Top {len(ranked_stocks)} Stocks selected:")
        for i, s in enumerate(ranked_stocks):
            log.info(f"  {i+1}. {s['epic']} ({s['name']}) | move={s['pct_change']}% spread={s['spread_pct']:.3f}% score={s['score']}")

        log.info(f"₿ Top {len(ranked_crypto)} Crypto selected:")
        for i, c in enumerate(ranked_crypto):
            pinned_tag = " 📌" if c["epic"] in config.CRYPTO_PINNED else ""
            log.info(f"  {i+1}. {c['epic']} ({c['name']}) | move={c['pct_change']}% spread={c['spread_pct']:.3f}% score={c['score']}{pinned_tag}")

        log.info(f"💱 Top {len(ranked_forex)} Forex selected:")
        for i, f in enumerate(ranked_forex):
            log.info(f"  {i+1}. {f['epic']} ({f['name']}) | move={f['pct_change']}% spread={f['spread_pct']:.3f}% score={f['score']}")

        log.info(f"🪙 Top {len(ranked_commodities)} Commodities selected:")
        for i, c in enumerate(ranked_commodities):
            log.info(f"  {i+1}. {c['epic']} ({c['name']}) | move={c['pct_change']}% spread={c['spread_pct']:.3f}% score={c['score']}")

        return {
            "stocks": ranked_stocks,
            "crypto": ranked_crypto,
            "forex": ranked_forex,
            "commodities": ranked_commodities,
            "stock_epics": self.stock_epics,
            "crypto_epics": self.crypto_epics,
            "forex_epics": self.forex_epics,
            "commodity_epics": self.commodity_epics,
        }
