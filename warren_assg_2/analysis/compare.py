"""
Compare annotations across models — inter-annotator agreement.

Usage:
    python -m analysis.compare
    python -m analysis.compare --results-dir results/
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from itertools import combinations
from pathlib import Path

import pandas as pd


def load_predictions(results_dir: Path) -> dict[str, dict[int, dict]]:
    """
    Returns {provider: {stayId: annotation_dict, …}, …}
    """
    preds: dict[str, dict[int, dict]] = {}
    for jsonl in sorted(results_dir.glob("*_predictions.jsonl")):
        provider = jsonl.stem.replace("_predictions", "")
        preds[provider] = {}
        with open(jsonl) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                rec = json.loads(line)
                preds[provider][rec["stayId"]] = rec["annotation"]
    return preds


def build_label_table(preds: dict[str, dict[int, dict]]) -> pd.DataFrame:
    """
    Build a long-form DataFrame:
        stayId | binIndex | provider | dischargeReady | confidence
    """
    rows = []
    for provider, visits in preds.items():
        for stay_id, ann in visits.items():
            for b in ann.get("bins", []):
                rows.append(
                    {
                        "stayId": stay_id,
                        "binIndex": b.get("binIndex", -1),
                        "provider": provider,
                        "dischargeReady": b.get("dischargeReady"),
                        "confidence": b.get("confidence"),
                    }
                )
    return pd.DataFrame(rows)


def cohens_kappa(labels_a: list[bool], labels_b: list[bool]) -> float:
    """Compute Cohen's kappa for two binary raters."""
    assert len(labels_a) == len(labels_b)
    n = len(labels_a)
    if n == 0:
        return float("nan")

    agree = sum(a == b for a, b in zip(labels_a, labels_b))
    p_o = agree / n

    # Expected agreement
    a_pos = sum(labels_a) / n
    b_pos = sum(labels_b) / n
    p_e = a_pos * b_pos + (1 - a_pos) * (1 - b_pos)

    if p_e == 1.0:
        return 1.0
    return (p_o - p_e) / (1 - p_e)


def pairwise_kappa(df: pd.DataFrame) -> pd.DataFrame:
    """Compute pairwise Cohen's kappa for all provider pairs."""
    providers = sorted(df["provider"].unique())
    records = []

    for a, b in combinations(providers, 2):
        da = df[df["provider"] == a].set_index(["stayId", "binIndex"])
        db = df[df["provider"] == b].set_index(["stayId", "binIndex"])
        common = da.index.intersection(db.index)
        if len(common) == 0:
            continue
        la = [da.loc[idx, "dischargeReady"] for idx in common]
        lb = [db.loc[idx, "dischargeReady"] for idx in common]
        k = cohens_kappa(la, lb)
        pct = sum(x == y for x, y in zip(la, lb)) / len(la)
        records.append(
            {"model_a": a, "model_b": b, "n_bins": len(common),
             "pct_agree": round(pct, 4), "cohens_kappa": round(k, 4)}
        )

    return pd.DataFrame(records)


def summary_stats(df: pd.DataFrame) -> pd.DataFrame:
    """Per-provider summary: % discharge ready, mean confidence, count."""
    return (
        df.groupby("provider")
        .agg(
            n_bins=("dischargeReady", "count"),
            pct_ready=("dischargeReady", "mean"),
            mean_confidence=("confidence", "mean"),
        )
        .round(4)
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--results-dir", default="results")
    args = parser.parse_args()

    results_dir = Path(args.results_dir)
    preds = load_predictions(results_dir)
    if not preds:
        print("No prediction files found.")
        return

    print(f"Loaded predictions for: {list(preds.keys())}")
    df = build_label_table(preds)
    print(f"Total rows: {len(df)}\n")

    print("═══ Per-Model Summary ═══")
    print(summary_stats(df).to_string())

    print("\n═══ Pairwise Agreement ═══")
    kdf = pairwise_kappa(df)
    if len(kdf):
        print(kdf.to_string(index=False))
    else:
        print("Need at least 2 models with overlapping predictions.")

    # Save
    out = results_dir / "comparison.csv"
    kdf.to_csv(out, index=False)
    print(f"\nSaved to {out}")


if __name__ == "__main__":
    main()
