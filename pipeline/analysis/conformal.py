#!/usr/bin/env python3
"""
Conformal Prediction Analysis for LLM ICU Discharge Annotations.

Implements split conformal prediction using each LLM's confidence score
as the basis for nonconformity scores, with majority vote as surrogate
ground truth.

Usage:
    python -m analysis.conformal
    python -m analysis.conformal --results-dir results/ --alpha 0.10 --seed 42
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Any, Optional

import numpy as np
import pandas as pd

from analysis.compare import load_predictions, build_label_table

# ═══════════════════════════════════════════════════════════════════════════
#  Nonconformity Score
# ═══════════════════════════════════════════════════════════════════════════

def nonconformity_score(confidence: float, predicted: bool, true_label: bool) -> float:
    """
    Nonconformity score = 1 - P(y_true | x).

    If the model's prediction matches the true label, the effective
    probability for the true label is the stated confidence.
    Otherwise, it's 1 - confidence.
    """
    if predicted == true_label:
        p_true = confidence
    else:
        p_true = 1.0 - confidence
    return 1.0 - p_true


def compute_conformal_quantile(
    scores: np.ndarray, alpha: float
) -> float:
    """
    Compute the conformal quantile q̂ such that coverage ≥ 1 - α.

    q̂ = ceil((n+1)(1-α)) / n  -th smallest score
    (finite-sample correction from Vovk et al.)
    """
    n = len(scores)
    level = math.ceil((n + 1) * (1 - alpha)) / n
    level = min(level, 1.0)  # clamp
    return float(np.quantile(scores, level))


# ═══════════════════════════════════════════════════════════════════════════
#  Prediction Sets
# ═══════════════════════════════════════════════════════════════════════════

def build_prediction_set(
    confidence: float,
    predicted: bool,
    q_hat: float,
) -> set[bool]:
    """
    Build the conformal prediction set for a single data point.

    Include label y in the set if the nonconformity score for that
    label ≤ q̂.
    """
    pred_set: set[bool] = set()
    for candidate in [True, False]:
        score = nonconformity_score(confidence, predicted, candidate)
        if score <= q_hat:
            pred_set.add(candidate)
    return pred_set


# ═══════════════════════════════════════════════════════════════════════════
#  Analysis Pipeline
# ═══════════════════════════════════════════════════════════════════════════

def add_majority_vote(label_df: pd.DataFrame) -> pd.DataFrame:
    """Add majority-vote surrogate ground truth to the label DataFrame."""
    vote = (
        label_df.groupby(["stayId", "binIndex"])["dischargeReady"]
        .agg(lambda x: x.mode().iloc[0] if len(x.mode()) > 0 else False)
        .rename("majority_label")
        .reset_index()
    )
    return label_df.merge(vote, on=["stayId", "binIndex"], how="left")


def split_cal_test(
    df: pd.DataFrame, cal_frac: float = 0.7, seed: int = 42
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    Split by stayId (not by row) to avoid information leak across bins
    of the same visit.
    """
    rng = np.random.default_rng(seed)
    stays = df["stayId"].unique()
    rng.shuffle(stays)
    n_cal = int(len(stays) * cal_frac)
    cal_stays = set(stays[:n_cal])
    cal_df = df[df["stayId"].isin(cal_stays)].copy()
    test_df = df[~df["stayId"].isin(cal_stays)].copy()
    return cal_df, test_df


def run_conformal_for_provider(
    prov_df: pd.DataFrame,
    alpha: float,
    cal_frac: float = 0.7,
    seed: int = 42,
) -> dict[str, Any]:
    """Run conformal prediction for a single provider."""

    cal_df, test_df = split_cal_test(prov_df, cal_frac=cal_frac, seed=seed)

    # Calibration: compute nonconformity scores
    cal_scores = np.array([
        nonconformity_score(row["confidence"], row["dischargeReady"], row["majority_label"])
        for _, row in cal_df.iterrows()
    ])

    q_hat = compute_conformal_quantile(cal_scores, alpha)

    # Test: build prediction sets
    coverages = []
    set_sizes = []
    singletons = 0
    empties = 0

    for _, row in test_df.iterrows():
        pred_set = build_prediction_set(row["confidence"], row["dischargeReady"], q_hat)
        true_label = row["majority_label"]
        coverages.append(true_label in pred_set)
        set_sizes.append(len(pred_set))
        if len(pred_set) == 1:
            singletons += 1
        elif len(pred_set) == 0:
            empties += 1

    n_test = len(test_df)
    coverage = sum(coverages) / n_test if n_test else 0.0
    avg_set_size = sum(set_sizes) / n_test if n_test else 0.0

    return {
        "n_cal": len(cal_df),
        "n_test": n_test,
        "alpha": alpha,
        "target_coverage": 1 - alpha,
        "q_hat": round(q_hat, 4),
        "empirical_coverage": round(coverage, 4),
        "avg_set_size": round(avg_set_size, 4),
        "singleton_frac": round(singletons / n_test, 4) if n_test else 0,
        "empty_frac": round(empties / n_test, 4) if n_test else 0,
        "cal_score_mean": round(float(cal_scores.mean()), 4),
        "cal_score_std": round(float(cal_scores.std()), 4),
    }


def run_alpha_sweep(
    prov_df: pd.DataFrame,
    alphas: list[float],
    cal_frac: float = 0.7,
    seed: int = 42,
) -> list[dict[str, Any]]:
    """Run conformal across multiple α values."""
    results = []
    for alpha in alphas:
        res = run_conformal_for_provider(prov_df, alpha, cal_frac, seed)
        results.append(res)
    return results


# ═══════════════════════════════════════════════════════════════════════════
#  Subgroup Analysis (by care unit or support acuity)
# ═══════════════════════════════════════════════════════════════════════════

def adaptive_conformal_by_subgroup(
    prov_df: pd.DataFrame,
    alpha: float,
    subgroup_col: str = "firstCareunit",
    cal_frac: float = 0.7,
    seed: int = 42,
) -> dict[str, dict[str, Any]]:
    """
    Run conformal separately per subgroup (e.g., care unit).
    Returns a dict mapping subgroup value -> conformal results.
    """
    if subgroup_col not in prov_df.columns:
        return {}

    results = {}
    for group_val, gdf in prov_df.groupby(subgroup_col):
        if len(gdf) < 10:  # skip tiny groups
            continue
        res = run_conformal_for_provider(gdf, alpha, cal_frac, seed)
        res["subgroup"] = str(group_val)
        results[str(group_val)] = res
    return results


# ═══════════════════════════════════════════════════════════════════════════
#  Reporting
# ═══════════════════════════════════════════════════════════════════════════

def format_report(
    all_results: dict[str, dict[str, Any]],
    sweep_results: dict[str, list[dict[str, Any]]],
) -> str:
    """Format a text report of conformal prediction results."""
    lines = [
        "═" * 70,
        " Conformal Prediction Analysis — ICU Discharge Readiness",
        "═" * 70,
        "",
    ]

    for prov, res in sorted(all_results.items()):
        lines.append(f"▸ {prov.upper()}")
        lines.append(f"  Calibration set : {res['n_cal']} bins")
        lines.append(f"  Test set        : {res['n_test']} bins")
        lines.append(f"  α               : {res['alpha']}")
        lines.append(f"  Target coverage : {res['target_coverage']:.0%}")
        lines.append(f"  q̂ (threshold)   : {res['q_hat']}")
        lines.append(f"  Empirical cov.  : {res['empirical_coverage']:.1%}")
        gap = res['empirical_coverage'] - res['target_coverage']
        lines.append(f"  Coverage gap    : {gap:+.1%}")
        lines.append(f"  Avg set size    : {res['avg_set_size']:.3f}")
        lines.append(f"  Singleton frac  : {res['singleton_frac']:.1%}")
        lines.append(f"  Empty set frac  : {res['empty_frac']:.1%}")
        lines.append(f"  Cal score μ±σ   : {res['cal_score_mean']:.3f} ± {res['cal_score_std']:.3f}")
        lines.append("")

    # Alpha sweep table
    if sweep_results:
        lines.append("─" * 70)
        lines.append(" α-sweep: Coverage & Efficiency across significance levels")
        lines.append("─" * 70)
        header = f"{'Provider':<12} {'α':>5} {'Target':>8} {'Coverage':>9} {'Gap':>7} {'Set Size':>9} {'Singleton':>10}"
        lines.append(header)
        lines.append("-" * len(header))
        for prov, sweeps in sorted(sweep_results.items()):
            for s in sweeps:
                gap = s['empirical_coverage'] - s['target_coverage']
                lines.append(
                    f"{prov:<12} {s['alpha']:>5.2f} "
                    f"{s['target_coverage']:>7.0%} "
                    f"{s['empirical_coverage']:>8.1%} "
                    f"{gap:>+6.1%} "
                    f"{s['avg_set_size']:>8.3f} "
                    f"{s['singleton_frac']:>9.1%}"
                )
            lines.append("")

    lines.append("═" * 70)
    return "\n".join(lines)


# ═══════════════════════════════════════════════════════════════════════════
#  CLI
# ═══════════════════════════════════════════════════════════════════════════

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Conformal prediction analysis on LLM annotations"
    )
    parser.add_argument("--results-dir", default="results")
    parser.add_argument("--alpha", type=float, default=0.10,
                        help="Significance level (default 0.10)")
    parser.add_argument("--cal-frac", type=float, default=0.70,
                        help="Fraction of visits for calibration (default 0.70)")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--sweep", action="store_true",
                        help="Run α-sweep over {0.01, 0.05, 0.10, 0.15, 0.20}")
    parser.add_argument("--subgroup-col", default=None,
                        help="Column for adaptive conformal subgroup analysis")
    parser.add_argument("--output", default=None,
                        help="Output JSON path (default: results/conformal_results.json)")
    args = parser.parse_args()

    results_dir = Path(args.results_dir)
    output_path = Path(args.output) if args.output else results_dir / "conformal_results.json"

    # Load data
    preds = load_predictions(results_dir)
    if not preds:
        print("No prediction files found in", results_dir)
        return

    label_df = build_label_table(preds)
    label_df = add_majority_vote(label_df)

    print(f"Loaded {len(label_df)} bin annotations across {list(preds.keys())}")
    providers = sorted(label_df["provider"].unique())

    # Main analysis at given α
    all_results: dict[str, dict[str, Any]] = {}
    for prov in providers:
        prov_df = label_df[label_df["provider"] == prov]
        all_results[prov] = run_conformal_for_provider(
            prov_df, args.alpha, args.cal_frac, args.seed
        )

    # Optional α-sweep
    sweep_results: dict[str, list[dict[str, Any]]] = {}
    if args.sweep:
        alphas = [0.01, 0.05, 0.10, 0.15, 0.20]
        for prov in providers:
            prov_df = label_df[label_df["provider"] == prov]
            sweep_results[prov] = run_alpha_sweep(
                prov_df, alphas, args.cal_frac, args.seed
            )

    # Optional subgroup analysis
    subgroup_results: dict[str, dict[str, dict[str, Any]]] = {}
    if args.subgroup_col:
        for prov in providers:
            prov_df = label_df[label_df["provider"] == prov]
            subgroup_results[prov] = adaptive_conformal_by_subgroup(
                prov_df, args.alpha, args.subgroup_col, args.cal_frac, args.seed
            )

    # Print report
    report = format_report(all_results, sweep_results)
    print("\n" + report)

    # Save JSON
    output = {
        "alpha": args.alpha,
        "cal_frac": args.cal_frac,
        "seed": args.seed,
        "per_model": all_results,
    }
    if sweep_results:
        output["alpha_sweep"] = sweep_results
    if subgroup_results:
        output["subgroup_analysis"] = subgroup_results

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\n✓ Results saved to {output_path}")


if __name__ == "__main__":
    main()
