"""Post-master validation gate (Layer 2) — pure comparison logic.

Compares the MEASURED master metrics against the active preset chain
targets. No DSP, no I/O — trivially unit-testable. The caller decides
whether to retry processing; this module only judges.
"""
from __future__ import annotations

from audiomind.models.audio import AnalysisResult, MasterResultMetrics

# ── Layer 2 tolerances ────────────────────────────────────────────────
LUFS_TOLERANCE_DB = 1.5      # |measured − target| above this → issue
CREST_MINIMUM_DB = 6.0       # below this → over-compressed
TRUE_PEAK_MARGIN_DB = 0.1    # measured above ceiling + margin → issue
LOW_CONFIDENCE_THRESHOLD = 0.6  # below → suggest "universal" on warning


def _lufs_issue(measured: float, target: float) -> dict:
    delta = measured - target
    direction = "bajo" if delta < 0 else "alto"
    return {
        "metric": "lufs",
        "measured": float(measured),
        "expected": f"{target:g} LUFS ±{LUFS_TOLERANCE_DB:g}",
        "message_es": (
            f"El master quedó {abs(delta):.1f} LUFS más {direction} "
            "que el objetivo"
        ),
    }


def _crest_issue(measured: float) -> dict:
    return {
        "metric": "crest",
        "measured": float(measured),
        "expected": f"≥ {CREST_MINIMUM_DB:g} dB",
        "message_es": (
            f"El master está sobre-comprimido "
            f"(crest {measured:.1f} dB)"
        ),
    }


def _true_peak_issue(measured: float, ceiling: float) -> dict:
    excess = measured - ceiling
    return {
        "metric": "true_peak",
        "measured": float(measured),
        "expected": f"≤ {ceiling:g} dB",
        "message_es": (
            f"El pico real superó el techo del preset en {excess:.1f} dB"
        ),
    }


def validate_master(
    master_result: MasterResultMetrics | None,
    preset: dict,
    analysis: AnalysisResult | None = None,
) -> dict | None:
    """Judge the measured master against the active preset targets.

    Args:
        master_result: Measured output metrics (may be None or hold null
            fields when measurement failed — never treated as an issue).
        preset: Active ``PRESET_CHAINS`` entry (target_lufs,
            limiter_ceiling_db).
        analysis: Input analysis, used only for the genre-confidence
            fallback suggestion.

    Returns:
        Verdict dict with ``status``, ``issues``, ``retry_recommended``
        and ``suggested_preset_id`` — or None when there is nothing
        measurable to validate (callers keep ``validation`` null).
    """
    if master_result is None:
        return None

    issues: list[dict] = []

    target_lufs = preset.get("target_lufs")
    ceiling = preset.get("limiter_ceiling_db")

    lufs = master_result.integrated_lufs
    crest = master_result.crest_factor_db
    peak = master_result.true_peak_db

    if lufs is not None and target_lufs is not None:
        if abs(lufs - target_lufs) > LUFS_TOLERANCE_DB:
            issues.append(_lufs_issue(lufs, target_lufs))

    if crest is not None and crest < CREST_MINIMUM_DB:
        issues.append(_crest_issue(crest))

    if peak is not None and ceiling is not None:
        if peak > ceiling + TRUE_PEAK_MARGIN_DB:
            issues.append(_true_peak_issue(peak, ceiling))

    # Nothing measurable at all (failed best-effort measurement)
    if lufs is None and crest is None and peak is None:
        return None

    status = "warning" if issues else "ok"

    confidence = (
        analysis.genre_confidence
        if analysis is not None and analysis.genre_confidence is not None
        else 0.0
    )
    suggested_preset_id = (
        "universal" if status != "ok" and confidence < LOW_CONFIDENCE_THRESHOLD else None
    )

    return {
        "status": status,
        "issues": issues,
        "retry_recommended": status != "ok",
        "suggested_preset_id": suggested_preset_id,
    }
