"""
OpenAI (GPT) annotator.
"""

from __future__ import annotations

from openai import OpenAI

import config
from llm_clients.base import BaseAnnotator


class OpenAIAnnotator(BaseAnnotator):
    provider = "openai"

    def __init__(self) -> None:
        super().__init__()
        self.client = OpenAI(
            api_key=config.get_api_key("openai"),
            timeout=config.REQUEST_TIMEOUT,
        )

    def _call_api(
        self, system_prompt: str, user_prompt: str
    ) -> tuple[str, dict[str, int]]:
        resp = self.client.chat.completions.create(
            model=self.cfg["model_id"],
            max_tokens=self.cfg["max_tokens"],
            temperature=self.cfg["temperature"],
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        )

        text = resp.choices[0].message.content or ""
        usage = {
            "input_tokens": resp.usage.prompt_tokens if resp.usage else 0,
            "output_tokens": resp.usage.completion_tokens if resp.usage else 0,
        }
        return text, usage
