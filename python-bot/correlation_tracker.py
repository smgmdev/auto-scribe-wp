"""
Correlation Tracker — detects price correlation between open positions.

Prevents opening multiple positions that move in the same direction
(e.g., AAPL and MSFT often move together, so having both is double risk).

Uses recent price data to compute Pearson correlation coefficients.
"""

import numpy as np
from typing import Optional
from logger_setup import get_logger

log = get_logger("correlation")


class CorrelationTracker:
    """Tracks and enforces correlation limits between assets."""

    MAX_CORRELATION = 0.75  # Block if correlation > 75%
    MIN_SAMPLES = 20        # Need at least 20 data points

    def __init__(self, brain=None):
        self.brain = brain
        self._price_cache: dict[str, list[float]] = {}  # epic -> recent closes

    def update_prices(self, epic: str, close: float):
        """Feed a new close price for correlation tracking."""
        if epic not in self._price_cache:
            self._price_cache[epic] = []
        self._price_cache[epic].append(close)
        # Keep last 60 data points
        if len(self._price_cache[epic]) > 60:
            self._price_cache[epic] = self._price_cache[epic][-60:]

    def compute_correlation(self, epic_a: str, epic_b: str) -> Optional[float]:
        """Compute Pearson correlation between two assets."""
        prices_a = self._price_cache.get(epic_a, [])
        prices_b = self._price_cache.get(epic_b, [])

        if len(prices_a) < self.MIN_SAMPLES or len(prices_b) < self.MIN_SAMPLES:
            return None

        # Align lengths
        min_len = min(len(prices_a), len(prices_b))
        a = np.array(prices_a[-min_len:])
        b = np.array(prices_b[-min_len:])

        # Use returns instead of raw prices for better correlation
        if min_len < 3:
            return None
        returns_a = np.diff(a) / a[:-1]
        returns_b = np.diff(b) / b[:-1]

        # Remove any NaN/inf
        mask = np.isfinite(returns_a) & np.isfinite(returns_b)
        if mask.sum() < self.MIN_SAMPLES - 1:
            return None

        corr = np.corrcoef(returns_a[mask], returns_b[mask])[0, 1]

        if np.isfinite(corr):
            # Store in brain
            if self.brain:
                self.brain.update_correlation(epic_a, epic_b, float(corr), int(mask.sum()))
            return float(corr)

        return None

    def check_correlation_conflict(self, new_epic: str, open_epics: list[str],
                                    same_direction: bool = True) -> tuple[bool, str]:
        """
        Check if opening a position on new_epic would create excessive
        correlation with existing open positions.

        Returns: (allowed, reason)
        """
        for existing_epic in open_epics:
            if existing_epic == new_epic:
                continue

            corr = self.compute_correlation(new_epic, existing_epic)
            if corr is None:
                continue

            # High positive correlation + same direction = double risk
            if same_direction and corr > self.MAX_CORRELATION:
                return False, (
                    f"High correlation with {existing_epic} "
                    f"({corr:.2f}) — same direction doubles risk"
                )

            # High negative correlation + opposite direction = also double risk
            if not same_direction and corr < -self.MAX_CORRELATION:
                return False, (
                    f"High inverse correlation with {existing_epic} "
                    f"({corr:.2f}) — opposite direction doubles risk"
                )

        return True, "OK"

    def get_all_correlations(self) -> list[dict]:
        """Get all computed correlations for reporting."""
        results = []
        epics = list(self._price_cache.keys())
        for i in range(len(epics)):
            for j in range(i + 1, len(epics)):
                corr = self.compute_correlation(epics[i], epics[j])
                if corr is not None:
                    results.append({
                        "epic_a": epics[i],
                        "epic_b": epics[j],
                        "correlation": round(corr, 3),
                    })
        return sorted(results, key=lambda x: abs(x["correlation"]), reverse=True)
