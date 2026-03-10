#!/usr/bin/env python3
"""
Generate realistic mock annotation data for all 3 models.

This lets you develop and test the dashboard / conformal analysis
without spending any API money.

Usage:
    python generate_mock_data.py                  # default seed=42
    python generate_mock_data.py --seed 123
    python generate_mock_data.py --max-visits 20  # quick test
"""

from __future__ import annotations

import argparse
import json
import random
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import config
import data_loader


# ── Model-specific personality profiles ─────────────────────────────────────

PROFILES = {
    "anthropic": {
        "model_id": config.MODELS["anthropic"]["model_id"],
        "name": "Claude (Anthropic)",
        # Conservative: lower ready-rate, high confidence when saying not ready
        "base_ready_rate": 0.25,
        "confidence_mean": 0.78,
        "confidence_std": 0.10,
        "latency_mean": 4.5,
        "latency_std": 1.2,
        "tokens_per_bin_input": 180,
        "tokens_per_bin_output": 85,
        "base_overhead_input": 1500,   # system prompt tokens
        "base_overhead_output": 100,   # overallAssessment tokens
    },
    "openai": {
        "model_id": config.MODELS["openai"]["model_id"],
        "name": "GPT-4o (OpenAI)",
        # Moderate: balanced, higher confidence overall
        "base_ready_rate": 0.32,
        "confidence_mean": 0.82,
        "confidence_std": 0.09,
        "latency_mean": 3.5,
        "latency_std": 1.0,
        "tokens_per_bin_input": 180,
        "tokens_per_bin_output": 90,
        "base_overhead_input": 1500,
        "base_overhead_output": 120,
    },
    "gemini": {
        "model_id": config.MODELS["gemini"]["model_id"],
        "name": "Gemini 2.0 Flash (Google)",
        # Aggressive: higher ready-rate, lower confidence
        "base_ready_rate": 0.38,
        "confidence_mean": 0.74,
        "confidence_std": 0.12,
        "latency_mean": 2.0,
        "latency_std": 0.7,
        "tokens_per_bin_input": 180,
        "tokens_per_bin_output": 80,
        "base_overhead_input": 1500,
        "base_overhead_output": 90,
    },
}

REASONING_NOT_READY = [
    "Patient remains on active supports; vitals not yet trending toward stability.",
    "Elevated lactate and ongoing vasopressor support preclude discharge.",
    "Invasive ventilation in place; respiratory parameters not meeting extubation criteria.",
    "MAP below target range and requiring pressor support.",
    "Ongoing CRRT for renal support; not yet ready for step-down.",
    "Sedation still active; neurological status cannot be adequately assessed.",
    "Recent lab values show worsening acidosis; trajectory not favorable.",
    "SpO2 marginal on current oxygen support; stepping down would be premature.",
    "Hemodynamic instability with HR and MAP fluctuations.",
    "Glucose poorly controlled requiring insulin drip; needs stabilization.",
]

REASONING_READY = [
    "Vitals stable, no active high-acuity supports; meets discharge criteria.",
    "Patient weaned off vasopressors; MAP stable on room air.",
    "Extubated and maintaining adequate SpO2 on low-flow oxygen.",
    "Labs trending toward normal; no acute interventions required.",
    "Stable hemodynamics for >12 hours; suitable for step-down unit.",
    "All supports discontinued; patient tolerating oral medications.",
    "Respiratory status stable after HFNC discontinuation.",
    "Neurological exam improving; no further ICU-level monitoring needed.",
]

OVERALL_TEMPLATES = [
    "Patient admitted to {unit} with initial acuity requiring {supports}. "
    "Clinical trajectory showed {trajectory} over {n_bins} observation windows. "
    "Discharge readiness first identified around bin {first_ready}.",
    "{unit} stay of {n_bins} observation periods. {trajectory_desc} "
    "The patient {ready_summary}.",
]


def _clamp(val: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, val))


def _has_high_acuity(bin_data: dict) -> bool:
    """Check if a bin has high-acuity supports that preclude discharge."""
    supports = bin_data.get("supports", {})
    high_acuity = {"ventInvasive", "vasoactive", "crrt", "sedation"}
    return bool(high_acuity & set(supports.keys()))


def _supports_dropping(bins: list[dict], idx: int, window: int = 3) -> bool:
    """Check if supports are decreasing over recent bins."""
    if idx < window:
        return False
    recent = [len(b.get("supports", {})) for b in bins[max(0, idx - window):idx + 1]]
    return recent[-1] < recent[0]


def generate_visit_annotation(
    visit: dict[str, Any],
    provider: str,
    profile: dict[str, Any],
    rng: random.Random,
) -> dict[str, Any]:
    """Generate a single mock annotation for one visit × one model."""
    bins = visit["bins"]
    n_bins = len(bins)
    stay_id = visit["stayId"]
    unit = visit.get("firstCareunit", "ICU")

    annotated_bins = []
    first_ready_bin = None

    for i, b in enumerate(bins):
        # Position in stay: 0.0 (admission) → 1.0 (discharge)
        progress = i / max(n_bins - 1, 1)

        # Base probability of discharge readiness increases over time
        # Sigmoid centered around 70% through the stay
        logit = 8 * (progress - 0.70) + rng.gauss(0, 0.5)
        time_prob = 1 / (1 + math.exp(-logit))

        # Penalty for high-acuity supports
        if _has_high_acuity(b):
            time_prob *= 0.05
        elif b.get("supports"):
            # Some supports present but not high-acuity (HFNC, insulin)
            time_prob *= 0.4

        # Boost if supports are dropping
        if _supports_dropping(bins, i):
            time_prob *= 1.3

        # Mix with model personality
        final_prob = (time_prob * 0.7) + (profile["base_ready_rate"] * 0.3)
        final_prob = _clamp(final_prob, 0.02, 0.98)

        discharge_ready = rng.random() < final_prob

        # Confidence: higher when the model is more "sure"
        if discharge_ready:
            raw_conf = rng.gauss(profile["confidence_mean"], profile["confidence_std"])
            # Less confident for early discharge calls
            if progress < 0.5:
                raw_conf -= 0.15
        else:
            raw_conf = rng.gauss(
                profile["confidence_mean"] + 0.05, profile["confidence_std"]
            )

        confidence = round(_clamp(raw_conf, 0.30, 0.99), 2)

        if discharge_ready:
            reasoning = rng.choice(REASONING_READY)
            if first_ready_bin is None:
                first_ready_bin = i
        else:
            reasoning = rng.choice(REASONING_NOT_READY)

        annotated_bins.append({
            "binIndex": i,
            "start": b["start"],
            "end": b["end"],
            "dischargeReady": discharge_ready,
            "confidence": confidence,
            "reasoning": reasoning,
        })

    # Overall assessment
    n_ready = sum(1 for ab in annotated_bins if ab["dischargeReady"])
    active_supports = set()
    for b in bins[:3]:
        active_supports.update(b.get("supports", {}).keys())

    if n_ready > n_bins * 0.5:
        trajectory = "gradual improvement"
        trajectory_desc = "Clinical trajectory showed steady improvement."
        ready_summary = "was identified as discharge-ready for the majority of the stay."
    elif n_ready > 0:
        trajectory = "slow stabilization"
        trajectory_desc = "Patient required extended stabilization before meeting discharge criteria."
        ready_summary = f"achieved discharge readiness around observation window {first_ready_bin}."
    else:
        trajectory = "persistent critical illness"
        trajectory_desc = "Patient remained critically ill throughout the observation period."
        ready_summary = "did not meet discharge criteria during the observed period."

    overall = rng.choice(OVERALL_TEMPLATES).format(
        unit=unit,
        supports=", ".join(active_supports) if active_supports else "monitoring",
        trajectory=trajectory,
        trajectory_desc=trajectory_desc,
        n_bins=n_bins,
        first_ready=first_ready_bin if first_ready_bin is not None else "N/A",
        ready_summary=ready_summary,
    )

    return {
        "stayId": stay_id,
        "bins": annotated_bins,
        "overallAssessment": overall,
    }


def generate_mock_predictions(
    visits: list[dict[str, Any]],
    seed: int = 42,
) -> dict[str, dict]:
    """
    Generate mock predictions for all 3 models.
    Returns {provider: {usage_summary_dict}}.
    """
    rng = random.Random(seed)

    summaries = {}

    for provider, profile in PROFILES.items():
        path = config.RESULTS_DIR / f"{provider}_predictions.jsonl"

        total_input = 0
        total_output = 0

        with open(path, "w") as f:
            for visit in visits:
                annotation = generate_visit_annotation(visit, provider, profile, rng)
                n_bins = len(visit["bins"])

                input_tokens = profile["base_overhead_input"] + n_bins * profile["tokens_per_bin_input"]
                output_tokens = profile["base_overhead_output"] + n_bins * profile["tokens_per_bin_output"]
                total_input += input_tokens
                total_output += output_tokens

                latency = max(0.5, rng.gauss(profile["latency_mean"], profile["latency_std"]))

                record = {
                    "stayId": visit["stayId"],
                    "provider": provider,
                    "model_id": profile["model_id"],
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "elapsed_seconds": round(latency, 2),
                    "input_tokens": input_tokens,
                    "output_tokens": output_tokens,
                    "annotation": annotation,
                }
                f.write(json.dumps(record, default=str) + "\n")

        summaries[provider] = {
            "provider": provider,
            "model_id": profile["model_id"],
            "total_calls": len(visits),
            "total_errors": 0,
            "total_input_tokens": total_input,
            "total_output_tokens": total_output,
        }
        print(f"  ✓ {provider}: {len(visits)} visits → {path.name}")

    # Write run metadata
    meta = {
        "started": datetime.now(timezone.utc).isoformat(),
        "finished": datetime.now(timezone.utc).isoformat(),
        "visit_count": len(visits),
        "mock_data": True,
        "seed": seed,
        "models": summaries,
    }
    meta_path = config.RESULTS_DIR / "run_metadata.json"
    with open(meta_path, "w") as f:
        json.dump(meta, f, indent=2, default=str)
    print(f"  ✓ metadata → {meta_path.name}")

    return summaries


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate mock annotation data")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--max-visits", type=int, default=None)
    parser.add_argument("--data", type=str, default=str(config.DATA_PATH))
    args = parser.parse_args()

    visits = data_loader.load_visits(args.data)
    if args.max_visits:
        visits = visits[:args.max_visits]

    print(f"Generating mock data for {len(visits)} visits × 3 models (seed={args.seed})…")
    generate_mock_predictions(visits, seed=args.seed)
    print("Done.")


if __name__ == "__main__":
    main()
