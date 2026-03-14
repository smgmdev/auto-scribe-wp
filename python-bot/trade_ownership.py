"""
Trade Ownership Registry — ensures this bot only manages its own trades.

When sharing a Capital.com account with another bot, each bot must only
interact with positions it opened. This module persists deal IDs to a
local JSON file so ownership survives restarts.
"""

import json
import os
import threading
from logger_setup import get_logger

log = get_logger("ownership")

_REGISTRY_FILE = os.path.join(os.path.dirname(__file__), "own_deals.json")
_lock = threading.Lock()


def _load() -> set[str]:
    """Load owned deal IDs from disk."""
    try:
        if os.path.exists(_REGISTRY_FILE):
            with open(_REGISTRY_FILE, "r") as f:
                data = json.load(f)
                return set(data) if isinstance(data, list) else set()
    except Exception as e:
        log.error(f"Failed to load ownership registry: {e}")
    return set()


def _save(deal_ids: set[str]):
    """Persist owned deal IDs to disk."""
    try:
        with open(_REGISTRY_FILE, "w") as f:
            json.dump(sorted(deal_ids), f)
    except Exception as e:
        log.error(f"Failed to save ownership registry: {e}")


def register_deal(deal_id: str):
    """Register a deal ID as owned by this bot."""
    with _lock:
        owned = _load()
        if deal_id not in owned:
            owned.add(deal_id)
            _save(owned)
            log.info(f"📋 Registered own deal: {deal_id}")


def unregister_deal(deal_id: str):
    """Remove a closed deal from the registry."""
    with _lock:
        owned = _load()
        if deal_id in owned:
            owned.discard(deal_id)
            _save(owned)


def is_own_deal(deal_id: str) -> bool:
    """Check if a deal was opened by this bot."""
    with _lock:
        return deal_id in _load()


def get_own_deals() -> set[str]:
    """Return all deal IDs owned by this bot."""
    with _lock:
        return _load()


def cleanup_closed(open_deal_ids: set[str]):
    """Remove deals that are no longer open (position was closed by broker/SL/TP)."""
    with _lock:
        owned = _load()
        stale = owned - open_deal_ids
        if stale:
            owned -= stale
            _save(owned)
            log.info(f"🧹 Cleaned {len(stale)} closed deal(s) from registry")
