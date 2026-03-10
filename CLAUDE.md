# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Python pipeline for LLM-based annotation of ICU discharge readiness from MIMIC-IV data. Three LLM providers (Anthropic Claude, OpenAI GPT-4o, Google Gemini) annotate clinical visits, and their outputs are compared via inter-annotator agreement, Pareto analysis, and conformal prediction.

## Setup

```bash
source pipeline/source_env.sh   # Load API keys from .env into shell
pip install -r pipeline/requirements.txt
```

Required `.env` variables: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`

## Running

```bash
# Annotate all 140 visits with all 3 models
python pipeline/run.py

# Subset / specific models
python pipeline/run.py --models anthropic openai --max-visits 5

# Generate mock data (no API cost)
python pipeline/generate_mock_data.py --max-visits 20 --seed 42

# Inter-annotator agreement analysis
python -m pipeline.analysis.compare --results-dir pipeline/results/

# Interactive Pareto dashboard (Dash app on port 8050)
python -m pipeline.analysis.pareto_dashboard --results-dir pipeline/results/

# Conformal prediction analysis
python -m pipeline.analysis.conformal --results-dir pipeline/results/ --alpha 0.10

# Semantic entropy analysis
python -m pipeline.analysis.semantic_entropy --results-dir pipeline/results/
```

There is no formal test framework — use `generate_mock_data.py` to produce synthetic results for testing analysis/visualization without hitting real APIs.

## Architecture

**Data flow:** `display_visits.json` → `data_loader.py` → `prompt_builder.py` → LLM clients → `output_schema.py` validation → JSONL checkpoint files → `analysis/`

**Key modules:**
- `config.py` — All model IDs, paths, retry/timeout settings, API key loading
- `annotator.py` — Orchestrator: iterates visits, calls LLM clients, manages JSONL checkpoints (resume-safe)
- `llm_clients/base.py` — Abstract `BaseAnnotator` with exponential backoff retry (3 retries, 2s base), timeout (120s), and token tracking
- `llm_clients/{anthropic,openai,gemini}_client.py` — Provider-specific implementations; OpenAI uses JSON mode
- `data_loader.py` — Loads and validates the MIMIC-IV visit JSON
- `prompt_builder.py` — Constructs clinical narrative prompts with binned vitals/labs
- `output_schema.py` — Validates and extracts structured JSON from LLM responses (strict schema enforcement with retries)

**Output files** (in `results/`):
- `{model}_predictions.jsonl` — Per-visit annotations (appended incrementally)
- `{model}_errors.jsonl` — Failed predictions with timestamps
- `run_metadata.json` — Token usage, costs, timing

**Models configured in `config.py`:**
- Claude: `claude-sonnet-4-20250514` (temperature 0.0, max 4096 tokens)
- GPT-4o: `gpt-4o-2024-11-20`
- Gemini: `gemini-2.0-flash`

## dashboard (React Frontend)

Located at `dashboard/`. A static React data visualization dashboard for comparing the three LLM annotators on ICU discharge readiness prediction results.

### Stack

- React 19 + Vite + TypeScript
- Tailwind CSS v3 (dark theme: background `#0F172A`, surface `#1E293B`)
- shadcn/ui components (manually added — no CLI): `card.tsx`, `badge.tsx` in `src/components/ui/`
- Recharts for all charts
- React Router v6 for navigation
- No backend — pure static frontend; data loaded from `public/data/*.jsonl` and `public/data/*.json`

### Running

```bash
cd dashboard
npm install
npm run dev       # development server at http://localhost:5173
npm run build     # production build to dist/
```

### Pages

- `/` — **Pareto Fronts**: KPI cards, interactive scatter (x/y metric selectors), radar chart, Cohen's κ heatmap
- `/details` — **Model Details**: sortable metrics table, confidence histogram, bin agreement heatmap
- `/visits` — **Visit Explorer**: per-visit discharge readiness timeline and confidence charts with model toggle
- `/conformal` — **Conformal Prediction**: per-model conformal metrics and alpha sweep coverage chart
- `/semantic` — **Semantic Entropy**: reasoning divergence heatmaps, agreement vs. entropy scatter, confidence variance panel

### Architecture

- `src/lib/loader.ts` — Fetches and parses JSONL files, computes per-provider metrics (agreement, Brier score, mean confidence, kappa), pairwise Cohen's κ matrix, Pareto-optimal flags, and per-bin confidence variance
- `src/lib/pareto.ts` — Pure function: given (id, cost, quality) points, returns the non-dominated Pareto front as a Set of ids
- `src/hooks/DashboardContext.tsx` — React context that loads data once on mount and provides it to all pages; consumed via `useDashboard()`
- Provider color palette: anthropic `#D97706`, openai `#059669`, gemini `#2563EB`
- Data files in `public/data/`: `anthropic_predictions.jsonl`, `openai_predictions.jsonl`, `gemini_predictions.jsonl`, `run_metadata.json`, `conformal_results.json`, `semantic_entropy.json`
