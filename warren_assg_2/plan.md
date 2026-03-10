# Plan: LLM Annotator Comparison for Early ICU Discharge Prediction

## Project Overview

**Goal:** Build a surrogate labeling pipeline that sends MIMIC-IV ICU visit data to three LLM providers (Anthropic Claude, OpenAI GPT-4o, Google Gemini) and compares their annotations for predicting early ICU discharge readiness.

**Data:** 140 ICU visits with 2,126 six-hour bins containing vitals, labs, clinical supports, and sparse notes (from `display_visits.json`).

---

## Phase 1: Project Setup & Configuration

### 1.1 — Environment & Dependencies
- [ ] Create a Python virtual environment
- [x] Create `requirements.txt` with dependencies:
  - `openai` (for OpenAI API)
  - `anthropic` (for Claude API)
  - `google-generativeai` (for Gemini API)
  - `python-dotenv` (for loading env vars)
  - `pandas` (data wrangling)
  - `tqdm` (progress bars)
- [x] Create `.env` file template with placeholders for all API keys:
  - `ANTHROPIC_API_KEY`
  - `OPENAI_API_KEY`
  - `GOOGLE_API_KEY`
- [ ] Create a `source_env.sh` script that exports `.env` vars into the shell
- [ ] Add `.env` to `.gitignore`

### 1.2 — Project Directory Structure
```
warren_assg_2/
├── .env                        # API keys (gitignored)
├── .gitignore
├── source_env.sh               # source this to load keys
├── requirements.txt
├── plan.md                     # this file
├── display_visits.json         # sample MIMIC-IV data
├── config.py                   # central config (models, prompts, paths)
├── data_loader.py              # load & validate visit JSON
├── prompt_builder.py           # construct annotation prompts per visit/bin
├── llm_clients/
│   ├── __init__.py
│   ├── base.py                 # abstract base annotator class
│   ├── anthropic_client.py     # Anthropic (Claude) annotator
│   ├── openai_client.py        # OpenAI (GPT) annotator
│   └── gemini_client.py        # Google Gemini annotator
├── annotator.py                # orchestrator: runs all LLMs over data
├── output_schema.py            # defines & validates annotation output schema
├── generate_mock_data.py       # synthetic predictions for dev/testing
├── results/                    # saved annotation outputs (JSONL per model)
│   └── .gitkeep
├── analysis/
│   ├── compare.py              # inter-annotator agreement analysis
│   ├── visualize.py            # plots / summary tables
│   ├── pareto_dashboard.py     # interactive Pareto HTML dashboard
│   └── conformal.py            # conformal prediction analysis
└── run.py                      # main entry point
```

---

## Phase 2: Data Loading & Preprocessing

### 2.1 — Data Loader (`data_loader.py`)
- [ ] Load `display_visits.json` (or any file with the same structure)
- [ ] Parse and validate top-level structure (`exportedAt`, `counts`, `visits`)
- [ ] For each visit, extract:
  - Patient identifiers: `stayId`, `subjectId`, `hadmId`
  - Care unit info: `firstCareunit`, `lastCareunit`
  - Admission/discharge times: `intime`, `outtime`
  - `latestVitals`, `latestLabs`
  - Array of 6-hour `bins`
- [ ] Handle data quality issues:
  - Flag vitals/labs with implausible values (e.g., `tidal > 2000`, `hr == 0`, `potassium == 0`)
  - Treat empty `{}` / `[]` as missing, not normal
- [ ] Provide a method to iterate over visits or select a subset for testing

### 2.2 — Prompt Builder (`prompt_builder.py`)
- [ ] Design a **system prompt** explaining the clinical task:
  - Role: ICU clinician evaluating discharge readiness
  - Task: For each visit, assess each 6-hour bin and label whether the patient appears ready for ICU discharge at that point
  - Output format: structured JSON with per-bin labels and reasoning
- [ ] Design a **visit prompt** that serializes a single visit into a readable clinical summary:
  - Patient demographics / care unit
  - Chronological bins with vitals, labs, supports, notes
  - Clear formatting so the LLM can reason temporally
- [ ] Support **sliding-window** mode: optionally present only the last N bins for context-limited models
- [ ] Define the expected **output schema**:
  ```json
  {
    "stayId": 12345,
    "bins": [
      {
        "binIndex": 0,
        "start": "...",
        "end": "...",
        "dischargeReady": true | false,
        "confidence": 0.0-1.0,
        "reasoning": "short explanation"
      }
    ],
    "overallAssessment": "summary string"
  }
  ```

---

## Phase 3: LLM Client Implementations

### 3.1 — Base Annotator (`llm_clients/base.py`)
- [ ] Define `BaseAnnotator` abstract class with:
  - `annotate(visit_data) -> AnnotationResult`
  - `model_name` property
  - Retry logic with exponential backoff
  - Rate limiting (configurable per provider)
  - Token usage / cost tracking
  - Timeout handling

### 3.2 — Anthropic Client (`llm_clients/anthropic_client.py`)
- [ ] Implement using `anthropic` SDK
- [ ] Model: `claude-sonnet-4-20250514` (or configurable)
- [ ] Use system prompt + user message pattern
- [ ] Parse structured JSON from response

### 3.3 — OpenAI Client (`llm_clients/openai_client.py`)
- [ ] Implement using `openai` SDK
- [ ] Model: `gpt-4o` (or configurable)
- [ ] Use system/user message pattern
- [ ] Optionally use JSON mode / structured outputs for reliable parsing

### 3.4 — Gemini Client (`llm_clients/gemini_client.py`)
- [ ] Implement using `google-generativeai` SDK
- [ ] Model: `gemini-2.0-flash` (or configurable)
- [ ] Handle Gemini-specific prompt formatting
- [ ] Parse structured JSON from response

### 3.5 — Notes on OpenEvidence & BioMistral

Both were investigated and dropped:
- **OpenEvidence** has no public API and is not on OpenRouter. It is a clinical product for verified HCPs only.
- **BioMistral** is not available on OpenRouter or any hosted inference API.

The architecture is modular — additional annotators can be added later by subclassing `BaseAnnotator`.

---

## Phase 4: Orchestration & Execution

### 4.1 — Annotation Orchestrator (`annotator.py`)
- [ ] Accept a list of visits and a list of annotator clients
- [ ] For each visit × each annotator:
  - Build the prompt
  - Send to LLM
  - Parse and validate the response against the output schema
  - If invalid, retry with a correction prompt (up to 2 retries)
  - Save raw response + parsed result
- [ ] Support **resume from checkpoint**: if the run is interrupted, skip already-completed (visit, model) pairs
- [ ] Log progress with `tqdm`
- [ ] Track and report:
  - Total tokens used per model
  - Estimated cost per model
  - Success/failure counts
  - Average latency per model

### 4.2 — Results Storage  *(per-prediction save for crash safety)*
- [x] Each prediction saved immediately to `results/{provider}_predictions.jsonl` (one JSON per line)
- [x] Errors saved to `results/{provider}_errors.jsonl`
- [x] On re-run, already-completed `(stayId, provider)` pairs are skipped (resume from checkpoint)
- [x] Run metadata saved to `results/run_metadata.json` with:
  - Timestamp, model versions, token counts, error counts

### 4.3 — Main Entry Point (`run.py`)
- [ ] CLI interface with arguments:
  - `--data` path to visit JSON (default: `display_visits.json`)
  - `--models` which models to run (default: all)
  - `--max-visits` limit number of visits (for testing)
  - `--output-dir` results directory
  - `--use-openrouter` flag to route all through OpenRouter
- [ ] Load environment variables from `.env`
- [ ] Initialize annotators, run orchestrator, save results

---

## Phase 5: Analysis & Comparison

### 5.1 — Inter-Annotator Agreement (`analysis/compare.py`)
- [ ] Load all model annotation results
- [ ] Compute per-bin agreement metrics:
  - **Cohen's Kappa** (pairwise between models)
  - **Fleiss' Kappa** (multi-annotator)
  - **Percent agreement** (raw)
  - **Krippendorff's Alpha**
- [ ] Compute per-visit agreement (majority vote on each bin)
- [ ] Breakdown by:
  - Care unit type
  - Length of stay
  - Presence of specific supports (e.g., ventilated vs. not)
- [ ] Identify "hard" cases where models disagree most

### 5.2 — Visualization (`analysis/visualize.py`)
- [ ] Heatmap of pairwise Cohen's Kappa across models
- [ ] Timeline plots: for selected visits, show each model's discharge-readiness label over time
- [ ] Confusion matrices (pairwise)
- [ ] Bar charts of confidence distributions per model
- [ ] Summary table of costs, latency, and agreement metrics

---

## Phase 6: Mock Data Generation

### 6.1 — Mock Prediction Generator (`generate_mock_data.py`)

Generate realistic fake annotation outputs for all 3 models so that the dashboard and analysis code can be developed, tested, and demonstrated **without spending API money**.

- [ ] Load visits from `display_visits.json`
- [ ] For each visit × each model, produce a synthetic prediction record matching the real JSONL schema:
  - `stayId`, `provider`, `model_id`, `timestamp`, `elapsed_seconds`
  - `annotation.bins[].dischargeReady` — simulate a realistic clinical trajectory:
    - Early bins: mostly `false` (patient just admitted, on supports)
    - Transition window: probability of `true` increases as supports drop off, vitals stabilize
    - Late bins: mostly `true` (approaching real discharge)
  - `annotation.bins[].confidence` — normally distributed around model-specific means (e.g., Claude ~0.78, GPT-4o ~0.82, Gemini ~0.74) with noise
  - `annotation.bins[].reasoning` — short template strings
  - `annotation.overallAssessment` — template summary
- [ ] Inject **model-specific biases** to make comparisons interesting:
  - **Anthropic (Claude):** conservative — lower discharge-ready rate, higher confidence when saying "not ready"
  - **OpenAI (GPT-4o):** moderate — balanced, tends to agree with majority
  - **Gemini:** aggressive — slightly higher discharge-ready rate, lower average confidence
- [ ] Simulate realistic **cost & latency** metadata per model:
  - Token counts proportional to actual prompt sizes
  - Latency: Anthropic ~3–6s, OpenAI ~2–5s, Gemini ~1–3s
- [ ] Write output to `results/{provider}_predictions.jsonl` (same format as real runs)
- [ ] Write `results/run_metadata.json` with simulated token totals
- [ ] Support `--seed` for reproducibility

---

## Phase 7: Pareto Dashboard

### 7.1 — Pareto Front Analysis (`analysis/pareto_dashboard.py`)

Build an **interactive HTML dashboard** comparing the three models across multiple performance axes. The key insight of a Pareto analysis is identifying which models are *non-dominated* — i.e., no other model is strictly better on all metrics simultaneously.

**Metrics to compare (axes for Pareto fronts):**

| Metric | Source | Higher/Lower is better |
|--------|--------|----------------------|
| Agreement rate | % of bins matching majority vote | Higher ↑ |
| Mean confidence | Average `confidence` across all bins | Higher ↑ |
| Pairwise Cohen's κ | Average κ with other two models | Higher ↑ |
| Cost (total tokens) | `input_tokens + output_tokens` | Lower ↓ |
| Latency (mean per visit) | `elapsed_seconds` | Lower ↓ |
| Discharge-ready rate | % of bins labeled `true` | Informational |
| Confidence calibration | Brier score if ground truth available | Lower ↓ |

**Dashboard components:**

- [ ] **Pareto scatter: Cost vs. Agreement** — the primary trade-off plot. Each model is a point; Pareto-optimal models are highlighted and connected.
- [ ] **Pareto scatter: Latency vs. Agreement** — same idea for speed vs. quality.
- [ ] **Pareto scatter: Cost vs. Mean Confidence** — do you get more confident answers for more money?
- [ ] **Radar chart** — one polygon per model showing normalized scores on all 5+ axes.
- [ ] **Summary table** — all metrics side-by-side with Pareto-dominance column.
- [ ] **Per-visit agreement timeline** — interactive dropdown to select a visit and see all 3 models' labels over time.
- [ ] Generate a **self-contained HTML file** (no server needed) using Plotly.
- [ ] CLI: `python -m analysis.pareto_dashboard --results-dir results/`

---

## Phase 8: Conformal Prediction Analysis

### 8.1 — Conformal Prediction Framework (`analysis/conformal.py`)

Apply **conformal prediction** to the LLM confidence scores to produce prediction sets with **finite-sample coverage guarantees**. This is a rigorous statistical layer on top of the LLM outputs.

**Core idea:** Instead of taking the LLM's point prediction (`dischargeReady = true/false`), use conformal prediction to output a *set* of possible labels `{true}`, `{false}`, or `{true, false}` such that the true label is in the set with probability ≥ 1 − α.

**Method — Split Conformal with LLM Confidence as Nonconformity Score:**

- [ ] **Define nonconformity scores:**
  - For each bin, the LLM reports `(dischargeReady, confidence)`.
  - Score = `1 - confidence` if using the LLM's own label, or a cross-model score.
  - When the LLM says `dischargeReady=true` with confidence 0.9, the nonconformity score for the label `true` is 0.1 (low = conforms well).
- [ ] **Calibration / test split:**
  - Use majority-vote across models as a surrogate "ground truth" (since we don't have real labels).
  - Split visits into calibration set (e.g., 70%) and test set (30%).
  - On calibration set: compute nonconformity scores for each (bin, model) pair.
  - Compute the conformal quantile $\hat{q}$ at level $\lceil (1-\alpha)(n+1) \rceil / n$.
- [ ] **Prediction sets on test set:**
  - For each test bin, include label $y$ in the prediction set if its nonconformity score ≤ $\hat{q}$.
  - Report: singleton sets (confident), ambiguous sets `{true, false}` (uncertain), empty sets (should be rare with proper calibration).
- [ ] **Coverage analysis:**
  - Empirical coverage: fraction of test bins where the surrogate truth is in the prediction set.
  - Target: should be ≥ 1 − α (e.g., 90%) by the conformal guarantee.
  - Plot coverage vs. α for α ∈ {0.01, 0.05, 0.10, 0.15, 0.20}.
- [ ] **Efficiency analysis:**
  - Average prediction set size per model (smaller = more informative).
  - A model that produces mostly singletons at 90% coverage is better than one that produces mostly `{true, false}`.
- [ ] **Per-model comparison:**
  - Which model produces the tightest (smallest) prediction sets while maintaining coverage?
  - This is a more rigorous version of "which model is most calibrated."
- [ ] **Adaptive conformal (bonus):**
  - Condition on clinical context: compute separate conformal thresholds for subgroups (e.g., ventilated vs. non-ventilated, by care unit).
  - Check if conditional coverage holds or if there are coverage gaps in subgroups.
- [ ] **Output:**
  - CSV with per-bin prediction sets for each model.
  - Coverage plots (empirical vs. nominal α).
  - Efficiency comparison bar chart.
  - Summary table printed to console.
- [ ] CLI: `python -m analysis.conformal --results-dir results/ --alpha 0.10`

---

## Phase 9: Documentation & Reproducibility

- [ ] Add docstrings to all modules
- [ ] Create a `README.md` with:
  - Project description
  - Setup instructions (env, keys, install)
  - How to run (real + mock data)
  - How to interpret the Pareto dashboard
  - How to interpret conformal prediction results
- [ ] Ensure all randomness is seeded (temperature=0 for deterministic LLM outputs where possible)

---

## Execution Order (Suggested)

| Step | Task | Est. Effort |
|------|------|-------------|
| 1 | Phase 1: Setup (.env, requirements, directory structure) | 30 min |
| 2 | Phase 2.1: Data loader | 30 min |
| 3 | Phase 2.2: Prompt builder + output schema | 1 hr |
| 4 | Phase 3.1: Base annotator class | 30 min |
| 5 | Phase 3.2–3.4: All 3 LLM clients | 1.5 hr |
| 6 | Phase 4.1–4.3: Orchestrator + run.py | 1 hr |
| 7 | **Phase 6: Generate mock data** | 30 min |
| 8 | Test pipeline end-to-end with mock data | 15 min |
| 9 | Phase 5: Analysis + visualization | 1.5 hr |
| 10 | **Phase 7: Pareto dashboard** | 1.5 hr |
| 11 | **Phase 8: Conformal prediction analysis** | 2 hr |
| 12 | Full run with real APIs (140 visits × 3 models) | ~1–3 hr runtime |
| 13 | Re-run dashboard + conformal on real data | 15 min |
| 14 | Phase 9: Documentation | 30 min |

---

## Key Design Decisions

1. **Direct APIs:** Using each provider's native SDK (anthropic, openai, google-generativeai) for provider-specific features like OpenAI JSON mode and Gemini's response_mime_type.

2. **Granularity of Annotation:** Per-bin (6-hour) labeling rather than per-visit, giving a temporal resolution on discharge readiness that aligns with clinical decision-making.

3. **Structured Output:** Force JSON output with a defined schema. Use JSON mode where available (OpenAI) and validation + retry for others.

4. **Temperature 0:** Use temperature=0 for all models to maximize reproducibility.

5. **Cost Awareness:** 140 visits × 3 models = 420 LLM calls (one call per visit, not per bin). Prompt size varies (~1–5K tokens input per visit depending on bin count). Estimated cost: $3–20 depending on models. Track and report costs.
