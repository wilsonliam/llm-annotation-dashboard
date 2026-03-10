#!/usr/bin/env python3
"""
Pareto Web Dashboard — live interactive Dash application comparing
LLM annotators across cost, latency, agreement, confidence, and calibration.

Usage:
    python -m analysis.pareto_dashboard
    python -m analysis.pareto_dashboard --results-dir results/ --port 8050 --debug
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Any, Optional

import numpy as np
import pandas as pd
import plotly.graph_objects as go
from plotly.subplots import make_subplots

import dash
from dash import dcc, html, Input, Output, State, callback_context, dash_table
import dash_bootstrap_components as dbc

from analysis.compare import load_predictions, build_label_table, pairwise_kappa


# ═══════════════════════════════════════════════════════════════════════════
#  Theme
# ═══════════════════════════════════════════════════════════════════════════

COLORS = {
    "anthropic": "#D97706",
    "openai":    "#059669",
    "gemini":    "#2563EB",
}
COLOR_LIST = ["#D97706", "#059669", "#2563EB", "#DC2626", "#7C3AED", "#0891B2"]

BG       = "#0F172A"
CARD_BG  = "#1E293B"
TEXT     = "#F1F5F9"
MUTED    = "#94A3B8"
ACCENT   = "#3B82F6"
BORDER   = "#334155"

CHART_TEMPLATE = "plotly_dark"


def _color(prov: str, idx: int = 0) -> str:
    return COLORS.get(prov, COLOR_LIST[idx % len(COLOR_LIST)])


# ═══════════════════════════════════════════════════════════════════════════
#  Data Loading
# ═══════════════════════════════════════════════════════════════════════════

def load_metadata(results_dir: Path) -> dict[str, Any]:
    meta_path = results_dir / "run_metadata.json"
    if meta_path.exists():
        with open(meta_path) as f:
            return json.load(f)
    return {}


def load_all_records(results_dir: Path) -> dict[str, list[dict]]:
    records: dict[str, list[dict]] = {}
    for jsonl in sorted(results_dir.glob("*_predictions.jsonl")):
        provider = jsonl.stem.replace("_predictions", "")
        records[provider] = []
        with open(jsonl) as f:
            for line in f:
                line = line.strip()
                if line:
                    records[provider].append(json.loads(line))
    return records


def compute_metrics(
    label_df: pd.DataFrame,
    records: dict[str, list[dict]],
    metadata: dict[str, Any],
) -> pd.DataFrame:
    providers = sorted(label_df["provider"].unique())

    vote_df = (
        label_df.groupby(["stayId", "binIndex"])["dischargeReady"]
        .agg(lambda x: x.mode().iloc[0] if len(x.mode()) > 0 else False)
        .rename("majority")
        .reset_index()
    )

    rows = []
    for prov in providers:
        prov_df = label_df[label_df["provider"] == prov]
        merged = prov_df.merge(vote_df, on=["stayId", "binIndex"], how="inner")

        agreement = (merged["dischargeReady"] == merged["majority"]).mean()
        mean_conf = prov_df["confidence"].mean()
        ready_rate = prov_df["dischargeReady"].mean()

        brier_scores = []
        for _, row in merged.iterrows():
            p_ready = row["confidence"] if row["dischargeReady"] else (1 - row["confidence"])
            true_label = 1.0 if row["majority"] else 0.0
            brier_scores.append((p_ready - true_label) ** 2)
        brier = sum(brier_scores) / len(brier_scores) if brier_scores else float("nan")

        recs = records.get(prov, [])
        total_input = sum(r.get("input_tokens", 0) for r in recs)
        total_output = sum(r.get("output_tokens", 0) for r in recs)
        if not total_input and metadata.get("models", {}).get(prov):
            m = metadata["models"][prov]
            total_input = m.get("total_input_tokens", 0)
            total_output = m.get("total_output_tokens", 0)
        total_tokens = total_input + total_output

        latencies = [r.get("elapsed_seconds", 0) for r in recs if r.get("elapsed_seconds")]
        mean_latency = sum(latencies) / len(latencies) if latencies else 0

        rows.append({
            "provider": prov,
            "agreement": round(agreement, 4),
            "mean_confidence": round(mean_conf, 4),
            "ready_rate": round(ready_rate, 4),
            "brier_score": round(brier, 4),
            "total_tokens": total_tokens,
            "total_input_tokens": total_input,
            "total_output_tokens": total_output,
            "mean_latency_s": round(mean_latency, 2),
            "n_visits": len(recs),
            "n_bins": len(prov_df),
        })

    df = pd.DataFrame(rows)

    kdf = pairwise_kappa(label_df)
    if len(kdf):
        avg_kappa = {}
        for prov in providers:
            k_vals = kdf[(kdf["model_a"] == prov) | (kdf["model_b"] == prov)]["cohens_kappa"]
            avg_kappa[prov] = round(k_vals.mean(), 4) if len(k_vals) else float("nan")
        df["avg_kappa"] = df["provider"].map(avg_kappa)
    else:
        df["avg_kappa"] = float("nan")

    # Pareto dominance
    df["pareto_optimal"] = True
    for i, row_i in df.iterrows():
        for j, row_j in df.iterrows():
            if i == j:
                continue
            if (row_j["agreement"] >= row_i["agreement"]
                    and row_j["total_tokens"] <= row_i["total_tokens"]
                    and (row_j["agreement"] > row_i["agreement"]
                         or row_j["total_tokens"] < row_i["total_tokens"])):
                df.at[i, "pareto_optimal"] = False
                break

    return df


# ═══════════════════════════════════════════════════════════════════════════
#  Chart Builders
# ═══════════════════════════════════════════════════════════════════════════

def _chart_layout(fig: go.Figure, title: str = "") -> go.Figure:
    fig.update_layout(
        template=CHART_TEMPLATE,
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        title=dict(text=title, font=dict(size=16, color=TEXT)),
        font=dict(color=MUTED),
        legend=dict(bgcolor="rgba(0,0,0,0)"),
        margin=dict(l=50, r=30, t=50, b=50),
    )
    return fig


def make_pareto_scatter(
    metrics: pd.DataFrame,
    x_col: str, y_col: str,
    x_label: str, y_label: str,
    title: str,
    y_is_pct: bool = False,
) -> go.Figure:
    fig = go.Figure()
    for i, (_, row) in enumerate(metrics.iterrows()):
        prov = row["provider"]
        y_fmt = f"{row[y_col]:.1%}" if y_is_pct else f"{row[y_col]:.3f}"
        fig.add_trace(go.Scatter(
            x=[row[x_col]], y=[row[y_col]],
            mode="markers+text",
            marker=dict(
                size=22,
                color=_color(prov, i),
                symbol="star" if row.get("pareto_optimal") else "circle",
                line=dict(width=2, color=TEXT),
            ),
            text=[prov.title()],
            textposition="top center",
            textfont=dict(size=12, color=TEXT),
            name=prov.title(),
            customdata=[[row.get("pareto_optimal", False)]],
            hovertemplate=(
                f"<b>{prov.title()}</b><br>"
                f"{x_label}: %{{x:,.0f}}<br>"
                f"{y_label}: {y_fmt}<br>"
                "<extra></extra>"
            ),
        ))

    pareto = metrics[metrics["pareto_optimal"]].sort_values(x_col)
    if len(pareto) > 1:
        fig.add_trace(go.Scatter(
            x=pareto[x_col], y=pareto[y_col],
            mode="lines",
            line=dict(dash="dash", color=MUTED, width=1),
            showlegend=False, hoverinfo="skip",
        ))

    _chart_layout(fig, title)
    fig.update_xaxes(title_text=x_label, gridcolor=BORDER, zeroline=False)
    fig.update_yaxes(
        title_text=y_label, gridcolor=BORDER, zeroline=False,
        tickformat=".0%" if y_is_pct else None,
    )
    return fig


def make_radar(metrics: pd.DataFrame) -> go.Figure:
    m = metrics.copy()
    max_tok = m["total_tokens"].max() or 1
    max_lat = m["mean_latency_s"].max() or 1
    max_brier = m["brier_score"].max() or 1
    m["cost_efficiency"] = 1 - (m["total_tokens"] / max_tok)
    m["speed"] = 1 - (m["mean_latency_s"] / max_lat)
    m["calibration"] = 1 - (m["brier_score"] / max_brier)

    cols = ["agreement", "mean_confidence", "avg_kappa",
            "cost_efficiency", "speed", "calibration"]
    labels = ["Agreement", "Confidence", "Avg κ",
              "Cost Eff.", "Speed", "Calibration"]

    fig = go.Figure()
    for i, (_, row) in enumerate(m.iterrows()):
        prov = row["provider"]
        vals = [row[c] for c in cols] + [row[cols[0]]]
        fig.add_trace(go.Scatterpolar(
            r=vals, theta=labels + [labels[0]],
            fill="toself", name=prov.title(),
            line=dict(color=_color(prov, i), width=2),
            opacity=0.55,
        ))

    _chart_layout(fig, "Model Comparison Radar")
    fig.update_layout(
        polar=dict(
            bgcolor="rgba(0,0,0,0)",
            radialaxis=dict(visible=True, range=[0, 1], gridcolor=BORDER,
                            tickfont=dict(color=MUTED)),
            angularaxis=dict(gridcolor=BORDER, tickfont=dict(color=TEXT)),
        ),
    )
    return fig


def make_confidence_dist(label_df: pd.DataFrame, providers: list[str]) -> go.Figure:
    fig = go.Figure()
    for i, prov in enumerate(providers):
        pdf = label_df[label_df["provider"] == prov]
        fig.add_trace(go.Histogram(
            x=pdf["confidence"], name=prov.title(),
            marker_color=_color(prov, i), opacity=0.6, nbinsx=30,
        ))
    _chart_layout(fig, "Confidence Score Distribution")
    fig.update_layout(barmode="overlay")
    fig.update_xaxes(title_text="Confidence", gridcolor=BORDER)
    fig.update_yaxes(title_text="Count", gridcolor=BORDER)
    return fig


def make_timeline(
    label_df: pd.DataFrame, stay_id: int, providers: list[str]
) -> go.Figure:
    sdf = label_df[label_df["stayId"] == stay_id]
    fig = go.Figure()
    for i, prov in enumerate(providers):
        pdf = sdf[sdf["provider"] == prov].sort_values("binIndex")
        fig.add_trace(go.Scatter(
            x=pdf["binIndex"],
            y=pdf["dischargeReady"].astype(int),
            mode="lines+markers",
            name=prov.title(),
            line=dict(color=_color(prov, i), width=2),
            marker=dict(size=6),
        ))
    _chart_layout(fig, f"Discharge Readiness Timeline — Stay {stay_id}")
    fig.update_yaxes(
        tickvals=[0, 1], ticktext=["Not Ready", "Ready"],
        gridcolor=BORDER, zeroline=False,
    )
    fig.update_xaxes(title_text="Bin Index (6-hour windows)", gridcolor=BORDER)
    return fig


def make_confidence_timeline(
    label_df: pd.DataFrame, stay_id: int, providers: list[str]
) -> go.Figure:
    sdf = label_df[label_df["stayId"] == stay_id]
    fig = go.Figure()
    for i, prov in enumerate(providers):
        pdf = sdf[sdf["provider"] == prov].sort_values("binIndex")
        fig.add_trace(go.Scatter(
            x=pdf["binIndex"], y=pdf["confidence"],
            mode="lines+markers",
            name=prov.title(),
            line=dict(color=_color(prov, i), width=2),
            marker=dict(size=6),
        ))
    _chart_layout(fig, f"Confidence over Time — Stay {stay_id}")
    fig.update_yaxes(title_text="Confidence", range=[0, 1], gridcolor=BORDER)
    fig.update_xaxes(title_text="Bin Index", gridcolor=BORDER)
    return fig


def make_agreement_heatmap(label_df: pd.DataFrame) -> go.Figure:
    """Per-bin agreement heatmap across all common stays."""
    providers = sorted(label_df["provider"].unique())
    pivot = label_df.pivot_table(
        index=["stayId", "binIndex"], columns="provider",
        values="dischargeReady", aggfunc="first",
    )
    pivot["n_agree"] = pivot[providers].apply(
        lambda r: max(r.sum(), len(providers) - r.sum()), axis=1
    )
    pivot["pct_agree"] = pivot["n_agree"] / len(providers)
    pivot = pivot.reset_index().sort_values(["stayId", "binIndex"])

    stays = sorted(pivot["stayId"].unique())
    max_bins = int(pivot["binIndex"].max()) + 1
    z = np.full((len(stays), max_bins), np.nan)
    stay_map = {s: i for i, s in enumerate(stays)}
    for _, row in pivot.iterrows():
        z[stay_map[row["stayId"]], int(row["binIndex"])] = row["pct_agree"]

    fig = go.Figure(data=go.Heatmap(
        z=z, x=list(range(max_bins)),
        y=[str(s) for s in stays],
        colorscale="RdYlGn", zmin=0, zmax=1,
        colorbar=dict(title="Agreement", tickformat=".0%"),
        hovertemplate="Stay %{y}<br>Bin %{x}<br>Agreement: %{z:.0%}<extra></extra>",
    ))
    _chart_layout(fig, "Per-Bin Agreement Heatmap (all stays)")
    fig.update_xaxes(title_text="Bin Index", gridcolor=BORDER)
    fig.update_yaxes(title_text="Stay ID", gridcolor=BORDER)
    fig.update_layout(height=max(300, len(stays) * 22 + 100))
    return fig


def make_kappa_heatmap(label_df: pd.DataFrame) -> go.Figure:
    kdf = pairwise_kappa(label_df)
    providers = sorted(label_df["provider"].unique())
    n = len(providers)
    z = np.eye(n)
    for _, row in kdf.iterrows():
        i = providers.index(row["model_a"])
        j = providers.index(row["model_b"])
        z[i][j] = row["cohens_kappa"]
        z[j][i] = row["cohens_kappa"]

    fig = go.Figure(data=go.Heatmap(
        z=z, x=[p.title() for p in providers],
        y=[p.title() for p in providers],
        colorscale="Blues", zmin=0, zmax=1,
        text=np.round(z, 3), texttemplate="%{text}",
        colorbar=dict(title="κ"),
    ))
    _chart_layout(fig, "Pairwise Cohen's κ")
    fig.update_layout(height=350)
    return fig


# ═══════════════════════════════════════════════════════════════════════════
#  Card / Layout Helpers
# ═══════════════════════════════════════════════════════════════════════════

def card(children, **kwargs):
    return dbc.Card(
        dbc.CardBody(children),
        style={
            "backgroundColor": CARD_BG,
            "border": f"1px solid {BORDER}",
            "borderRadius": "12px",
            "marginBottom": "16px",
        },
        **kwargs,
    )


def stat_card(label: str, value: str, color: str = ACCENT):
    return card([
        html.P(label, style={"color": MUTED, "fontSize": "0.8rem",
                              "marginBottom": "4px", "textTransform": "uppercase",
                              "letterSpacing": "0.05em"}),
        html.H3(value, style={"color": color, "margin": 0, "fontWeight": 700}),
    ])


# ═══════════════════════════════════════════════════════════════════════════
#  Build the Dash App
# ═══════════════════════════════════════════════════════════════════════════

def create_app(results_dir: Path) -> dash.Dash:
    # ── Load data ───────────────────────────────────────────────────────
    preds = load_predictions(results_dir)
    if not preds:
        raise SystemExit(f"No prediction files found in {results_dir}")

    records = load_all_records(results_dir)
    metadata = load_metadata(results_dir)
    label_df = build_label_table(preds)
    metrics = compute_metrics(label_df, records, metadata)
    providers = sorted(label_df["provider"].unique())

    # Common stays across all providers
    common = set(label_df[label_df["provider"] == providers[0]]["stayId"].unique())
    for p in providers[1:]:
        common &= set(label_df[label_df["provider"] == p]["stayId"].unique())
    common_stays = sorted(common)

    # ── App ─────────────────────────────────────────────────────────────
    app = dash.Dash(
        __name__,
        external_stylesheets=[dbc.themes.DARKLY],
        title="LLM Pareto Dashboard",
        suppress_callback_exceptions=True,
    )

    # ── Stat row ────────────────────────────────────────────────────────
    best_agreement = metrics.loc[metrics["agreement"].idxmax()]
    lowest_cost = metrics.loc[metrics["total_tokens"].idxmin()]
    fastest = metrics.loc[metrics["mean_latency_s"].idxmin()]

    stat_row = dbc.Row([
        dbc.Col(stat_card("Best Agreement",
                          f"{best_agreement['agreement']:.1%} — {best_agreement['provider'].title()}",
                          "#10B981"), md=3),
        dbc.Col(stat_card("Lowest Cost",
                          f"{lowest_cost['total_tokens']:,} tok — {lowest_cost['provider'].title()}",
                          "#F59E0B"), md=3),
        dbc.Col(stat_card("Fastest",
                          f"{fastest['mean_latency_s']:.1f}s — {fastest['provider'].title()}",
                          "#3B82F6"), md=3),
        dbc.Col(stat_card("Models × Bins",
                          f"{len(providers)} × {len(label_df) // max(len(providers), 1):,}",
                          "#8B5CF6"), md=3),
    ], className="mb-3")

    # ── Tab: Pareto Fronts ──────────────────────────────────────────────
    pareto_x_options = [
        {"label": "Total Tokens (Cost)", "value": "total_tokens"},
        {"label": "Mean Latency (s)", "value": "mean_latency_s"},
        {"label": "Brier Score", "value": "brier_score"},
    ]
    pareto_y_options = [
        {"label": "Agreement", "value": "agreement"},
        {"label": "Mean Confidence", "value": "mean_confidence"},
        {"label": "Avg κ", "value": "avg_kappa"},
        {"label": "Ready Rate", "value": "ready_rate"},
    ]

    tab_pareto = dbc.Tab(label="⚡ Pareto Fronts", tab_id="tab-pareto", children=[
        dbc.Row([
            dbc.Col([
                html.Label("X-axis", style={"color": MUTED, "fontSize": "0.85rem"}),
                dcc.Dropdown(id="pareto-x", options=pareto_x_options,
                             value="total_tokens", clearable=False,
                             style={"backgroundColor": CARD_BG, "color": TEXT}),
            ], md=4),
            dbc.Col([
                html.Label("Y-axis", style={"color": MUTED, "fontSize": "0.85rem"}),
                dcc.Dropdown(id="pareto-y", options=pareto_y_options,
                             value="agreement", clearable=False,
                             style={"backgroundColor": CARD_BG, "color": TEXT}),
            ], md=4),
        ], className="mb-3 mt-3"),
        card([dcc.Graph(id="pareto-chart", config={"displayModeBar": True})]),
        dbc.Row([
            dbc.Col(card([dcc.Graph(
                id="radar-chart",
                figure=make_radar(metrics),
                config={"displayModeBar": False},
            )]), md=6),
            dbc.Col(card([dcc.Graph(
                id="kappa-heatmap",
                figure=make_kappa_heatmap(label_df),
                config={"displayModeBar": False},
            )]), md=6),
        ]),
    ])

    # ── Tab: Model Details ──────────────────────────────────────────────
    table_df = metrics[[
        "provider", "agreement", "mean_confidence", "avg_kappa",
        "brier_score", "total_tokens", "total_input_tokens", "total_output_tokens",
        "mean_latency_s", "ready_rate", "n_visits", "n_bins", "pareto_optimal",
    ]].copy()
    table_df["provider"] = table_df["provider"].str.title()
    table_df["agreement"] = table_df["agreement"].apply(lambda v: f"{v:.1%}")
    table_df["mean_confidence"] = table_df["mean_confidence"].apply(lambda v: f"{v:.3f}")
    table_df["avg_kappa"] = table_df["avg_kappa"].apply(lambda v: f"{v:.3f}")
    table_df["brier_score"] = table_df["brier_score"].apply(lambda v: f"{v:.4f}")
    table_df["ready_rate"] = table_df["ready_rate"].apply(lambda v: f"{v:.1%}")
    table_df["pareto_optimal"] = table_df["pareto_optimal"].apply(lambda v: "✓" if v else "")
    table_df.columns = [
        "Model", "Agreement", "Confidence", "Avg κ", "Brier",
        "Total Tokens", "Input Tokens", "Output Tokens",
        "Latency (s)", "Ready Rate", "Visits", "Bins", "Pareto",
    ]

    tab_details = dbc.Tab(label="📊 Model Details", tab_id="tab-details", children=[
        card([
            html.H5("Summary Metrics", style={"color": TEXT}),
            dash_table.DataTable(
                data=table_df.to_dict("records"),
                columns=[{"name": c, "id": c} for c in table_df.columns],
                style_header={
                    "backgroundColor": "#334155", "color": TEXT,
                    "fontWeight": "bold", "border": f"1px solid {BORDER}",
                },
                style_cell={
                    "backgroundColor": CARD_BG, "color": TEXT,
                    "border": f"1px solid {BORDER}", "textAlign": "center",
                    "padding": "8px 12px", "fontSize": "0.9rem",
                },
                style_data_conditional=[{
                    "if": {"row_index": "odd"},
                    "backgroundColor": "#1A2332",
                }],
            ),
        ], className="mt-3"),
        dbc.Row([
            dbc.Col(card([dcc.Graph(
                id="conf-dist",
                figure=make_confidence_dist(label_df, providers),
            )]), md=6),
            dbc.Col(card([dcc.Graph(
                id="agreement-heatmap",
                figure=make_agreement_heatmap(label_df),
            )]), md=6),
        ]),
    ])

    # ── Tab: Visit Explorer ─────────────────────────────────────────────
    stay_options = [{"label": f"Stay {s}", "value": s} for s in common_stays]

    tab_visits = dbc.Tab(label="🔍 Visit Explorer", tab_id="tab-visits", children=[
        dbc.Row([
            dbc.Col([
                html.Label("Select a visit:", style={"color": MUTED, "fontSize": "0.85rem"}),
                dcc.Dropdown(
                    id="visit-dropdown",
                    options=stay_options,
                    value=common_stays[0] if common_stays else None,
                    clearable=False,
                    style={"backgroundColor": CARD_BG, "color": TEXT},
                ),
            ], md=4),
            dbc.Col([
                html.Label("Models:", style={"color": MUTED, "fontSize": "0.85rem"}),
                dcc.Checklist(
                    id="model-checklist",
                    options=[{"label": html.Span(
                        f"  {p.title()}",
                        style={"color": _color(p)}
                    ), "value": p} for p in providers],
                    value=providers,
                    inline=True,
                    inputStyle={"marginRight": "4px"},
                    labelStyle={"marginRight": "18px", "cursor": "pointer"},
                ),
            ], md=8),
        ], className="mt-3 mb-3"),
        card([dcc.Graph(id="visit-timeline")]),
        card([dcc.Graph(id="visit-confidence")]),
        card(id="visit-stats-card", children=[]),
    ])

    # ── Layout ──────────────────────────────────────────────────────────
    app.layout = dbc.Container([
        # Header
        html.Div([
            html.H1([
                html.Span("🏥 ", style={"marginRight": "8px"}),
                "LLM Annotator Pareto Dashboard",
            ], style={"color": TEXT, "fontWeight": 800, "marginBottom": "4px"}),
            html.P(
                "Interactive comparison of Anthropic Claude, OpenAI GPT-4o, "
                "and Google Gemini on ICU discharge readiness annotation.",
                style={"color": MUTED, "marginBottom": 0},
            ),
        ], style={
            "borderBottom": f"3px solid {ACCENT}",
            "paddingBottom": "16px", "marginBottom": "20px",
        }),

        stat_row,

        dbc.Tabs(
            id="main-tabs",
            active_tab="tab-pareto",
            children=[tab_pareto, tab_details, tab_visits],
            style={"marginBottom": "16px"},
        ),

        # Footer
        html.Div(
            html.P(
                "ICU Discharge Readiness — LLM Annotator Comparison Pipeline",
                style={"color": MUTED, "fontSize": "0.8rem", "textAlign": "center"},
            ),
            style={"marginTop": "40px", "paddingTop": "16px",
                    "borderTop": f"1px solid {BORDER}"},
        ),
    ], fluid=True, style={
        "backgroundColor": BG,
        "minHeight": "100vh",
        "padding": "24px 32px",
    })

    # ── Callbacks ───────────────────────────────────────────────────────

    @app.callback(
        Output("pareto-chart", "figure"),
        [Input("pareto-x", "value"), Input("pareto-y", "value")],
    )
    def update_pareto(x_col, y_col):
        x_labels = {o["value"]: o["label"] for o in pareto_x_options}
        y_labels = {o["value"]: o["label"] for o in pareto_y_options}
        y_is_pct = y_col in ("agreement", "ready_rate")
        return make_pareto_scatter(
            metrics, x_col, y_col,
            x_labels.get(x_col, x_col),
            y_labels.get(y_col, y_col),
            f"Pareto: {x_labels.get(x_col, x_col)} vs {y_labels.get(y_col, y_col)}",
            y_is_pct=y_is_pct,
        )

    @app.callback(
        [Output("visit-timeline", "figure"),
         Output("visit-confidence", "figure"),
         Output("visit-stats-card", "children")],
        [Input("visit-dropdown", "value"),
         Input("model-checklist", "value")],
    )
    def update_visit(stay_id, selected_models):
        if not stay_id or not selected_models:
            empty = go.Figure()
            _chart_layout(empty, "Select a visit and models")
            return empty, empty, html.P("No data", style={"color": MUTED})

        fig1 = make_timeline(label_df, stay_id, selected_models)
        fig2 = make_confidence_timeline(label_df, stay_id, selected_models)

        # Per-model stats for this visit
        sdf = label_df[(label_df["stayId"] == stay_id) &
                       (label_df["provider"].isin(selected_models))]
        stat_rows = []
        for prov in selected_models:
            pdf = sdf[sdf["provider"] == prov]
            if len(pdf) == 0:
                continue
            stat_rows.append(html.Tr([
                html.Td(prov.title(), style={"color": _color(prov), "fontWeight": 600}),
                html.Td(f"{pdf['dischargeReady'].mean():.1%}"),
                html.Td(f"{pdf['confidence'].mean():.3f}"),
                html.Td(f"{len(pdf)}"),
                html.Td(f"{pdf['dischargeReady'].sum()}/{len(pdf)}"),
            ]))

        stats_table = html.Table([
            html.Thead(html.Tr([
                html.Th("Model", style={"padding": "6px 16px"}),
                html.Th("Ready %", style={"padding": "6px 16px"}),
                html.Th("Mean Conf.", style={"padding": "6px 16px"}),
                html.Th("Bins", style={"padding": "6px 16px"}),
                html.Th("Ready / Total", style={"padding": "6px 16px"}),
            ], style={"borderBottom": f"2px solid {BORDER}"})),
            html.Tbody(stat_rows),
        ], style={
            "width": "100%", "color": TEXT, "fontSize": "0.9rem",
            "borderCollapse": "collapse",
        })

        return fig1, fig2, [
            html.H5(f"Visit {stay_id} — Per-Model Stats",
                     style={"color": TEXT, "marginBottom": "12px"}),
            stats_table,
        ]

    return app


# ═══════════════════════════════════════════════════════════════════════════
#  CLI
# ═══════════════════════════════════════════════════════════════════════════

def main() -> None:
    parser = argparse.ArgumentParser(description="Launch Pareto web dashboard")
    parser.add_argument("--results-dir", default="results")
    parser.add_argument("--port", type=int, default=8050)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--debug", action="store_true")
    args = parser.parse_args()

    results_dir = Path(args.results_dir)
    print(f"Loading results from {results_dir.resolve()} …")

    app = create_app(results_dir)

    print(f"\n🚀 Dashboard running at http://{args.host}:{args.port}/")
    print("   Press Ctrl+C to stop.\n")
    app.run(host=args.host, port=args.port, debug=args.debug)


if __name__ == "__main__":
    main()
