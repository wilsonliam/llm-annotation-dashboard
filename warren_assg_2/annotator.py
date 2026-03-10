"""
Annotation orchestrator.

Key design: every individual prediction (one visit × one model) is saved
to disk immediately as a single-line JSON in a .jsonl file.  This means:
  • If the process crashes or you hit a billing limit, all completed
    predictions are preserved.
  • On re-run, already-completed (stayId, provider) pairs are skipped
    automatically (resume from checkpoint).
"""

from __future__ import annotations

import json
import logging
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from tqdm import tqdm

import config
from llm_clients.base import BaseAnnotator

log = logging.getLogger(__name__)


# ── Per-prediction persistence ──────────────────────────────────────────────

def _predictions_path(provider: str) -> Path:
    return config.RESULTS_DIR / f"{provider}_predictions.jsonl"


def load_completed(provider: str) -> set[int]:
    """Return the set of stayIds already annotated by this provider."""
    path = _predictions_path(provider)
    done: set[int] = set()
    if path.exists():
        with open(path, "r") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    rec = json.loads(line)
                    done.add(rec["stayId"])
                except (json.JSONDecodeError, KeyError):
                    continue
    return done


def save_prediction(provider: str, record: dict[str, Any]) -> None:
    """Append a single prediction record to the provider's JSONL file."""
    path = _predictions_path(provider)
    with open(path, "a") as f:
        f.write(json.dumps(record, default=str) + "\n")


def save_error(provider: str, stay_id: int, error: str) -> None:
    """Log an unrecoverable error for a (provider, stayId) pair."""
    path = config.RESULTS_DIR / f"{provider}_errors.jsonl"
    rec = {
        "stayId": stay_id,
        "provider": provider,
        "error": error,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    with open(path, "a") as f:
        f.write(json.dumps(rec, default=str) + "\n")


# ── Orchestrator ────────────────────────────────────────────────────────────

def run_annotations(
    visits: list[dict[str, Any]],
    annotators: list[BaseAnnotator],
) -> dict[str, Any]:
    """
    Run every annotator over every visit.  Returns a summary dict.
    """
    run_start = datetime.now(timezone.utc)
    summary: dict[str, Any] = {
        "started": run_start.isoformat(),
        "visit_count": len(visits),
        "models": {},
    }

    for ann in annotators:
        provider = ann.provider
        done = load_completed(provider)
        to_do = [v for v in visits if v["stayId"] not in done]
        skipped = len(visits) - len(to_do)

        if skipped:
            log.info(
                "%s: resuming — %d already done, %d remaining",
                provider, skipped, len(to_do),
            )

        desc = f"{ann.model_name}"
        for visit in tqdm(to_do, desc=desc, unit="visit"):
            stay_id = visit["stayId"]
            t0 = time.time()
            try:
                annotation = ann.annotate(visit)
                elapsed = time.time() - t0

                record = {
                    "stayId": stay_id,
                    "provider": provider,
                    "model_id": ann.model_id,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "elapsed_seconds": round(elapsed, 2),
                    "annotation": annotation,
                }
                save_prediction(provider, record)

            except Exception as exc:
                elapsed = time.time() - t0
                log.error(
                    "%s stayId=%d failed after %.1fs: %s",
                    provider, stay_id, elapsed, exc,
                )
                save_error(provider, stay_id, str(exc))

        summary["models"][provider] = ann.usage_summary()

    summary["finished"] = datetime.now(timezone.utc).isoformat()

    # Write run metadata
    meta_path = config.RESULTS_DIR / "run_metadata.json"
    with open(meta_path, "w") as f:
        json.dump(summary, f, indent=2, default=str)

    return summary
