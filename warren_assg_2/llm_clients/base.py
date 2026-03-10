"""
Abstract base class for all LLM annotators.
"""

from __future__ import annotations

import time
import logging
from abc import ABC, abstractmethod
from typing import Any

import config
from output_schema import extract_json, validate_annotation
from prompt_builder import SYSTEM_PROMPT, build_visit_prompt

log = logging.getLogger(__name__)


class BaseAnnotator(ABC):
    """
    Subclasses implement `_call_api` to hit a specific provider.
    This base class handles prompt building, retries, JSON parsing,
    validation, and token tracking.
    """

    provider: str  # e.g. "anthropic", "openai", "gemini"

    def __init__(self) -> None:
        self.cfg = config.MODELS[self.provider]
        self.total_input_tokens = 0
        self.total_output_tokens = 0
        self.total_calls = 0
        self.total_errors = 0

    # ── Public interface ────────────────────────────────────────────────
    @property
    def model_name(self) -> str:
        return self.cfg["name"]

    @property
    def model_id(self) -> str:
        return self.cfg["model_id"]

    def annotate(self, visit: dict[str, Any]) -> dict[str, Any]:
        """
        Annotate a single visit.  Returns the parsed annotation dict.
        Raises on unrecoverable failure after retries.
        """
        user_prompt = build_visit_prompt(visit)
        expected_bins = len(visit["bins"])
        if config.MAX_BINS_PER_PROMPT is not None:
            expected_bins = min(expected_bins, config.MAX_BINS_PER_PROMPT)

        last_error: Exception | None = None

        for attempt in range(1, config.MAX_RETRIES + 1):
            try:
                raw_text, usage = self._call_api(SYSTEM_PROMPT, user_prompt)
                self.total_calls += 1
                self.total_input_tokens += usage.get("input_tokens", 0)
                self.total_output_tokens += usage.get("output_tokens", 0)

                obj = extract_json(raw_text)
                errors = validate_annotation(obj, expected_bins)
                if errors:
                    log.warning(
                        "%s attempt %d validation errors: %s",
                        self.provider, attempt, errors,
                    )
                    # If we got a parseable object with the right bins, accept it
                    # with a warning rather than retrying for minor issues
                    if obj.get("bins") and len(obj["bins"]) == expected_bins:
                        return obj
                    raise ValueError("; ".join(errors))

                return obj

            except Exception as exc:
                last_error = exc
                self.total_errors += 1
                wait = config.RETRY_BACKOFF_BASE ** attempt
                log.warning(
                    "%s attempt %d failed (%s). Retrying in %ds …",
                    self.provider, attempt, exc, wait,
                )
                time.sleep(wait)

        raise RuntimeError(
            f"{self.provider}: all {config.MAX_RETRIES} attempts failed. "
            f"Last error: {last_error}"
        )

    def usage_summary(self) -> dict[str, Any]:
        return {
            "provider": self.provider,
            "model_id": self.model_id,
            "total_calls": self.total_calls,
            "total_errors": self.total_errors,
            "total_input_tokens": self.total_input_tokens,
            "total_output_tokens": self.total_output_tokens,
        }

    # ── Subclasses implement this ───────────────────────────────────────
    @abstractmethod
    def _call_api(
        self, system_prompt: str, user_prompt: str
    ) -> tuple[str, dict[str, int]]:
        """
        Send the prompts to the LLM and return (raw_text, usage_dict).
        usage_dict should have keys: input_tokens, output_tokens.
        """
        ...
