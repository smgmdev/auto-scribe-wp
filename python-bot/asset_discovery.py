"""
Dynamic Asset Discovery — AI selects best stocks & crypto to trade.

Instead of a hardcoded watchlist, the bot:
1. Queries Capital.com for available markets
2. Ranks stocks and crypto by volatility (percentageChange) and liquidity (spread)
3. Selects the top movers that are currently tradeable
4. Re-scans periodically to rotate into the hottest assets

Commodities remain fixed (limited set, all are liquid).
"""

import time
from typing import Optional
from logger_setup import get_logger

log = get_logger("discovery")

# How many assets to select per category
TOP_STOCKS = 10
TOP_CRYPTO = 8

# Re-discover every N minutes
DISCOVERY_INTERVAL = 600  # 10 minutes

# Instrument type mapping from Capital.com API
INSTRUMENT_TYPE_MAP = {
    "SHARES": "stocks",
    "CRYPTOCURRENCIES": "crypto",
    "COMMODITIES": "commodities",
    "CURRENCIES": "forex",  # excluded for now
    "INDICES": "indices",   # excluded for now
}


class AssetDiscovery:
    """
    Dynamically discovers the best stocks and crypto to trade
    based on real-time exchange data.
    """

    def __init__(self, api):
        self.api = api
        self.last_discovery: float = 0
        self.discovered_stocks: list[dict] = []
        self.discovered_crypto: list[dict] = []
        self.stock_epics: list[str] = []
        self.crypto_epics: list[str] = []

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

        # Recurse into "Most Traded" / "Most Volatile" sub-nodes (priority)
        if max_depth > 0 and sub_nodes:
            priority_keywords = ["most_traded", "most_volatile", "top_gainers", "top_losers"]
            for node in sub_nodes:
                nid = node.get("id", "")
                name = node.get("name", "")
                # Prioritize high-activity sub-categories
                is_priority = any(kw in nid.lower() or kw in name.lower() 
                                  for kw in priority_keywords)
                if is_priority or max_depth >= 2:
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
            # Volatility score (0-10) + Liquidity score (0-5)
            vol_score = min(pct_change, 10)  # Cap at 10%
            liq_score = max(0, 5 - spread_pct * 10)  # Lower spread = higher score

            total_score = vol_score * 0.7 + liq_score * 0.3

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

    def discover(self, force: bool = False) -> dict:
        """
        Discover the best stocks and crypto to trade right now.
        
        Returns:
            {
                "stocks": [{"epic": ..., "name": ..., "score": ...}, ...],
                "crypto": [{"epic": ..., "name": ..., "score": ...}, ...],
                "stock_epics": ["AAPL", "TSLA", ...],
                "crypto_epics": ["BTCUSD", "ETHUSD", ...],
            }
        """
        now = time.time()
        if not force and (now - self.last_discovery < DISCOVERY_INTERVAL) and self.stock_epics:
            return {
                "stocks": self.discovered_stocks,
                "crypto": self.discovered_crypto,
                "stock_epics": self.stock_epics,
                "crypto_epics": self.crypto_epics,
            }

        log.info("🔎 ═══ ASSET DISCOVERY — Finding best movers ═══")

        # --- Discover stocks ---
        log.info("📈 Scanning stocks...")
        all_stocks = []

        # Method 1: Browse market navigation for shares
        categories = self.api.get_market_categories()
        stock_nodes = [n for n in categories if "share" in n.get("name", "").lower() 
                       or "stock" in n.get("name", "").lower()
                       or "commons" in n.get("id", "").lower()]

        for node in stock_nodes:
            assets = self._discover_category_assets(node["id"], max_depth=2)
            stock_assets = [a for a in assets if a.get("instrumentType") in ("SHARES", "EQUITIES")]
            all_stocks.extend(stock_assets)
            log.info(f"  Found {len(stock_assets)} stocks from {node.get('name', node.get('id'))}")

        # Method 2: Search for popular stocks as fallback
        if len(all_stocks) < TOP_STOCKS:
            for term in ["AAPL", "TSLA", "NVDA", "MSFT", "AMZN", "GOOGL", "META", "AMD", "NFLX", "JPM", 
                         "BA", "DIS", "PYPL", "INTC", "UBER", "COIN", "PLTR", "SNAP", "SQ", "SHOP"]:
                results = self.api.search_markets(term)
                stock_results = [r for r in results if r.get("instrumentType") in ("SHARES", "EQUITIES")
                                 and r.get("marketStatus") == "TRADEABLE"]
                all_stocks.extend(stock_results)

        ranked_stocks = self._rank_assets(all_stocks)[:TOP_STOCKS]

        # --- Discover crypto ---
        log.info("₿ Scanning crypto...")
        all_crypto = []

        crypto_nodes = [n for n in categories if "crypto" in n.get("name", "").lower()
                        or "crypto" in n.get("id", "").lower()]

        for node in crypto_nodes:
            assets = self._discover_category_assets(node["id"], max_depth=2)
            crypto_assets = [a for a in assets if a.get("instrumentType") == "CRYPTOCURRENCIES"]
            all_crypto.extend(crypto_assets)
            log.info(f"  Found {len(crypto_assets)} crypto from {node.get('name', node.get('id'))}")

        # Fallback: search popular crypto
        if len(all_crypto) < TOP_CRYPTO:
            for term in ["BTC", "ETH", "SOL", "XRP", "BNB", "DOGE", "ADA", "AVAX", 
                         "DOT", "MATIC", "LINK", "UNI", "NEAR", "APT", "ARB"]:
                results = self.api.search_markets(term)
                crypto_results = [r for r in results if r.get("instrumentType") == "CRYPTOCURRENCIES"
                                  and r.get("marketStatus") == "TRADEABLE"]
                all_crypto.extend(crypto_results)

        ranked_crypto = self._rank_assets(all_crypto)[:TOP_CRYPTO]

        # Store results
        self.discovered_stocks = ranked_stocks
        self.discovered_crypto = ranked_crypto
        self.stock_epics = [s["epic"] for s in ranked_stocks]
        self.crypto_epics = [c["epic"] for c in ranked_crypto]
        self.last_discovery = now

        # Log results
        log.info(f"📈 Top {len(ranked_stocks)} Stocks selected:")
        for i, s in enumerate(ranked_stocks):
            log.info(f"  {i+1}. {s['epic']} ({s['name']}) | move={s['pct_change']}% spread={s['spread_pct']:.3f}% score={s['score']}")

        log.info(f"₿ Top {len(ranked_crypto)} Crypto selected:")
        for i, c in enumerate(ranked_crypto):
            log.info(f"  {i+1}. {c['epic']} ({c['name']}) | move={c['pct_change']}% spread={c['spread_pct']:.3f}% score={c['score']}")

        return {
            "stocks": ranked_stocks,
            "crypto": ranked_crypto,
            "stock_epics": self.stock_epics,
            "crypto_epics": self.crypto_epics,
        }
