"""
Visualization helpers for annotation results.

Usage:
    python -m analysis.visualize
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd

# matplotlib is optional — skip gracefully if not installed
try:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    HAS_MPL = True
except ImportError:
    HAS_MPL = False

from analysis.compare import load_predictions, build_label_table, pairwise_kappa


def plot_kappa_heatmap(kdf: pd.DataFrame, out: Path) -> None:
    if not HAS_MPL:
        print("matplotlib not installed — skipping heatmap")
        return

    providers = sorted(set(kdf["model_a"]) | set(kdf["model_b"]))
    n = len(providers)
    matrix = pd.DataFrame(1.0, index=providers, columns=providers)
    for _, row in kdf.iterrows():
        matrix.loc[row["model_a"], row["model_b"]] = row["cohens_kappa"]
        matrix.loc[row["model_b"], row["model_a"]] = row["cohens_kappa"]

    fig, ax = plt.subplots(figsize=(6, 5))
    im = ax.imshow(matrix.values, cmap="RdYlGn", vmin=-1, vmax=1)
    ax.set_xticks(range(n))
    ax.set_yticks(range(n))
    ax.set_xticklabels(providers, rotation=45, ha="right")
    ax.set_yticklabels(providers)
    for i in range(n):
        for j in range(n):
            ax.text(j, i, f"{matrix.values[i, j]:.2f}", ha="center", va="center")
    fig.colorbar(im, label="Cohen's κ")
    ax.set_title("Pairwise Inter-Annotator Agreement")
    fig.tight_layout()
    fig.savefig(out, dpi=150)
    print(f"Saved heatmap → {out}")
    plt.close(fig)


def plot_timeline(
    preds: dict[str, dict[int, dict]], stay_id: int, out: Path
) -> None:
    """Plot discharge-readiness over time for a single stay, all models."""
    if not HAS_MPL:
        print("matplotlib not installed — skipping timeline")
        return

    fig, ax = plt.subplots(figsize=(12, 3))
    for provider, visits in preds.items():
        ann = visits.get(stay_id)
        if not ann:
            continue
        bins = ann.get("bins", [])
        xs = [b.get("binIndex", i) for i, b in enumerate(bins)]
        ys = [1 if b.get("dischargeReady") else 0 for b in bins]
        ax.step(xs, ys, where="mid", label=provider, linewidth=2, alpha=0.8)

    ax.set_yticks([0, 1])
    ax.set_yticklabels(["Not Ready", "Ready"])
    ax.set_xlabel("Bin Index (6-hour windows)")
    ax.set_title(f"Discharge Readiness — stayId {stay_id}")
    ax.legend()
    fig.tight_layout()
    fig.savefig(out, dpi=150)
    print(f"Saved timeline → {out}")
    plt.close(fig)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--results-dir", default="results")
    args = parser.parse_args()

    results_dir = Path(args.results_dir)
    preds = load_predictions(results_dir)
    if not preds:
        print("No predictions found.")
        return

    df = build_label_table(preds)
    kdf = pairwise_kappa(df)

    # Heatmap
    if len(kdf):
        plot_kappa_heatmap(kdf, results_dir / "kappa_heatmap.png")

    # Timeline for first 3 stays that have data from all models
    all_providers = set(preds.keys())
    common_stays = None
    for p in all_providers:
        s = set(preds[p].keys())
        common_stays = s if common_stays is None else common_stays & s
    if common_stays:
        for stay_id in sorted(common_stays)[:3]:
            plot_timeline(preds, stay_id, results_dir / f"timeline_{stay_id}.png")

    print("Done.")


if __name__ == "__main__":
    main()
