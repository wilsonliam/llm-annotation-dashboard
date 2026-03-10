"""
Google Gemini annotator — uses the google-genai SDK.
"""

from __future__ import annotations

from google import genai
from google.genai import types

import config
from llm_clients.base import BaseAnnotator


class GeminiAnnotator(BaseAnnotator):
    provider = "gemini"

    def __init__(self) -> None:
        super().__init__()
        self.client = genai.Client(api_key=config.get_api_key("gemini"))

    def _call_api(
        self, system_prompt: str, user_prompt: str
    ) -> tuple[str, dict[str, int]]:
        resp = self.client.models.generate_content(
            model=self.cfg["model_id"],
            contents=user_prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                temperature=self.cfg["temperature"],
                max_output_tokens=self.cfg["max_tokens"],
                response_mime_type="application/json",
            ),
        )

        text = resp.text or ""

        # Usage metadata
        um = getattr(resp, "usage_metadata", None)
        usage = {
            "input_tokens": getattr(um, "prompt_token_count", 0) if um else 0,
            "output_tokens": getattr(um, "candidates_token_count", 0) if um else 0,
        }
        return text, usage
