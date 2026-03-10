"""
Semantic entropy analysis for LLM reasoning texts.

Computes two entropy metrics for each (stayId, binIndex) pair:
  1. Cosine Divergence: 1 - mean(pairwise cosine similarities)
  2. Clustering Entropy: Shannon entropy over cosine-similarity clusters (threshold 0.85)
"""

import argparse
import json
import math
import os
from pathlib import Path
from typing import Dict, List, Tuple, Any

import numpy as np


def load_jsonl(filepath: str) -> List[dict]:
    records = []
    with open(filepath, "r") as f:
        for line in f:
            line = line.strip()
            if line:
                records.append(json.loads(line))
    return records


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))


def compute_cluster_entropy(embeddings: List[np.ndarray], threshold: float = 0.85) -> Tuple[float, int]:
    """
    Cluster embeddings using cosine similarity threshold.
    Returns (normalized_shannon_entropy, n_clusters).
    """
    n = len(embeddings)
    if n == 0:
        return 0.0, 0

    # Simple greedy clustering: assign each to first cluster whose centroid sim > threshold
    clusters: List[List[int]] = []
    cluster_embeddings: List[np.ndarray] = []

    for i in range(n):
        assigned = False
        for c_idx, centroid in enumerate(cluster_embeddings):
            sim = cosine_similarity(embeddings[i], centroid)
            if sim > threshold:
                clusters[c_idx].append(i)
                # Update centroid as mean
                cluster_embeddings[c_idx] = np.mean(
                    [embeddings[j] for j in clusters[c_idx]], axis=0
                )
                assigned = True
                break
        if not assigned:
            clusters.append([i])
            cluster_embeddings.append(embeddings[i].copy())

    n_clusters = len(clusters)
    if n_clusters <= 1:
        return 0.0, n_clusters

    # Shannon entropy
    H = 0.0
    for cluster in clusters:
        p_k = len(cluster) / n
        if p_k > 0:
            H -= p_k * math.log(p_k)

    # Normalize by log(3) since max 3 providers
    H_normalized = H / math.log(n) if n > 1 else 0.0
    return H_normalized, n_clusters


def compute_label_agreement(labels: Dict[str, bool]) -> float:
    """Fraction of providers that agree with majority."""
    if not labels:
        return 0.0
    values = list(labels.values())
    majority = sum(values) > len(values) / 2
    agree = sum(1 for v in values if v == majority)
    return agree / len(values)


def get_majority_label(labels: Dict[str, bool]) -> bool:
    values = list(labels.values())
    return sum(values) > len(values) / 2


def classify_quadrant(label_agreement: float, cosine_entropy: float) -> str:
    if label_agreement >= 0.67 and cosine_entropy <= 0.3:
        return "robust_consensus"
    elif label_agreement >= 0.67 and cosine_entropy > 0.3:
        return "fragile_consensus"
    elif label_agreement < 0.67 and cosine_entropy <= 0.3:
        return "surprising_split"
    else:
        return "full_disagreement"


def main():
    parser = argparse.ArgumentParser(description="Semantic entropy analysis for LLM reasoning texts")
    parser.add_argument("--results-dir", default="results/", help="Directory with JSONL prediction files")
    args = parser.parse_args()

    results_dir = Path(args.results_dir)
    providers = ["anthropic", "openai", "gemini"]
    provider_files = {
        "anthropic": results_dir / "anthropic_predictions.jsonl",
        "openai": results_dir / "openai_predictions.jsonl",
        "gemini": results_dir / "gemini_predictions.jsonl",
    }

    print("Loading prediction files...")
    all_preds: Dict[str, List[dict]] = {}
    for provider, filepath in provider_files.items():
        print(f"  Loading {filepath}...")
        all_preds[provider] = load_jsonl(str(filepath))
        print(f"    Loaded {len(all_preds[provider])} records")

    # Build index: (stayId, binIndex) -> {provider: {reasoning, dischargeReady}}
    print("Building bin index...")
    bin_data: Dict[Tuple[int, int], Dict[str, Any]] = {}

    for provider in providers:
        for record in all_preds[provider]:
            stay_id = record["stayId"]
            for bin_entry in record["annotation"]["bins"]:
                bin_idx = bin_entry["binIndex"]
                key = (stay_id, bin_idx)
                if key not in bin_data:
                    bin_data[key] = {}
                bin_data[key][provider] = {
                    "reasoning": bin_entry.get("reasoning", ""),
                    "dischargeReady": bin_entry.get("dischargeReady", False),
                }

    # Only process bins where all 3 providers have data
    complete_bins = {k: v for k, v in bin_data.items() if len(v) == len(providers)}
    print(f"Total bins with all 3 providers: {len(complete_bins)}")

    # Collect all unique reasoning strings for batch embedding
    print("Collecting unique reasoning strings...")
    all_reasonings: List[str] = []
    reasoning_set = set()
    for key, pdata in complete_bins.items():
        for provider in providers:
            text = pdata[provider]["reasoning"]
            if text and text not in reasoning_set:
                all_reasonings.append(text)
                reasoning_set.add(text)

    print(f"Unique reasoning strings to embed: {len(all_reasonings)}")

    # Embed all unique strings
    print("Loading sentence-transformers model (all-MiniLM-L6-v2)...")
    try:
        from sentence_transformers import SentenceTransformer
        model = SentenceTransformer("all-MiniLM-L6-v2")
        print("Embedding reasoning strings...")
        embeddings_list = model.encode(all_reasonings, batch_size=64, show_progress_bar=True)
        embedding_map: Dict[str, np.ndarray] = {
            text: embeddings_list[i] for i, text in enumerate(all_reasonings)
        }
    except ImportError:
        print("sentence-transformers not available, using random embeddings for testing")
        embedding_map: Dict[str, np.ndarray] = {
            text: np.random.randn(384).astype(np.float32) for text in all_reasonings
        }

    print("Computing semantic entropy for each bin...")
    bins_output = []

    for (stay_id, bin_idx), pdata in sorted(complete_bins.items()):
        # Collect embeddings for the 3 providers
        embs = []
        reasonings = {}
        labels = {}
        for provider in providers:
            text = pdata[provider]["reasoning"]
            reasonings[provider] = text
            labels[provider] = pdata[provider]["dischargeReady"]
            if text in embedding_map:
                embs.append(embedding_map[text])
            else:
                # Fallback: zero vector
                embs.append(np.zeros(384, dtype=np.float32))

        # Method 1: Cosine Divergence
        pairs = [
            ("anthropic_openai", embs[0], embs[1]),
            ("anthropic_gemini", embs[0], embs[2]),
            ("openai_gemini", embs[1], embs[2]),
        ]
        pairwise_sims = {}
        sim_values = []
        for pair_name, ea, eb in pairs:
            sim = cosine_similarity(ea, eb)
            pairwise_sims[pair_name] = round(float(sim), 6)
            sim_values.append(sim)

        mean_sim = float(np.mean(sim_values))
        cosine_entropy = float(1.0 - mean_sim)
        cosine_entropy = max(0.0, min(1.0, cosine_entropy))  # clamp to [0,1]

        # Method 2: Clustering Entropy
        cluster_entropy, n_clusters = compute_cluster_entropy(embs, threshold=0.85)

        # Label agreement
        label_agreement = compute_label_agreement(labels)

        # Quadrant
        quadrant = classify_quadrant(label_agreement, cosine_entropy)

        bins_output.append({
            "stayId": stay_id,
            "binIndex": bin_idx,
            "cosine_entropy": round(cosine_entropy, 6),
            "cluster_entropy": round(float(cluster_entropy), 6),
            "pairwise_similarities": {k: round(v, 6) for k, v in pairwise_sims.items()},
            "n_clusters": n_clusters,
            "label_agreement": round(label_agreement, 6),
            "quadrant": quadrant,
            "reasoning": reasonings,
            "labels": labels,
        })

    print(f"Processed {len(bins_output)} bins")

    # Per-provider stats
    print("Computing per-provider stats...")
    per_provider: Dict[str, Dict[str, float]] = {}
    for provider in providers:
        agree_cosine = []
        disagree_cosine = []
        agree_cluster = []
        disagree_cluster = []

        for b in bins_output:
            majority = get_majority_label(b["labels"])
            provider_label = b["labels"].get(provider)
            if provider_label is None:
                continue
            agrees = provider_label == majority
            if agrees:
                agree_cosine.append(b["cosine_entropy"])
                agree_cluster.append(b["cluster_entropy"])
            else:
                disagree_cosine.append(b["cosine_entropy"])
                disagree_cluster.append(b["cluster_entropy"])

        per_provider[provider] = {
            "mean_cosine_entropy_agree": round(float(np.mean(agree_cosine)) if agree_cosine else 0.0, 6),
            "mean_cosine_entropy_disagree": round(float(np.mean(disagree_cosine)) if disagree_cosine else 0.0, 6),
            "mean_cluster_entropy_agree": round(float(np.mean(agree_cluster)) if agree_cluster else 0.0, 6),
            "mean_cluster_entropy_disagree": round(float(np.mean(disagree_cluster)) if disagree_cluster else 0.0, 6),
        }

    # Summary stats
    all_cosine = [b["cosine_entropy"] for b in bins_output]
    all_cluster = [b["cluster_entropy"] for b in bins_output]

    quadrant_counts = {
        "robust_consensus": 0,
        "fragile_consensus": 0,
        "surprising_split": 0,
        "full_disagreement": 0,
    }
    for b in bins_output:
        quadrant_counts[b["quadrant"]] += 1

    # Pearson correlation between cosine and cluster entropy
    if len(all_cosine) > 1:
        corr = float(np.corrcoef(all_cosine, all_cluster)[0, 1])
    else:
        corr = 0.0

    summary = {
        "n_bins": len(bins_output),
        "mean_cosine_entropy": round(float(np.mean(all_cosine)) if all_cosine else 0.0, 6),
        "mean_cluster_entropy": round(float(np.mean(all_cluster)) if all_cluster else 0.0, 6),
        "quadrant_counts": quadrant_counts,
        "correlation_cosine_vs_cluster": round(corr, 6),
    }

    output = {
        "method_cosine": "cosine_divergence",
        "method_cluster": "clustering_entropy",
        "embedding_model": "all-MiniLM-L6-v2",
        "bins": bins_output,
        "per_provider": per_provider,
        "summary": summary,
    }

    output_path = results_dir / "semantic_entropy.json"
    print(f"Writing output to {output_path}...")
    with open(output_path, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\nDone!")
    print(f"  Bins processed: {summary['n_bins']}")
    print(f"  Mean cosine entropy: {summary['mean_cosine_entropy']:.4f}")
    print(f"  Mean cluster entropy: {summary['mean_cluster_entropy']:.4f}")
    print(f"  Correlation (cosine vs cluster): {summary['correlation_cosine_vs_cluster']:.4f}")
    print(f"  Quadrant counts: {quadrant_counts}")


if __name__ == "__main__":
    main()
