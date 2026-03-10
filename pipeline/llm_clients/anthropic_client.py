"""
Anthropic (Claude) annotator.
"""

from __future__ import annotations

import anthropic

import config
from llm_clients.base import BaseAnnotator


class AnthropicAnnotator(BaseAnnotator):
    provider = "anthropic"

    def __init__(self) -> None:
        super().__init__()
        self.client = anthropic.Anthropic(
            api_key=config.get_api_key("anthropic"),
            timeout=config.REQUEST_TIMEOUT,
        )

    def _call_api(
        self, system_prompt: str, user_prompt: str
    ) -> tuple[str, dict[str, int]]:
        resp = self.client.messages.create(
            model=self.cfg["model_id"],
            max_tokens=self.cfg["max_tokens"],
            temperature=self.cfg["temperature"],
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
        )

        text = resp.content[0].text
        usage = {
            "input_tokens": resp.usage.input_tokens,
            "output_tokens": resp.usage.output_tokens,
        }
        return text, usage
