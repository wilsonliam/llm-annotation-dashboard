"""
Build the system prompt and per-visit user prompt for LLM annotation.
"""

from __future__ import annotations

from typing import Any

import config


# ── System Prompt ────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """\
You are an experienced ICU physician reviewing a patient's ICU stay to assess \
discharge readiness at each 6-hour observation window (bin).

TASK
For every 6-hour bin in the stay, determine whether the patient appears \
clinically ready for ICU discharge at that point in time.  Consider:
  • Vital-sign trends (HR, RR, SpO2, MAP, FiO2, PEEP, tidal volume, etc.)
  • Laboratory values and their trajectories (glucose, potassium, pH, pCO2, lactate)
  • Active clinical supports — invasive ventilation, HFNC, vasoactives, CRRT, \
sedation, insulin drip.  A patient still requiring high-acuity supports \
(invasive vent, vasoactives, CRRT, heavy sedation) is generally NOT ready \
for discharge.
  • Clinical notes when present.
  • Whether the overall trajectory is improving, stable, or worsening.

OUTPUT FORMAT — return **only** valid JSON matching this schema exactly:
{
  "stayId": <integer>,
  "bins": [
    {
      "binIndex": <integer starting at 0>,
      "start": "<ISO 8601>",
      "end": "<ISO 8601>",
      "dischargeReady": <true | false>,
      "confidence": <float 0.0–1.0>,
      "reasoning": "<3–5 sentence clinical rationale: state the key finding driving your decision, note any supporting or contradicting signals, and describe the trajectory>"
    }
  ],
  "overallAssessment": "<brief summary of the stay and discharge trajectory>"
}

GUIDELINES
• Be conservative: if in doubt, label dischargeReady = false.
• Confidence should reflect your certainty (0.5 = coin flip, 1.0 = certain).
• Empty vitals/labs in a bin means no data was recorded — do not assume normal.
• Do NOT include any text outside the JSON object.\
"""


# ── Visit → User Prompt ─────────────────────────────────────────────────────

def _format_supports(supports: dict[str, Any]) -> str:
    active = [k for k, v in supports.items() if v]
    return ", ".join(active) if active else "none"


def _format_kv(d: dict[str, Any]) -> str:
    if not d:
        return "none recorded"
    return ", ".join(f"{k}={v}" for k, v in d.items())


def build_visit_prompt(visit: dict[str, Any]) -> str:
    """Serialise a visit dict into a readable clinical-style user prompt."""
    max_bins = config.MAX_BINS_PER_PROMPT
    bins = visit["bins"]
    if max_bins is not None:
        bins = bins[:max_bins]

    lines: list[str] = []
    lines.append(f"=== ICU STAY  stayId={visit['stayId']} ===")
    lines.append(f"Subject: {visit['subjectId']}  Admission: {visit['hadmId']}")
    lines.append(
        f"Care unit: {visit.get('firstCareunit', '?')}"
        + (
            f" → {visit['lastCareunit']}"
            if visit.get("lastCareunit") != visit.get("firstCareunit")
            else ""
        )
    )
    lines.append(f"Admitted: {visit.get('intime', '?')}")
    lines.append(f"Discharged: {visit.get('outtime', '?')}")

    lv = visit.get("latestVitals") or {}
    ll = visit.get("latestLabs") or {}
    if lv:
        lines.append(f"Latest vitals at discharge: {_format_kv(lv)}")
    if ll:
        lines.append(f"Latest labs at discharge: {_format_kv(ll)}")

    lines.append(f"\nTotal bins: {len(bins)}")
    lines.append("─" * 60)

    for i, b in enumerate(bins):
        lines.append(f"\n[Bin {i}]  {b['start']}  →  {b['end']}")
        lines.append(f"  Supports : {_format_supports(b.get('supports', {}))}")
        lines.append(f"  Vitals   : {_format_kv(b.get('vitals', {}))}")
        lines.append(f"  Labs     : {_format_kv(b.get('labs', {}))}")
        notes = b.get("notes", [])
        if notes:
            for n in notes:
                lines.append(f"  Note     : {n}")

    lines.append("─" * 60)
    lines.append(
        "Now assess each bin for ICU discharge readiness.  "
        "Return ONLY the JSON object described in your instructions."
    )
    return "\n".join(lines)
