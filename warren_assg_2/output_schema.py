"""
Defines and validates the expected annotation output from LLMs.
"""

from __future__ import annotations

import json
import re
from typing import Any


# ── Schema spec (simple, no pydantic dependency) ────────────────────────────

def validate_annotation(obj: dict[str, Any], expected_bins: int) -> list[str]:
    """
    Return a list of error strings.  Empty list == valid.
    """
    errors: list[str] = []

    if "stayId" not in obj:
        errors.append("Missing 'stayId'")

    bins = obj.get("bins")
    if not isinstance(bins, list):
        errors.append("'bins' must be a list")
        return errors

    if len(bins) != expected_bins:
        errors.append(
            f"Expected {expected_bins} bins, got {len(bins)}"
        )

    for i, b in enumerate(bins):
        prefix = f"bins[{i}]"
        if "dischargeReady" not in b:
            errors.append(f"{prefix}: missing 'dischargeReady'")
        elif not isinstance(b["dischargeReady"], bool):
            errors.append(f"{prefix}: 'dischargeReady' must be bool")

        conf = b.get("confidence")
        if conf is None:
            errors.append(f"{prefix}: missing 'confidence'")
        elif not isinstance(conf, (int, float)) or not (0.0 <= conf <= 1.0):
            errors.append(f"{prefix}: 'confidence' must be float 0–1")

        if "reasoning" not in b:
            errors.append(f"{prefix}: missing 'reasoning'")

    if "overallAssessment" not in obj:
        errors.append("Missing 'overallAssessment'")

    return errors


def extract_json(text: str) -> dict[str, Any]:
    """
    Best-effort extraction of a JSON object from LLM text output.
    Handles markdown code fences, leading/trailing prose, etc.
    """
    # Try stripping markdown fences first
    fenced = re.search(r"```(?:json)?\s*\n?(.*?)```", text, re.DOTALL)
    candidate = fenced.group(1).strip() if fenced else text.strip()

    # Find the outermost { … }
    start = candidate.find("{")
    if start == -1:
        raise ValueError("No JSON object found in response")

    depth = 0
    end = start
    for i in range(start, len(candidate)):
        if candidate[i] == "{":
            depth += 1
        elif candidate[i] == "}":
            depth -= 1
            if depth == 0:
                end = i + 1
                break

    return json.loads(candidate[start:end])
