"""
Load and validate MIMIC-IV visit data from the exported JSON.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import config


def load_visits(path: str | Path | None = None) -> list[dict[str, Any]]:
    """Load visits from the JSON export and return the list of visit dicts."""
    path = Path(path) if path else config.DATA_PATH
    with open(path, "r") as f:
        data = json.load(f)

    visits = data.get("visits", [])
    if not visits:
        raise ValueError(f"No visits found in {path}")

    # Light validation
    for i, v in enumerate(visits):
        for key in ("stayId", "subjectId", "hadmId", "bins"):
            if key not in v:
                raise KeyError(f"Visit index {i} missing required key '{key}'")
        if not isinstance(v["bins"], list) or len(v["bins"]) == 0:
            raise ValueError(f"Visit {v.get('stayId', i)} has no bins")

    return visits


def visit_summary(visit: dict[str, Any]) -> str:
    """One-line summary useful for logging."""
    n_bins = len(visit.get("bins", []))
    return (
        f"stayId={visit['stayId']}  unit={visit.get('firstCareunit','?')}  "
        f"bins={n_bins}  in={visit.get('intime','?')}  out={visit.get('outtime','?')}"
    )
