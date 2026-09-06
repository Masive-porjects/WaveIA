"""Album/EP batch mastering — relative LUFS/DR target negotiation (Phase D).

P1-2 of the DSP industry review: an album must sound like ONE release, so
tracks are mastered toward a COMMON loudness base with per-track offsets
derived from their dynamic range (EBU 3342-style LRA). This module is pure
Python — no FastAPI, no DSP, no I/O — so the negotiation math is trivially
unit-testable and reusable by any caller.

Model (TC Electronic / Nugen-style "relative loudness"): perceptual
uniformity in sequence. A track with MORE dynamic range has lower energy
density per unit of loudness, so it needs a slightly HIGHER integrated-LUFS
target to feel equally loud next to denser tracks; a dense track needs a
LOWER target. The offset per LU of LRA deviation from the album median is
``ALBUM_LRA_SLOPE_DB_PER_LU``, clamped to ±``ALBUM_MAX_RELATIVE_OFFSET_DB``
so no track drifts more than 2 dB from the album base.

Neutral contract: the negotiation only PRODUCES a ``target_lufs_db`` number
per track; it never touches audio. A track without a measurable LRA keeps
the album base exactly, so the existing single-track pipeline is unchanged.
"""

from __future__ import annotations

import statistics

# ── Negotiation constants ────────────────────────────────────────────────

# Album-wide loudness base when no explicit album target is provided.
DEFAULT_ALBUM_TARGET_LUFS_DB = -14.0

# Relative loudness offset per LU of LRA deviation from the album median.
ALBUM_LRA_SLOPE_DB_PER_LU = 0.25

# Clamp: no track drifts more than ±2 dB from the album base.
ALBUM_MAX_RELATIVE_OFFSET_DB = 2.0

# Output tolerance for the album report (matches validation.py's
# LUFS_TOLERANCE_DB). Used ONLY for report warnings — never a retry.
ALBUM_LUFS_TOLERANCE_DB = 1.5


def _clamp_offset(offset_db: float) -> float:
    """Clamp a relative offset to ±ALBUM_MAX_RELATIVE_OFFSET_DB."""
    return max(
        -ALBUM_MAX_RELATIVE_OFFSET_DB,
        min(ALBUM_MAX_RELATIVE_OFFSET_DB, offset_db),
    )


def negotiate_targets(
    lras: list[float | None],
    base_lufs_db: float | None = None,
) -> list[float | None]:
    """Negotiate one loudness target per track for an album/EP master.

    Args:
        lras: One EBU 3342-style LRA value (LU) per track, in album order;
            None marks tracks whose dynamics could not be measured.
        base_lufs_db: Album-wide loudness base. None → the default (-14.0).

    Returns:
        One target per input track, same order. ``target = round(base +
        offset, 1)`` where ``offset`` is the LRA deviation from the album
        median scaled by ``ALBUM_LRA_SLOPE_DB_PER_LU`` and clamped to
        ±``ALBUM_MAX_RELATIVE_OFFSET_DB``. Tracks without a measurable LRA
        keep the base unchanged. Never raises: an empty input yields an
        empty list and an all-None LRA list yields all-base values.
    """
    if not lras:
        return []
    base = base_lufs_db if base_lufs_db is not None else DEFAULT_ALBUM_TARGET_LUFS_DB
    valid = [lra for lra in lras if lra is not None]
    if not valid:
        return [base] * len(lras)
    median = statistics.median(valid)
    targets: list[float | None] = []
    for lra in lras:
        if lra is None:
            targets.append(base)
            continue
        offset = _clamp_offset((lra - median) * ALBUM_LRA_SLOPE_DB_PER_LU)
        targets.append(round(base + offset, 1))
    return targets