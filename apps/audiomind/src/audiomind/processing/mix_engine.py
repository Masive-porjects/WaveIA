"""Mix Engine — per-stem routing (Paso 02: split → EQ mágico → bus).

Skeleton of the live Mix Engine: takes a session's audio, runs source
separation through ``split_audio`` (Demucs), routes every stem onto a
stereo mono-compatible bus, pads each stem to the longest one, writes the
result with ``write_output`` and produces per-stem analysis (LUFS /
dynamic range / spectral centroid) plus full-mix analysis (tempo / genre
/ confidence).

Since Paso 02 each stem follows the DAW chain (fader → pan → EQ →
compresor → sends, ``VIABILIDAD_MOTOR_DE_MEZCLA.md`` línea 214): Paso 02
added the EQ (``magic_frequencies.py``, Owsinski pág. 32 — cuts first →
boosts after), Paso 03 inserts the role PAN *before* the EQ plus the
positional validation (``panorama.py``): vocals/bass/drums → center,
other → inside the extremes, gross violations clamped-corrected with a
−3 dB pan law, mono check on the resulting bus. ``profiles={}`` restores
the Paso 01 NEUTRAL routing for EQ; ``pan_profiles={}`` keeps the exact
Paso 02 routing (no pan, no ``pan_report`` key). Paso 04 inserts the
TEMPO DIMENSION right after the EQ and before the pad/sum
(``dimension.py``: tempo delay + Schroeder reverb per stem with pre-delay
and return EQ by layering; ``dimension_profiles={}`` restores the exact
Paso 03 routing — no dimension, no ``dimension_report`` key; the
compressor arrives in Paso 05, inserted BEFORE the sends).

Neutrality contract (spec 08): in the backend a neutral parameter equals
bit-identical audio; the routing equivalent of that contract is 0 dB
gains with 1:1 summing. The recombined mix is NOT bit-exact to the
original because Demucs separation is lossy by nature — accepted and
documented (pitfall 7). The EQ passthrough itself (empty/zero bands) IS
bit-exact, and the dimension stage is a same-object no-op when its
profiles/mix are neutral (or no valid tempo exists — Alex guard).
"""

from __future__ import annotations

from collections import Counter
from pathlib import Path
from typing import Any

import numpy as np
import soundfile as sf

from audiomind.config import settings
from audiomind.processing.dimension import (
    DIMENSION_PROFILES,
    apply_stem_dimension,
)
from audiomind.processing.io_write import write_output
from audiomind.processing.magic_frequencies import MAGIC_PROFILES, apply_stem_eq
from audiomind.processing.panorama import PAN_ROLE_PROFILES, validate_positions
from audiomind.processing.resample import resample_audio
from audiomind.processing.splitter import STEM_NAMES, split_audio

#: Per-stem fields extracted from ``AnalysisResult`` (spec: LUFS/DR/centroid).
_STEM_ANALYSIS_FIELDS: tuple[str, ...] = (
    "integrated_lufs",
    "dynamic_range_db",
    "spectral_centroid",
    "sample_rate",
)


#: Layering rule reported by the dimension stage (book págs. 37–38).
_DIMENSION_LAYERING_NOTE = "longest reverb brightest, shortest darkest"


def _measure_input_bpm(input_path: str | Path) -> float | None:
    """Tempo of the source via librosa (same measurement as the analyzer).

    Mirrors ``analysis/analyzer.py`` (``librosa.beat.beat_track`` on the
    mono load, with the scalar/array tolerance of librosa 1.x) so the
    dimension stage and the full-mix analysis agree on the tempo
    definition. Returns ``None`` when the file is missing/undecodable or
    the beat tracker reports no tempo (≤ 0) — the dimension stage then
    degrades to the neutral ``no_tempo`` report, never a crash (Alex
    guard: dimension only applies with a valid tempo). Lazy librosa
    import, same policy as the analyzer.
    """
    try:
        import librosa

        y, sr = librosa.load(str(input_path), sr=None, mono=True)
        tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
        tempo_flat = np.asarray(tempo).reshape(-1)
        tempo_val = float(tempo_flat[0]) if tempo_flat.size > 0 else 0.0
    except Exception:
        return None
    if not (np.isfinite(tempo_val) and tempo_val > 0.0):
        return None
    return float(tempo_val)


#: Per-stem dimension entry for the no-tempo case (all neutral).
_DIMENSION_NO_TEMPO_ENTRY: dict[str, Any] = {
    "delay": {"subdivision": None, "ms": None},
    "reverb": {"size": None, "mix": None, "pre_delay_ms": None,
               "return_eq": "neutral"},
    "applied": False,
}


def _dimension_stem_entry(
    stem_report: dict[str, Any], profile: dict[str, Any],
) -> dict[str, Any]:
    """Normalize one ``apply_stem_dimension`` report into the
    ``dimension_report["stems"][stem]`` shape (delay/reverb values come
    from the report, the configured mix/subdivision from the profile)."""
    if stem_report.get("reason") == "no_tempo":
        return dict(_DIMENSION_NO_TEMPO_ENTRY)
    reverb_cfg = profile.get("reverb") or {}
    delay_cfg = profile.get("delay") or {}
    return {
        "delay": {
            "subdivision": delay_cfg.get("subdivision"),
            "ms": stem_report.get("delay_ms"),
        },
        "reverb": {
            "size": stem_report.get("reverb_size"),
            "mix": reverb_cfg.get("mix"),
            "pre_delay_ms": stem_report.get("pre_delay_ms"),
            "return_eq": reverb_cfg.get("return_eq", "neutral"),
        },
        "applied": stem_report.get("applied", False),
    }


def _read_stem_channels(stem_path: str | Path) -> tuple[np.ndarray, int]:
    """Read a stem WAV into channels-first float audio.

    ``sf.SoundFile.read(always_2d=True)`` returns ``(samples, channels)``;
    transpose to the ``(channels, samples)`` layout expected by
    ``measure_lufs`` and ``write_output`` (pitfall 1).
    """
    with sf.SoundFile(str(stem_path), "r") as f:
        sr = int(f.samplerate)
        frames = f.read(dtype="float32", always_2d=True)
    return frames.T, sr


def _common_sr(stem_srs: list[int]) -> int:
    """Pick the bus sample rate: most common stem rate, ties → highest.

    Demucs writes 44.1 kHz stems; when a stem diverges the whole bus is
    resampled to the common rate so every stem lands on one grid
    (pitfall 2).
    """
    if not stem_srs:
        return settings.sample_rate
    counts = Counter(stem_srs)
    return max(counts, key=lambda sr: (counts[sr], sr))


def build_mix(
    session_id: str,
    input_path: str | Path,
    profiles: dict[str, list[dict[str, Any]]] | None = None,
    pan_profiles: dict[str, dict[str, Any]] | None = None,
    dimension_profiles: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Run the per-stem routing pipeline for a session.

    Args:
        session_id: Session UUID — owns the stems dir and the output file.
        input_path: Source audio to separate.
        profiles: Per-stem EQ band lists applied AFTER the pan, before
            the dimension/bus sum (Paso 02: magic frequencies, Owsinski
            pág. 32). ``None`` ⇒ ``MAGIC_PROFILES`` (default); pass
            ``{}`` or all-zero-gain bands to keep the Paso 01 NEUTRAL
            routing (bit-exact bypass per stem).
        pan_profiles: Per-stem role profiles for the positional validation
            (Paso 03: ``panorama.PAN_ROLE_PROFILES``). ``None`` ⇒ role pan
            ENABLED by default (Paso 03 behaviour). Pass ``{}`` to disable
            pan entirely — routing identical to Paso 02 (no pan applied,
            no ``pan_report`` key). A custom dict maps stem names to
            ``{"role": "center"|"wide", "target_max_abs_balance_db",
            "max_correction_db"}``.
        dimension_profiles: Per-stem tempo-dimension profiles (Paso 04:
            ``dimension.DIMENSION_PROFILES`` — tempo delay + reverb with
            pre-delay and return EQ). ``None`` ⇒ dimension ENABLED by
            default (Paso 04 behaviour); the BPM is measured ONCE from
            ``input_path`` via librosa (same measurement as the analyzer)
            and applied after the EQ, before the pad/sum. Pass ``{}`` to
            disable dimension — routing identical to Paso 03 (no
            ``dimension_report`` key). A custom dict maps stem names to
            ``{"reverb": {...}, "delay": {...}}``; unmapped stems pass
            through untouched and do not appear in the report. Without a
            valid tempo the stage degrades to the neutral ``no_tempo``
            report, never a crash (Alex guard).

    Returns:
        ``{
            "mix_path": "<outputs/{session_id}_mix.wav>",
            "sample_rate": int,
            "duration_seconds": float,
            "analysis": {"drums": {...}, "bass": {...},
                         "other": {...}, "vocals": {...}},
            "tempo_bpm": float,
            "genre": str,
            "genre_confidence": float,
            "eq_profiles_applied": {"drums": [...], "bass": [...],
                                    "other": [...], "vocals": [...]},
            "pan_report": {...},       # Paso 03, absent when pan_profiles={}
            "dimension_report": {...}  # Paso 04, absent when dimension disabled
        }``
        where each per-stem analysis dict carries ``integrated_lufs``,
        ``dynamic_range_db``, ``spectral_centroid`` and ``sample_rate``,
        ``eq_profiles_applied`` records the bands requested per stem
        (a stem with no profile / zero gains still appears only if a
        profile was passed for it; ``profiles={}`` ⇒ ``{}``),
        ``pan_report`` is the positional validation of
        ``panorama.validate_positions`` (roles / stems / mono_check /
        human_decision), and ``dimension_report`` is
        ``{"bpm_used": float|None, "stems": {stem: {"delay":
        {"subdivision", "ms"}, "reverb": {"size", "mix", "pre_delay_ms",
        "return_eq"}, "applied"}}, "layering": {"note":
        "longest reverb brightest, shortest darkest"}, "status":
        "active"|"no_tempo"}`` — a missing lambda-key
        ``dimension_profiles={}`` keeps the exact Paso 03 result dict.

    Raises:
        ValueError: When ``split_audio`` does not produce all 4 stems.
    """
    stems_dir = settings.output_dir / session_id / "stems"
    split_result = split_audio(input_path, output_dir=stems_dir)
    stems = split_result["stems"]

    missing = [name for name in STEM_NAMES if name not in stems]
    if missing:
        raise ValueError(f"split_audio missing stems: {', '.join(missing)}")

    # Read + resample every stem to the common bus rate. Paso 03 measures
    # the M/S position on the RESAMPLED stem (before any correction) and
    # applies the role PAN (vocals/bass/drums → center, other → inside the
    # extremes) BEFORE the EQ — the DAW chain: fader → pan → EQ → compresor
    # → sends (VIABILIDAD línea 214).
    reads = [_read_stem_channels(stems[name]) for name in STEM_NAMES]
    target_sr = _common_sr([sr for _, sr in reads])
    profiles = MAGIC_PROFILES if profiles is None else profiles
    pan_profiles = PAN_ROLE_PROFILES if pan_profiles is None else pan_profiles
    dimension_profiles = (
        DIMENSION_PROFILES if dimension_profiles is None else dimension_profiles
    )
    dimension_enabled = bool(dimension_profiles)

    # Paso 04: measure the tempo ONCE from the INPUT (same librosa
    # measurement as the analyzer). No valid tempo → neutral "no_tempo"
    # dimension, never a crash (Alex guard).
    bpm_used: float | None = None
    if dimension_enabled:
        bpm_used = _measure_input_bpm(input_path)
        if bpm_used is not None:
            bpm_used = round(bpm_used, 1)

    resampled_stems: dict[str, np.ndarray] = {}
    for name, (audio, stem_sr) in zip(STEM_NAMES, reads, strict=True):
        resampled_stems[name] = resample_audio(audio, stem_sr, target_sr)

    pan_report: dict[str, Any] | None = None
    if pan_profiles:
        resampled_stems, pan_report = validate_positions(
            resampled_stems, pan_profiles
        )

    # Apply the stem EQ profile AFTER the pan, then the tempo dimension
    # (Paso 04) RIGHT AFTER the EQ — the DAW chain places the sends after
    # the compressor (Paso 05 inserts it before the sends). Every
    # instrument lands on the bus already shaped.
    bus_audio: list[np.ndarray] = []
    eq_profiles_applied: dict[str, list[dict[str, Any]]] = {}
    dimension_stems_report: dict[str, Any] = {}
    for name in STEM_NAMES:
        shaped = resampled_stems[name]
        bands = profiles.get(name, [])
        if bands:
            # All-zero gains bypass bit-exactly inside apply_stem_eq.
            shaped = apply_stem_eq(shaped, target_sr, bands)
            eq_profiles_applied[name] = bands
        dim_profile = dimension_profiles.get(name) if dimension_enabled else None
        if dim_profile is not None:
            shaped, stem_report = apply_stem_dimension(
                shaped, target_sr, bpm_used, dim_profile
            )
            dimension_stems_report[name] = _dimension_stem_entry(
                stem_report, dim_profile
            )
        bus_audio.append(shaped)

    dimension_report: dict[str, Any] | None = None
    if dimension_enabled:
        dimension_report = {
            "bpm_used": bpm_used,
            "stems": dimension_stems_report,
            "layering": {"note": _DIMENSION_LAYERING_NOTE},
            "status": "active" if bpm_used is not None else "no_tempo",
        }

    # Pad to the longest stem and sum onto the stereo mono-compatible bus.
    # Neutral 0 dB = 1:1 summing (no normalization); a hot sum just clips
    # at write time — accepted for the skeleton (no DSP yet).
    max_len = max(audio.shape[1] for audio in bus_audio)
    bus = np.zeros((2, max_len), dtype=np.float32)
    for audio in bus_audio:
        bus[:, : audio.shape[1]] += audio

    mix_path = (settings.output_dir / f"{session_id}_mix.wav").resolve()
    write_output(bus, mix_path, target_sr, bit_depth=24)

    # Analysis is heavy (librosa) — lazy import, same policy as mastering.
    from audiomind.analysis.analyzer import analyze_audio

    analysis: dict[str, dict[str, Any]] = {}
    for name in STEM_NAMES:
        result = analyze_audio(stems[name])
        analysis[name] = {
            field: getattr(result, field) for field in _STEM_ANALYSIS_FIELDS
        }

    mix_result = analyze_audio(mix_path)
    build_result: dict[str, Any] = {
        "mix_path": str(mix_path),
        "sample_rate": target_sr,
        "duration_seconds": round(mix_result.duration_seconds, 2),
        "analysis": analysis,
        "tempo_bpm": mix_result.tempo_bpm,
        "genre": mix_result.detected_genre,
        "genre_confidence": mix_result.genre_confidence,
        "eq_profiles_applied": eq_profiles_applied,
    }
    if pan_report is not None:
        build_result["pan_report"] = pan_report
    if dimension_report is not None:
        build_result["dimension_report"] = dimension_report
    return build_result
