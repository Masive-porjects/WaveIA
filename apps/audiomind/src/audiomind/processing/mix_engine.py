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
Paso 02 routing (no pan, no ``pan_report`` key).

Neutrality contract (spec 08): in the backend a neutral parameter equals
bit-identical audio; the routing equivalent of that contract is 0 dB
gains with 1:1 summing. The recombined mix is NOT bit-exact to the
original because Demucs separation is lossy by nature — accepted and
documented (pitfall 7). The EQ passthrough itself (empty/zero bands) IS
bit-exact.
"""

from __future__ import annotations

from collections import Counter
from pathlib import Path
from typing import Any

import numpy as np
import soundfile as sf

from audiomind.config import settings
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
) -> dict[str, Any]:
    """Run the per-stem routing pipeline for a session.

    Args:
        session_id: Session UUID — owns the stems dir and the output file.
        input_path: Source audio to separate.
        profiles: Per-stem EQ band lists applied AFTER the pan, before
            the bus sum (Paso 02: magic frequencies, Owsinski pág. 32).
            ``None`` ⇒ ``MAGIC_PROFILES`` (default); pass ``{}`` or
            all-zero-gain bands to keep the Paso 01 NEUTRAL routing
            (bit-exact bypass per stem).
        pan_profiles: Per-stem role profiles for the positional validation
            (Paso 03: ``panorama.PAN_ROLE_PROFILES``). ``None`` ⇒ role pan
            ENABLED by default (Paso 03 behaviour). Pass ``{}`` to disable
            pan entirely — routing identical to Paso 02 (no pan applied,
            no ``pan_report`` key). A custom dict maps stem names to
            ``{"role": "center"|"wide", "target_max_abs_balance_db",
            "max_correction_db"}``.

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
            "pan_report": {...}   # Paso 03, absent when pan_profiles={}
        }``
        where each per-stem analysis dict carries ``integrated_lufs``,
        ``dynamic_range_db``, ``spectral_centroid`` and ``sample_rate``,
        ``eq_profiles_applied`` records the bands requested per stem
        (a stem with no profile / zero gains still appears only if a
        profile was passed for it; ``profiles={}`` ⇒ ``{}``), and
        ``pan_report`` is the positional validation of
        ``panorama.validate_positions`` (roles / stems / mono_check /
        human_decision).

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

    resampled_stems: dict[str, np.ndarray] = {}
    for name, (audio, stem_sr) in zip(STEM_NAMES, reads, strict=True):
        resampled_stems[name] = resample_audio(audio, stem_sr, target_sr)

    pan_report: dict[str, Any] | None = None
    if pan_profiles:
        resampled_stems, pan_report = validate_positions(
            resampled_stems, pan_profiles
        )

    # Apply the stem EQ profile AFTER the pan, before pad + 1:1 sum —
    # every instrument lands on the bus already shaped (Paso 02).
    bus_audio: list[np.ndarray] = []
    eq_profiles_applied: dict[str, list[dict[str, Any]]] = {}
    for name in STEM_NAMES:
        shaped = resampled_stems[name]
        bands = profiles.get(name, [])
        if bands:
            # All-zero gains bypass bit-exactly inside apply_stem_eq.
            shaped = apply_stem_eq(shaped, target_sr, bands)
            eq_profiles_applied[name] = bands
        bus_audio.append(shaped)

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
    return build_result
