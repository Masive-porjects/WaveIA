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
TEMPO DIMENSION right after the EQ (``dimension.py``: tempo delay +
Schroeder reverb per stem with pre-delay and return EQ by layering;
``dimension_profiles={}`` restores the exact Paso 03 routing — no
dimension, no ``dimension_report`` key). PASO 05 inserted the
 COMPRESSOR between the EQ and the dimension/sends (``dynamics.py`` —
 book recipes per stem, drums by spectral segment through the existing
 ``LinkwitzRiley4``, breathing at tempo from the measured BPM) and
 compresses the STEREO BUS after the stem sum (Jerry Finn technique, 2–3
 dB total); ``compressor_profiles={}`` restores the exact Paso 04 routing
 — no compressor, no ``compressor_report`` key. PASO 06 (this step) adds
 the GENRE EMPHASIS — the "Interest" balance of the book (Ch8 pág. 58–60,
 the plan's honest mitigation of the last least-automatable element): the
 genre detected on the source maps into a vocal-forward/groove-forward
 weight pair (``emphasis.py``) that scales the per-stem dimension sends
 INSIDE the engine's standard ranges (reverb mix/size, delay mix) and the
 bus GR target inside the 2–3 dB recipe band; unknown genre or confidence
 below ``CONFIDENCE_THRESHOLD`` falls back to the NEUTRAL 0.5/0.5 weights
 — the exact Paso 05 routing — and ``emphasis_profiles={}`` restores that
 routing unconditionally (no ``emphasis_report`` key). Final per-stem
 chain: pan → EQ → compressor → dimension(sends) → bus; the bus
 compresses after the sum.

Neutrality contract (spec 08): in the backend a neutral parameter equals
bit-identical audio; the routing equivalent of that contract is 0 dB
gains with 1:1 summing. The recombined mix is NOT bit-exact to the
original because Demucs separation is lossy by nature — accepted and
documented (pitfall 7). The EQ passthrough itself (empty/zero bands) IS
bit-exact, the dimension stage is a same-object no-op when its
profiles/mix are neutral (or no valid tempo exists — Alex guard), and
the compressor stage is a same-object no-op for ``None``/empty/ratio-1:1
profiles (``apply_stem_compression`` enforces the same-object guarantee
because ``adaptive_comp`` returns a copy in ratio-1 mode — documented in
``dynamics.py``). The Paso 06 emphasis scaling is another neutral no-op:
at 0.5/0.5 weights the multipliers are exactly 1.0 (scaled profiles
carry the base values) and the bus falls back to the original
``apply_bus_compression`` path whenever the scaled GR target equals the
base one — identical value, identical behaviour.
"""

from __future__ import annotations

from collections import Counter
from pathlib import Path
from typing import Any

import numpy as np
import soundfile as sf

from audiomind.config import settings
from audiomind.processing.adaptive_comp import AdaptiveCompressor
from audiomind.processing.dimension import (
    DIMENSION_PROFILES,
    apply_stem_dimension,
)
from audiomind.processing.dynamics import (
    BUS_COMPRESSOR_PROFILE,
    BUS_GR_MAX_DB,
    BUS_TECHNIQUE_NOTE,
    STEM_COMPRESSOR_PROFILES,
    _nominal_times,
    _params_from_profile,
    apply_bus_compression,
    apply_stem_compression,
)
from audiomind.processing.emphasis import (
    GENRE_EMPHASIS_PROFILES,
    resolve_emphasis,
    scale_bus_profile,
    scale_dimension_profile,
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


def _measure_input_genre(
    input_path: str | Path,
) -> tuple[str | None, float | None]:
    """Genre of the source audio (label + confidence) via the analyzer.

    The full-mix analysis at the end of ``build_mix`` runs on the
    REFINED mix — too late for the Paso 06 emphasis stage, which must
    know the material's direction BEFORE routing the stems. This hook
    measures the genre of the INPUT with the SAME detector the analyzer
    ships (``analyze_audio``; the ``_detect_genre`` rule set: pop, rock,
    electronic, hip_hop, reggaeton, jazz, classical, acoustic, metal,
    other — confidence 0.30–0.85). Returns ``(None, None)`` when the
    file is missing/undecodable — the emphasis stage then degrades to
    the NEUTRAL fallback, never a crash (Alex guard, same policy as
    ``_measure_input_bpm``). Lazy import, same policy as the analyzer.
    """
    try:
        from audiomind.analysis.analyzer import analyze_audio

        result = analyze_audio(str(input_path))
        return result.detected_genre, result.genre_confidence
    except Exception:
        return None, None


def _apply_scaled_bus_compression(
    bus: np.ndarray,
    sr: int,
    bpm: float | None,
    profile: dict[str, Any],
) -> tuple[np.ndarray, dict[str, Any]]:
    """Jerry Finn mix-bus compressor pass with an explicit profile.

    Mirror of ``dynamics.apply_bus_compression`` (same silent/empty
    no-op guard, same ``AdaptiveCompressor`` pass, same report keys)
    that takes the profile as an argument instead of the module constant
    — the Paso 06 emphasis stage moves the GR target INSIDE the 2–3 dB
    recipe band (``scale_bus_profile``) without touching ``dynamics.py``
    (fixed Paso 05 API). Reuses the dynamics helpers verbatim; the extra
    ``bus_gr_target_db`` metadata key is ignored by ``_params_from_profile``
    (reads its known keys only).
    """
    x = np.asarray(bus)
    if x.size == 0 or not np.any(x):
        attack, release = _nominal_times(profile, bpm)
        return bus, {
            "gr_db": 0.0,
            "gr_ok": True,
            "technique": BUS_TECHNIQUE_NOTE,
            "ratio": float(profile.get("ratio", 1.0)),
            "attack_ms": attack,
            "release_ms": release,
        }

    params = _params_from_profile(profile, bpm)
    out, diag = AdaptiveCompressor(sr, params).process_with_diagnostics(x)
    gr_db = round(abs(float(diag["mean_gr_db"])), 2)
    return out, {
        "gr_db": gr_db,
        "gr_ok": bool(gr_db <= BUS_GR_MAX_DB),
        "technique": BUS_TECHNIQUE_NOTE,
        "ratio": params.ratio,
        "attack_ms": params.attack_ms,
        "release_ms": params.release_ms,
    }


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
    compressor_profiles: dict[str, dict[str, Any]] | None = None,
    emphasis_profiles: dict[str, dict[str, Any]] | None = None,
    genre: str | None = None,
    genre_confidence: float | None = None,
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
        compressor_profiles: Per-stem compressor recipes (Paso 05:
            ``dynamics.STEM_COMPRESSOR_PROFILES`` — book recipes per
            role, drums by spectral segment, breathing at tempo). ``None``
            ⇒ compressors ENABLED by default (Paso 05 behaviour): the
            BPM measured once from ``input_path`` (same measurement as
            the dimension stage) feeds the beat-locked release, each stem
            is compressed AFTER the EQ and BEFORE the dimension/sends
            (final chain: pan → EQ → compressor → dimension/sends →
            bus), and the stereo bus compresses AFTER the stem sum with
            the Jerry Finn technique (``dynamics.apply_bus_compression``,
            2–3 dB total, ``gr_ok`` ≤ 3.1 dB). Pass ``{}`` to disable the
            compressors entirely — routing identical to Paso 04 (no
            ``compressor_report`` key). A custom dict maps stem names to
            recipe dicts; unmapped stems pass through untouched and do
            not appear in the report (panorama convention), while the bus
            stage stays active whenever the compressors are enabled.
        emphasis_profiles: Per-genre emphasis weights (Paso 06:
            ``emphasis.GENRE_EMPHASIS_PROFILES`` — the "Interest" balance
            of the book, Ch8 pág. 58–60: every analyzer genre maps to a
            vocal-forward/groove-forward pair, "Dance/Rap → énfasis en
            groove (kick/bajo); Country/Pop → énfasis en vocal"). ``None``
            ⇒ emphasis ENABLED by default (Paso 06 behaviour): the genre
            scales the per-stem dimension sends (reverb mix/size, delay
            mix — INSIDE the engine's standard ranges) and the bus GR
            target (inside the 2–3 dB recipe band). Pass ``{}`` to
            disable emphasis — routing identical to Paso 05 (no
            ``emphasis_report`` key). A custom dict maps genre labels to
            ``{"vocal_forward": float, "groove_forward": float}`` pairs
            in [0, 1] summing to 1.0.
        genre: Explicit genre label — overrides the source measurement.
            ``None`` ⇒ measured from ``input_path`` with the analyzer's
            own detector (``analyze_audio``, lazy import) when emphasis
            is enabled; a missing/undecodable input degrades to the
            NEUTRAL fallback, never a crash (Alex guard).
        genre_confidence: Confidence of the ``genre`` label (the
            analyzer's 0.30–0.85 scale). Below ``CONFIDENCE_THRESHOLD``
            (0.5, documented in ``emphasis.py``) the label is reported
            but NOT followed — neutral fallback. ``None`` means no
            confidence information: the label is trusted (the caller
            asserts it).

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
            "compressor_report": {...} # Paso 05, absent when compressors disabled
            "emphasis_report": {...}   # Paso 06, absent when emphasis disabled
        }``
        where each per-stem analysis dict carries ``integrated_lufs``,
        ``dynamic_range_db``, ``spectral_centroid`` and ``sample_rate``,
        ``eq_profiles_applied`` records the bands requested per stem
        (a stem with no profile / zero gains still appears only if a
        profile was passed for it; ``profiles={}`` ⇒ ``{}``),
        ``pan_report`` is the positional validation of
        ``panorama.validate_positions`` (roles / stems / mono_check /
        human_decision), ``dimension_report`` is
        ``{"bpm_used": float|None, "stems": {stem: {"delay":
        {"subdivision", "ms"}, "reverb": {"size", "mix", "pre_delay_ms",
        "return_eq"}, "applied"}}, "layering": {"note":
        "longest reverb brightest, shortest darkest"}, "status":
        "active"|"no_tempo"}`` and ``compressor_report`` is
        ``{"stems": {stem: {"gr_db": float, "ratio": float, "status":
        "applied"|"neutral"}}, "bus": {"gr_db": float, "gr_ok": bool,
        "technique": "jerry_finn_slow_attack_fast_release"}, "status":
        "active"}`` — a missing lambda-key ``compressor_profiles={}``
        keeps the exact Paso 04 result dict, and ``emphasis_report`` is
        ``{"genre": str, "genre_confidence": float|None,
        "vocal_forward": float, "groove_forward": float, "scaling":
        {"dimension": {stem: scaled send values}, "bus_gr_target_db":
        float (present only when the bus compressor is enabled)},
        "status": "active"|"neutral_fallback"}`` — the genre the
        emphasis followed, its confidence, the direction weights and the
        scaled values the stage applied (a ``neutral_fallback`` carries
        the exact Paso 05 base values).

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
    compressor_profiles = (
        STEM_COMPRESSOR_PROFILES if compressor_profiles is None else compressor_profiles
    )
    emphasis_profiles = (
        GENRE_EMPHASIS_PROFILES if emphasis_profiles is None else emphasis_profiles
    )
    dimension_enabled = bool(dimension_profiles)
    compressor_enabled = bool(compressor_profiles)
    emphasis_enabled = bool(emphasis_profiles)

    # Paso 04 + Paso 05: measure the tempo ONCE from the INPUT (same
    # librosa measurement as the analyzer) — the dimension stage and the
    # compressor "breathing" (beat-locked release, book pág. 55) share the
    # same BPM. No valid tempo → neutral "no_tempo" dimension and static
    # compressor releases, never a crash (Alex guard).
    bpm_used: float | None = None
    if dimension_enabled or compressor_enabled:
        bpm_used = _measure_input_bpm(input_path)
        if bpm_used is not None:
            bpm_used = round(bpm_used, 1)

    # Paso 06: the genre the emphasis follows. An explicit ``genre``
    # parameter overrides the measurement; otherwise the genre is measured
    # from the INPUT with the analyzer's own detector (the final full-mix
    # analysis runs on the refined mix — too late for the routing). A
    # missing/undecodable input degrades to the NEUTRAL fallback, never a
    # crash (Alex guard, same policy as the BPM); unknown genre or
    # confidence below CONFIDENCE_THRESHOLD → the label is reported but
    # NOT followed (same neutral fallback).
    emphasis_resolved: dict[str, Any] | None = None
    emphasis_dim_scaling: dict[str, float] = {}
    scaled_bus_target: float | None = None
    if emphasis_enabled:
        detected_genre = genre
        detected_confidence = genre_confidence
        if detected_genre is None:
            detected_genre, detected_confidence = _measure_input_genre(
                input_path
            )
        emphasis_resolved = resolve_emphasis(
            detected_genre, detected_confidence, emphasis_profiles
        )

    resampled_stems: dict[str, np.ndarray] = {}
    for name, (audio, stem_sr) in zip(STEM_NAMES, reads, strict=True):
        resampled_stems[name] = resample_audio(audio, stem_sr, target_sr)

    pan_report: dict[str, Any] | None = None
    if pan_profiles:
        resampled_stems, pan_report = validate_positions(
            resampled_stems, pan_profiles
        )

    # Apply the stem EQ profile AFTER the pan, then the COMPRESSOR (Paso
    # 05, BETWEEN the EQ and the sends: book recipes per stem, drums by
    # spectral segment), then the tempo dimension (Paso 04) — the DAW
    # chain: pan → EQ → compresor → sends. Every instrument lands on the
    # bus already shaped and controlled.
    bus_audio: list[np.ndarray] = []
    eq_profiles_applied: dict[str, list[dict[str, Any]]] = {}
    dimension_stems_report: dict[str, Any] = {}
    compressor_stems_report: dict[str, Any] = {}
    for name in STEM_NAMES:
        shaped = resampled_stems[name]
        bands = profiles.get(name, [])
        if bands:
            # All-zero gains bypass bit-exactly inside apply_stem_eq.
            shaped = apply_stem_eq(shaped, target_sr, bands)
            eq_profiles_applied[name] = bands
        comp_profile = (
            compressor_profiles.get(name) if compressor_enabled else None
        )
        if comp_profile is not None:
            shaped, comp_report = apply_stem_compression(
                shaped, target_sr, comp_profile, bpm_used
            )
            compressor_stems_report[name] = {
                "gr_db": comp_report["gr_db"],
                "ratio": comp_report["ratio"],
                "status": comp_report["status"],
            }
        dim_profile = dimension_profiles.get(name) if dimension_enabled else None
        if dim_profile is not None:
            if emphasis_resolved is not None:
                # Paso 06: scale the dimension sends along the genre
                # direction (vocal_lead for the vocals role; the bed
                # mirrors it). Neutral weights → exact base values.
                dim_profile = scale_dimension_profile(
                    dim_profile,
                    {
                        "vocal_forward": emphasis_resolved["vocal_forward"],
                        "groove_forward": emphasis_resolved["groove_forward"],
                    },
                    vocal_lead=(name == "vocals"),
                )
                reverb_cfg = dim_profile.get("reverb") or {}
                delay_cfg = dim_profile.get("delay") or {}
                emphasis_dim_scaling[f"{name}_reverb_mix"] = round(
                    float(reverb_cfg.get("mix", 0.0)), 2
                )
                emphasis_dim_scaling[f"{name}_delay_mix"] = round(
                    float(delay_cfg.get("mix", 0.0)), 2
                )
                if name == "vocals":
                    emphasis_dim_scaling["vocals_reverb_size"] = round(
                        float(reverb_cfg.get("size", 0.5)), 2
                    )
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

    # Paso 05 + Paso 06: the mix bus compresses AFTER the stem sum (Jerry
    # Finn technique: 2–3 dB total, slow attack / fast release, breathing
    # at tempo — ``dynamics.apply_bus_compression``). Under emphasis, the
    # GR target moves INSIDE the recipe band (``scale_bus_profile``:
    # groove → a bit more glue, vocal → let the voice breathe); when the
    # scaled target equals the base one (neutral weights) the ORIGINAL
    # Paso 05 path runs, bit-identical.
    bus_stage: dict[str, Any] | None = None
    if compressor_enabled:
        bus_profile: dict[str, Any] = BUS_COMPRESSOR_PROFILE
        if emphasis_resolved is not None:
            scaled_bus = scale_bus_profile(
                BUS_COMPRESSOR_PROFILE,
                {
                    "vocal_forward": emphasis_resolved["vocal_forward"],
                    "groove_forward": emphasis_resolved["groove_forward"],
                },
            )
            scaled_bus_target = float(scaled_bus["bus_gr_target_db"])
            if float(scaled_bus["threshold_offset_db"]) != float(
                BUS_COMPRESSOR_PROFILE["threshold_offset_db"]
            ):
                bus_profile = scaled_bus
        if bus_profile is BUS_COMPRESSOR_PROFILE:
            bus, bus_stage_report = apply_bus_compression(bus, target_sr, bpm_used)
        else:
            bus, bus_stage_report = _apply_scaled_bus_compression(
                bus, target_sr, bpm_used, bus_profile
            )
        bus_stage = {
            "gr_db": bus_stage_report["gr_db"],
            "gr_ok": bus_stage_report["gr_ok"],
            "technique": bus_stage_report["technique"],
        }

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
    if compressor_enabled:
        build_result["compressor_report"] = {
            "stems": compressor_stems_report,
            "bus": bus_stage,
            "status": "active",
        }
    if emphasis_resolved is not None:
        scaling: dict[str, Any] = {}
        if dimension_enabled:
            scaling["dimension"] = emphasis_dim_scaling
        if compressor_enabled and scaled_bus_target is not None:
            scaling["bus_gr_target_db"] = scaled_bus_target
        build_result["emphasis_report"] = {
            "genre": emphasis_resolved["genre"],
            "genre_confidence": emphasis_resolved["genre_confidence"],
            "vocal_forward": emphasis_resolved["vocal_forward"],
            "groove_forward": emphasis_resolved["groove_forward"],
            "scaling": scaling,
            "status": emphasis_resolved["status"],
        }
    return build_result
