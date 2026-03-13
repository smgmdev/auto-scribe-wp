"""
AI Trade Reviewer — post-trade analysis using an LLM.

After each trade closes, sends the full context to an AI model
to get a review of what went right/wrong and suggested improvements.

Uses OpenAI-compatible API (can be local ollama, OpenAI, or any compatible endpoint).
Falls back gracefully if no API is configured.
"""

import os
import json
import time
from typing import Optional
from logger_setup import get_logger

log = get_logger("ai_reviewer")

# Configure via env vars
AI_REVIEW_ENABLED = os.getenv("AI_REVIEW_ENABLED", "true").lower() == "true"
AI_REVIEW_API_URL = os.getenv("AI_REVIEW_API_URL", "https://api.openai.com/v1/chat/completions")
AI_REVIEW_API_KEY = os.getenv("AI_REVIEW_API_KEY", "")
AI_REVIEW_MODEL = os.getenv("AI_REVIEW_MODEL", "gpt-4o-mini")
AI_REVIEW_INTERVAL = int(os.getenv("AI_REVIEW_INTERVAL", "5"))  # Review every N trades


class AITradeReviewer:
    """Reviews trades using an LLM for learning insights."""

    def __init__(self, brain=None):
        self.brain = brain
        self._trade_count = 0
        self._enabled = AI_REVIEW_ENABLED and bool(AI_REVIEW_API_KEY)

        if self._enabled:
            log.info(f"🤖 AI Trade Reviewer enabled (model: {AI_REVIEW_MODEL})")
        else:
            log.info("🤖 AI Trade Reviewer: disabled (no API key or disabled in env)")

    def review_trade(self, trade: dict, trade_id: int,
                     brain_summary: dict = None) -> Optional[dict]:
        """
        Review a single trade. Called after every trade close.
        Only actually calls the API every AI_REVIEW_INTERVAL trades
        to save costs, but always stores the trade context.
        """
        self._trade_count += 1

        if not self._enabled:
            return None

        # Only call API every N trades (batch review)
        if self._trade_count % AI_REVIEW_INTERVAL != 0:
            return None

        try:
            return self._call_review_api(trade, trade_id, brain_summary)
        except Exception as e:
            log.warning(f"AI review failed: {e}")
            return None

    def _call_review_api(self, trade: dict, trade_id: int,
                         brain_summary: dict = None) -> Optional[dict]:
        """Call the LLM API for trade review."""
        import requests

        # Build context prompt
        recent_lessons = []
        if self.brain:
            recent_lessons = self.brain.get_recent_lessons(5)

        prompt = self._build_review_prompt(trade, brain_summary, recent_lessons)

        payload = {
            "model": AI_REVIEW_MODEL,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are an elite quantitative trading analyst at a top hedge fund. "
                        "Analyze the trade data provided and give actionable feedback. "
                        "Be specific about what went wrong or right and suggest concrete parameter adjustments. "
                        "Respond in JSON format with keys: "
                        "'analysis' (2-3 sentence review), "
                        "'lessons' (array of 1-3 short lesson strings), "
                        "'adjustments' (dict of parameter changes, e.g. {'momentum_threshold': 0.6}), "
                        "'confidence' (0.0-1.0 how confident you are in this analysis), "
                        "'avoid_pattern' (string describing what to avoid, or null)"
                    )
                },
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.3,
            "max_tokens": 500,
        }

        headers = {
            "Authorization": f"Bearer {AI_REVIEW_API_KEY}",
            "Content-Type": "application/json",
        }

        resp = requests.post(AI_REVIEW_API_URL, json=payload, headers=headers, timeout=30)
        if resp.status_code != 200:
            log.warning(f"AI review API error: {resp.status_code}")
            return None

        content = resp.json()["choices"][0]["message"]["content"]

        # Parse JSON response
        try:
            # Handle markdown code blocks
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0]
            elif "```" in content:
                content = content.split("```")[1].split("```")[0]

            review = json.loads(content.strip())
        except json.JSONDecodeError:
            review = {
                "analysis": content[:500],
                "lessons": [],
                "adjustments": {},
                "confidence": 0.3,
                "avoid_pattern": None,
            }

        # Store in brain
        if self.brain:
            self.brain.store_ai_review(
                trade_id=trade_id,
                review_text=review.get("analysis", ""),
                lessons=review.get("lessons", []),
                adjustments=review.get("adjustments", {}),
                confidence=review.get("confidence", 0.5),
            )

        log.info(f"🤖 AI Review for trade #{trade_id}: {review.get('analysis', '')[:100]}")

        if review.get("lessons"):
            for lesson in review["lessons"]:
                log.info(f"  📝 Lesson: {lesson}")

        return review

    def _build_review_prompt(self, trade: dict, brain_summary: dict = None,
                              recent_lessons: list = None) -> str:
        """Build the prompt for trade review."""
        won = "WON" if trade.get("pnl", 0) > 0 else "LOST"
        lines = [
            f"Trade Result: {won}",
            f"Asset: {trade.get('epic')} ({trade.get('category', 'unknown')})",
            f"Direction: {trade.get('direction')}",
            f"Entry: {trade.get('entry_price')} → Exit: {trade.get('exit_price')}",
            f"P&L: {trade.get('pnl', 0):.5f} ({trade.get('pnl_pct', 0):.2f}%)",
            f"Duration: {trade.get('duration_seconds', 0):.0f}s",
            f"Entry Reason: {trade.get('entry_reason', 'unknown')}",
            f"Exit Reason: {trade.get('exit_reason', 'unknown')}",
            f"Market Regime: {trade.get('regime', 'unknown')}",
            f"RSI at Entry: {trade.get('rsi_at_entry', 50):.1f}",
            f"Momentum at Entry: {trade.get('momentum_at_entry', 0):.3f}",
            f"Scanner Confidence: {trade.get('scanner_confidence', 0):.3f}",
            f"Stop Distance: {trade.get('stop_distance', 0):.5f}",
            f"Nearest Support: {trade.get('nearest_support', 0):.5f}",
            f"Nearest Resistance: {trade.get('nearest_resistance', 0):.5f}",
        ]

        if brain_summary:
            lines.append(f"\nOverall Bot Performance:")
            lines.append(f"Total trades: {brain_summary.get('total_trades', 0)}")
            lines.append(f"Win rate: {brain_summary.get('win_rate', 0):.1%}")
            lines.append(f"Total P&L: {brain_summary.get('total_pnl', 0):.2f}")

        if recent_lessons:
            lines.append(f"\nRecent AI Lessons:")
            for lesson in recent_lessons[:3]:
                lessons_text = lesson.get("lessons_learned", "[]")
                try:
                    parsed = json.loads(lessons_text) if isinstance(lessons_text, str) else lessons_text
                    for l in parsed:
                        lines.append(f"  - {l}")
                except Exception:
                    pass

        return "\n".join(lines)

    def get_batch_review(self, trades: list[dict]) -> Optional[dict]:
        """Review a batch of recent trades for broader pattern insights."""
        if not self._enabled or len(trades) < 5:
            return None

        # Only do batch review if we have enough losses
        losses = [t for t in trades if t.get("pnl", 0) <= 0]
        if len(losses) < 3:
            return None

        try:
            import requests

            summary_lines = []
            for t in trades[-10:]:
                won = "✅" if t.get("pnl", 0) > 0 else "❌"
                summary_lines.append(
                    f"{won} {t.get('direction')} {t.get('epic')} | "
                    f"P&L: {t.get('pnl', 0):.5f} | {t.get('exit_reason', '?')}"
                )

            prompt = (
                f"Review these last {len(trades)} trades and identify patterns:\n\n" +
                "\n".join(summary_lines) +
                "\n\nWhat systemic issues do you see? What should the bot change?"
            )

            payload = {
                "model": AI_REVIEW_MODEL,
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "You are a quantitative trading systems analyst. "
                            "Identify patterns in the trade log and suggest systemic improvements. "
                            "Respond in JSON: {'systemic_issues': [...], 'recommended_changes': {...}, 'priority': 'high'|'medium'|'low'}"
                        )
                    },
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.3,
                "max_tokens": 500,
            }

            headers = {
                "Authorization": f"Bearer {AI_REVIEW_API_KEY}",
                "Content-Type": "application/json",
            }

            resp = requests.post(AI_REVIEW_API_URL, json=payload, headers=headers, timeout=30)
            if resp.status_code == 200:
                content = resp.json()["choices"][0]["message"]["content"]
                try:
                    if "```json" in content:
                        content = content.split("```json")[1].split("```")[0]
                    return json.loads(content.strip())
                except Exception:
                    return {"systemic_issues": [content[:300]], "priority": "medium"}

        except Exception as e:
            log.warning(f"Batch review failed: {e}")

        return None
