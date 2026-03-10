"""
Central configuration for the ICU discharge annotation pipeline.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

# ── Paths ────────────────────────────────────────────────────────────────────
PROJECT_DIR = Path(__file__).resolve().parent
DATA_PATH = PROJECT_DIR / "display_visits.json"
RESULTS_DIR = PROJECT_DIR / "results"
RESULTS_DIR.mkdir(exist_ok=True)

# ── Model Definitions ────────────────────────────────────────────────────────
# Each entry: provider key -> (display name, model id, module path)
MODELS = {
    "anthropic": {
        "name": "Claude (Anthropic)",
        "model_id": "claude-sonnet-4-20250514",
        "temperature": 0.0,
        "max_tokens": 4096,
    },
    "openai": {
        "name": "GPT-4o (OpenAI)",
        "model_id": "gpt-4o-2024-11-20",
        "temperature": 0.0,
        "max_tokens": 4096,
    },
    "gemini": {
        "name": "Gemini 2.0 Flash (Google)",
        "model_id": "gemini-2.0-flash",
        "temperature": 0.0,
        "max_tokens": 4096,
    },
}

# ── API Keys (loaded from environment) ───────────────────────────────────────
def get_api_key(provider: str) -> str:
    """Return the API key for a provider, or raise with a helpful message."""
    env_map = {
        "anthropic": "ANTHROPIC_API_KEY",
        "openai": "OPENAI_API_KEY",
        "gemini": "GOOGLE_API_KEY",
    }
    var = env_map[provider]
    key = os.environ.get(var, "")
    if not key or key.startswith("your-"):
        raise RuntimeError(
            f"Set {var} in your .env file and run: source source_env.sh"
        )
    return key

# ── Retry / Rate-limit Settings ─────────────────────────────────────────────
MAX_RETRIES = 3
RETRY_BACKOFF_BASE = 2          # seconds; exponential: 2, 4, 8 …
REQUEST_TIMEOUT = 120           # seconds per API call

# ── Annotation Settings ─────────────────────────────────────────────────────
# Maximum number of 6-hour bins to include in a single prompt.
# Set to None to include all bins for a visit (full context).
MAX_BINS_PER_PROMPT: Optional[int] = None
