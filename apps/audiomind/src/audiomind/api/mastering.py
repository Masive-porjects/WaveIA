"""Mastering API endpoints."""
from pathlib import Path
import asyncio
import shutil
import uuid
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel
import numpy as np
import soundfile as sf

from audiomind.config import settings
from audiomind.models.audio import (
    MasteringParameters,
    MasterResultMetrics,
    ProcessingStatus,
    ReferenceRenderResult,
    SessionData,
    ValidationReport,
)
from audiomind.api.upload import sessions
# Heavy DSP modules (librosa/pedalboard) are imported lazily inside the
# functions that use them so FastAPI startup stays light and fast on
# low-memory deployments (Railway 1GB) — see OOM/timeout mitigation.
from audiomind.processing.presets import PRESET_CHAINS
from audiomind.processing.validation import validate_master
from audiomind.api.license import require_license

router = APIRouter()

# Thread pool for CPU-bound DSP — keeps the FastAPI event loop free
# so progress polling and other requests remain responsive during processing.
_dsp_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="dsp")

# Separate executor for pre-rendering all presets in parallel after upload.
# Uses 8 workers (one per preset) so all presets process concurrently.
_prerender_executor = ThreadPoolExecutor(max_workers=8, thread_name_prefix="prerender")

# Engine's default proportional-processing intensity (see
# ``process_audio`` signature). The Layer 2 auto-retry scales it down once.
_BASE_INTENSITY_MULTIPLIER = 1.8

# ── Pre-render cache: stores results for all presets ────────────────
# Structure: {session_id: {preset_id: {"output_path", "master_result",
# "validation", "status", "progress", "error"}}}
# Status per preset: "pending" | "processing" | "completed" | "error"
_prerender_cache: dict[str, dict[str, dict]] = {}


def _build_preset_params(preset_id: str) -> MasteringParameters:
    """Build MasteringParameters from a PRESET_CHAINS entry for pre-rendering.

    Uses the preset's loudness/ceiling targets and character defaults.
    Custom user slider overrides are NOT applied — pre-render uses the
    canonical preset values so the result is always "factory default".
    """
    entry = PRESET_CHAINS[preset_id]
    comp = entry.get("compressor", {})
    return MasteringParameters(
        clarity_wet=0.15 if entry.get("eq_character") == "brillante" else 0.1,
        clarity_brightness_db=1.0 if entry.get("eq_character") == "brillante" else 0.5,
        compression_ratio=comp.get("ratio", 2.0),
        limiter_ceiling_db=entry.get("limiter_ceiling_db", -1.0),
        transient_boost_db=1.0 if entry.get("eq_character") == "punch" else 0.5,
        saturation_drive_db=entry.get("saturation", {}).get("drive_max", 0) if entry.get("saturation") else 0.0,
        saturation_warmth_db=1.0 if entry.get("saturation") else 0.0,
        stereo_width=1.2 if entry.get("spatial") else 1.0,
        haas_delay_ms=5.0 if entry.get("spatial") else 0.0,
        output_bit_depth=24,
        target_lufs_db=entry.get("target_lufs"),
    )


def _prerender_single_preset(
    session_id: str,
    preset_id: str,
    input_path: str,
    analysis,
) -> None:
    """Process a single preset and store the result in _prerender_cache.

    Runs inside _prerender_executor — one thread per preset.
    """
    from audiomind.processing.engine import process_audio

    cache = _prerender_cache.get(session_id, {})
    entry = cache.get(preset_id, {})
    entry["status"] = "processing"
    entry["progress"] = 0.0

    try:
        params = _build_preset_params(preset_id)
        output_path = (
            settings.output_dir / f"{session_id}_{preset_id}_mastered.wav"
        ).resolve()

        def update_progress(pct: float) -> None:
            entry["progress"] = max(0.0, min(1.0, pct))

        result = process_audio(
            input_path=input_path,
            output_path=output_path,
            params=params,
            analysis_result=analysis,
            intensity_multiplier=_BASE_INTENSITY_MULTIPLIER,
            progress_cb=update_progress,
        )

        entry["output_path"] = str(output_path)
        entry["master_result"] = _master_result_from_engine(result)
        entry["progress"] = 1.0

        # Best-effort validation
        preset_entry = PRESET_CHAINS.get(preset_id)
        if preset_entry is not None:
            try:
                verdict = validate_master(
                    entry["master_result"], preset_entry, analysis
                )
                if verdict is not None:
                    entry["validation"] = ValidationReport(**verdict)
            except Exception:
                pass

        entry["status"] = "completed"
    except Exception as e:
        entry["status"] = "error"
        entry["error"] = str(e)
        entry["progress"] = 0.0


def _prerender_all_presets(
    session_id: str,
    input_path: str,
    analysis,
) -> None:
    """Launch pre-rendering of all presets in parallel (background task).

    Called after upload/analysis completes. Each preset runs in its own
    thread via _prerender_executor. Results are stored in _prerender_cache.
    """
    _prerender_cache[session_id] = {}
    for preset_id in PRESET_CHAINS:
        _prerender_cache[session_id][preset_id] = {
            "status": "pending",
            "progress": 0.0,
            "output_path": None,
            "master_result": None,
            "validation": None,
            "error": None,
        }
        _prerender_executor.submit(
            _prerender_single_preset,
            session_id,
            preset_id,
            input_path,
            analysis,
        )
_RETRY_INTENSITY_SCALE = 0.8


class StatelessMasterRequest(BaseModel):
    """Body for the stateless mastering endpoint (no session)."""

    audio_url: str
    settings: MasteringParameters


def _master_result_from_engine(result: dict) -> MasterResultMetrics:
    """Map the engine result dict onto the response model.

    Uses ``.get()`` so partial/stubbed engine results never raise —
    missing keys simply stay null.
    """
    return MasterResultMetrics(
        integrated_lufs=result.get("integrated_lufs"),
        true_peak_db=result.get("true_peak_db"),
        crest_factor_db=result.get("crest_factor_db"),
        limiter_ceiling_db=result.get("limiter_ceiling_db"),
        duration_seconds=result.get("duration_seconds"),
        sample_rate=result.get("sample_rate"),
        output_bit_depth=result.get("output_bit_depth"),
    )


def _measure_master_file(path: Path) -> MasterResultMetrics:
    """Best-effort measured metrics for a cached/pre-built master.

    Reuses the project's existing BS.1770 LUFS meter plus the same
    sample-peak/crest math as ``analyze_audio`` — no new DSP work.
    Any failure (corrupt file, decode error) returns an all-null model;
    measurements must never break a cache-hit response.
    """
    try:
        from audiomind.processing.loudness import measure_lufs

        audio, sr = sf.read(str(path), dtype="float32", always_2d=True)
        mono = audio.mean(axis=1)
        lufs = measure_lufs(audio.T, sr)
        peak = float(np.max(np.abs(mono)))
        true_peak_db = 20 * np.log10(max(peak, 1e-10))
        rms = float(np.sqrt(np.mean(mono**2)))
        crest = 20 * np.log10(peak / rms) if rms > 0 else 0.0
        return MasterResultMetrics(
            integrated_lufs=round(float(lufs), 1),
            true_peak_db=round(true_peak_db, 1),
            crest_factor_db=round(crest, 1),
        )
    except Exception:
        return MasterResultMetrics()


def _resolve_preset_entry(preset_id: str | None) -> dict | None:
    """Active preset chain entry, or None when there is no preset target."""
    if preset_id and preset_id in PRESET_CHAINS:
        return PRESET_CHAINS[preset_id]
    return None


def _reference_output_path(session_id: str, preset_id: str) -> Path:
    """Session-scoped reference file, built like the mastered output path."""
    return (settings.output_dir / f"{session_id}_reference_{preset_id}.wav").resolve()


def _build_reference_params(preset_entry: dict) -> MasteringParameters:
    """Neutral-chain parameters for the Crudo reference render.

    Character comes from ``PRESET_CHAINS["natural"]`` — no EQ bands,
    gentle 1.1:1 compression, no saturation, no spatial processing.
    Loudness (``target_lufs_db`` + ``limiter_ceiling_db``) is overridden
    with the active preset's values so the reference lands at the same
    perceived loudness as the master: the ear judges character, not volume.
    """
    natural = PRESET_CHAINS["natural"]
    return MasteringParameters(
        clarity_wet=0.0,
        clarity_brightness_db=0.0,
        compression_ratio=natural["compressor"]["ratio"],
        limiter_ceiling_db=preset_entry.get("limiter_ceiling_db", -1.0),
        transient_boost_db=0.0,
        saturation_drive_db=0.0,
        saturation_warmth_db=0.0,
        stereo_width=1.0,
        haas_delay_ms=0.0,
        output_bit_depth=24,
        target_lufs_db=preset_entry.get("target_lufs"),
    )


def _lufs_distance(lufs: float | None, target: float) -> float:
    """Absolute distance to the LUFS target; unmeasurable never wins."""
    if lufs is None:
        return float("inf")
    return abs(lufs - target)


def _retry_once_on_lufs_miss(
    result: dict,
    session,
    params: MasteringParameters,
    output_path: Path,
    preset_entry: dict,
    progress_cb,
) -> tuple[dict, bool]:
    """Single bounded auto-retry at reduced engine intensity.

    Trigger: a LUFS-miss issue on the first attempt. The retry writes to
    a sibling temp file (attempt 1 stays restorable) and the attempt
    closest to the preset LUFS target wins. Hard cap: ONE retry.
    Returns ``(final_result, retried)``.
    """
    from audiomind.processing.engine import process_audio

    target_lufs = preset_entry.get("target_lufs")
    if target_lufs is None:
        return result, False

    first_verdict = validate_master(
        _master_result_from_engine(result), preset_entry, session.analysis
    )
    if not any(
        issue["metric"] == "lufs" for issue in (first_verdict or {}).get("issues", [])
    ):
        return result, False

    first_miss = _lufs_distance(result.get("integrated_lufs"), target_lufs)
    retry_output = output_path.with_name(f"{output_path.stem}_retry.wav")
    try:
        retry_result = process_audio(
            input_path=session.original_path,
            output_path=retry_output,
            params=params,
            analysis_result=session.analysis,
            intensity_multiplier=_BASE_INTENSITY_MULTIPLIER * _RETRY_INTENSITY_SCALE,
            progress_cb=progress_cb,
        )
    except Exception:
        # Retry failed — keep attempt 1; the one-retry cap is consumed.
        retry_output.unlink(missing_ok=True)
        return result, False

    retry_path = Path(retry_result.get("output_path", str(retry_output)))
    if _lufs_distance(retry_result.get("integrated_lufs"), target_lufs) < first_miss:
        # Retry wins → adopt it as the session master
        retry_path.replace(output_path)
        return {**retry_result, "output_path": str(output_path)}, True

    retry_path.unlink(missing_ok=True)
    return result, False


@router.post("/session/{session_id}/process")
async def process_session(
    session_id: str,
    params: MasteringParameters,
    preset_id: str | None = Query(default=None, description="Preset ID for pre-built lookup"),
    _=Depends(require_license),
):
    """Process a session with the given mastering parameters.

    If ``preset_id`` is provided and a pre-built master exists for the
    uploaded track + preset, the cached WAV is served directly — no DSP
    pipeline runs. This makes the demo feel instant (~1–2s instead of
    ~44s for a 3-min track).
    """
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if not session.original_path or not Path(session.original_path).exists():
        raise HTTPException(
            status_code=400, detail="No audio file found for this session"
        )

    output_path = settings.output_dir / f"{session_id}_mastered.wav"
    output_path = output_path.resolve()

    # ── Pre-built lookup: serve cached master instantly ────── */
    if preset_id:
        # Key by the ORIGINAL filename (e.g. "mi_tema_fuego.wav"), since the
        # stored file is renamed to the session id. Falls back to the stored
        # path stem for sessions created before original_filename existed.
        original_stem = (
            Path(session.original_filename).stem
            if session.original_filename
            else Path(session.original_path).stem
        )
        prebuilt_file = settings.prebuilt_dir / f"{original_stem}_{preset_id}.wav"
        if prebuilt_file.exists() and prebuilt_file.stat().st_size > 0:
            # Copy pre-built master into session output dir
            shutil.copy2(prebuilt_file, output_path)
            session.mastered_path = str(output_path)
            session.parameters = params
            session.status = ProcessingStatus.COMPLETED
            session.progress = 1.0
            session.error = None
            # Best-effort measurements on the cached file (nulls on failure)
            session.master_result = _measure_master_file(output_path)
            # Layer 2 verdict — cache hits are never reprocessed, so a
            # warning here only informs (retry_recommended, no auto-retry).
            preset_entry = _resolve_preset_entry(preset_id)
            if preset_entry is not None:
                try:
                    verdict = validate_master(
                        session.master_result, preset_entry, session.analysis
                    )
                    if verdict is not None:
                        session.validation = ValidationReport(**verdict)
                except Exception:
                    session.validation = None  # never break a cache hit
            return session

    # ── Pre-render cache: serve dynamically pre-rendered master ── */
    if preset_id and session_id in _prerender_cache:
        entry = _prerender_cache[session_id].get(preset_id)
        if (
            entry
            and entry["status"] == "completed"
            and entry.get("output_path")
        ):
            cached_path = Path(entry["output_path"])
            if cached_path.exists() and cached_path.stat().st_size > 0:
                shutil.copy2(cached_path, output_path)
                session.mastered_path = str(output_path)
                session.parameters = params
                session.status = ProcessingStatus.COMPLETED
                session.progress = 1.0
                session.error = None
                session.master_result = entry.get("master_result")
                session.validation = entry.get("validation")
                return session

    # Use background analysis if already done; skip re-analysis entirely
    # when it's still running (status == ANALYZING) to avoid double work.
    # The engine handles analysis_result=None gracefully with safe defaults.
    if not session.analysis and session.status != ProcessingStatus.ANALYZING:
        session.status = ProcessingStatus.ANALYZING
        try:
            from audiomind.analysis.analyzer import analyze_audio

            session.analysis = await asyncio.get_running_loop().run_in_executor(
                _dsp_executor, analyze_audio, session.original_path
            )
        except Exception as e:
            session.status = ProcessingStatus.ERROR
            session.error = f"Analysis failed: {str(e)}"
            raise HTTPException(status_code=500, detail=session.error)

    # Process
    session.status = ProcessingStatus.PROCESSING
    session.progress = 0.0

    def update_progress(pct: float) -> None:
        session.progress = max(0.0, min(1.0, pct))

    def _run_processing():
        """CPU-bound work executed in a thread so the event loop stays free."""
        from audiomind.processing.engine import process_audio

        result = process_audio(
            input_path=session.original_path,
            output_path=output_path,
            params=params,
            analysis_result=session.analysis,
            progress_cb=update_progress,
        )
        session.mastered_path = result["output_path"]

        # ── Layer 2 gate: validate against the active preset, with at
        # most ONE auto-retry at reduced intensity on LUFS misses. All
        # best-effort: any failure here keeps validation null and never
        # breaks the response.
        preset_entry = _resolve_preset_entry(preset_id)
        if preset_entry is not None:
            retried = False
            try:
                result, retried = _retry_once_on_lufs_miss(
                    result=result,
                    session=session,
                    params=params,
                    output_path=output_path,
                    preset_entry=preset_entry,
                    progress_cb=update_progress,
                )
            except Exception:
                retried = False
            try:
                session.master_result = _master_result_from_engine(result)
                verdict = validate_master(
                    session.master_result, preset_entry, session.analysis
                )
                if verdict is not None:
                    if retried:
                        verdict["retry_applied"] = True
                        verdict["note"] = (
                            "Reintento automático con menor intensidad; "
                            "se conservó el intento más cercano al objetivo."
                        )
                    session.validation = ValidationReport(**verdict)
            except Exception:
                session.validation = None
        else:
            session.master_result = _master_result_from_engine(result)

        session.parameters = params
        session.status = ProcessingStatus.COMPLETED
        session.progress = 1.0

    try:
        await asyncio.get_running_loop().run_in_executor(_dsp_executor, _run_processing)
    except Exception as e:
        session.status = ProcessingStatus.ERROR
        session.error = f"Processing failed: {str(e)}"
        raise HTTPException(status_code=500, detail=session.error)

    return session


# ── Pre-render endpoints ────────────────────────────────────────────


@router.post("/session/{session_id}/prerender")
async def trigger_prerender(session_id: str, _=Depends(require_license)):
    """Trigger background pre-rendering of all presets for this session.

    Launches 8 parallel DSP jobs (one per preset). Each preset's result
    is stored in _prerender_cache and can be served instantly when the
    user selects that preset via GET /prerender/{preset_id}.
    """
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if not session.original_path or not Path(session.original_path).exists():
        raise HTTPException(
            status_code=400, detail="No audio file found for this session"
        )

    # If already pre-rendered, return current status
    if session_id in _prerender_cache:
        completed = sum(
            1 for v in _prerender_cache[session_id].values()
            if v["status"] == "completed"
        )
        return {
            "session_id": session_id,
            "status": "in_progress" if completed < len(PRESET_CHAINS) else "completed",
            "completed": completed,
            "total": len(PRESET_CHAINS),
        }

    # Reuse existing analysis; compute only when missing
    if not session.analysis and session.status != ProcessingStatus.ANALYZING:
        try:
            from audiomind.analysis.analyzer import analyze_audio

            session.analysis = await asyncio.get_running_loop().run_in_executor(
                _dsp_executor, analyze_audio, session.original_path
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

    # Launch pre-render in background (non-blocking)
    _prerender_all_presets(
        session_id=session_id,
        input_path=session.original_path,
        analysis=session.analysis,
    )

    return {
        "session_id": session_id,
        "status": "in_progress",
        "completed": 0,
        "total": len(PRESET_CHAINS),
    }


@router.get("/session/{session_id}/prerender/status")
async def prerender_status(session_id: str):
    """Check which presets have been pre-rendered for this session.

    Returns a dict mapping preset_id -> {status, progress, ...}.
    """
    cache = _prerender_cache.get(session_id)
    if not cache:
        return {"session_id": session_id, "presets": {}, "status": "not_started"}

    presets = {}
    completed = 0
    errors = 0
    for preset_id, info in cache.items():
        presets[preset_id] = {
            "status": info["status"],
            "progress": info.get("progress", 0.0),
        }
        if info["status"] == "completed":
            completed += 1
        elif info["status"] == "error":
            errors += 1

    total = len(PRESET_CHAINS)
    overall = "completed" if completed == total else "in_progress"

    return {
        "session_id": session_id,
        "status": overall,
        "completed": completed,
        "errors": errors,
        "total": total,
        "presets": presets,
    }


@router.get("/session/{session_id}/prerender/{preset_id}")
async def get_prerendered(session_id: str, preset_id: str):
    """Serve a pre-rendered master for instant playback.

    If the preset is cached, returns the mastered file immediately.
    Falls back to processing on demand if not cached.
    """
    cache = _prerender_cache.get(session_id, {})
    entry = cache.get(preset_id)

    if entry and entry["status"] == "completed" and entry.get("output_path"):
        path = Path(entry["output_path"])
        if path.exists() and path.stat().st_size > 0:
            # Also update the session so the rest of the app sees it
            session = sessions.get(session_id)
            if session:
                session.mastered_path = str(path)
                session.master_result = entry.get("master_result")
                session.validation = entry.get("validation")
            return FileResponse(str(path), media_type="audio/wav", filename=path.name)

    raise HTTPException(
        status_code=404,
        detail=f"Preset '{preset_id}' not ready yet. Check GET /prerender/status.",
    )


@router.post(
    "/session/{session_id}/reference/{preset_id}",
    response_model=ReferenceRenderResult,
)
async def render_reference(
    session_id: str,
    preset_id: str,
    _=Depends(require_license),
):
    """Render the neutral Crudo reference for a fair loudness-matched A/B.

    Uses the "natural" chain character (no EQ bands, 1.1:1 compression,
    no saturation) but overrides ``target_lufs`` and ``limiter_ceiling_db``
    with the chosen preset's values, so the reference sits at the same
    perceived loudness as the master. Cached per session+preset: once
    ``{session_id}_reference_{preset_id}.wav`` exists it is returned
    immediately without re-rendering.
    """
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if preset_id not in PRESET_CHAINS:
        raise HTTPException(status_code=400, detail=f"Unknown preset '{preset_id}'")

    if not session.original_path or not Path(session.original_path).exists():
        raise HTTPException(
            status_code=400, detail="No audio file found for this session"
        )

    preset_entry = PRESET_CHAINS[preset_id]
    output_path = _reference_output_path(session_id, preset_id)

    # ── Per session+preset cache hit: serve without re-rendering ──
    if output_path.exists() and output_path.stat().st_size > 0:
        return ReferenceRenderResult(
            reference_path=str(output_path),
            target_lufs=float(preset_entry["target_lufs"]),
            source_preset_id=preset_id,
        )

    # Reuse existing analysis; compute it only when missing and not
    # already running in the background — same policy as process_session.
    if not session.analysis and session.status != ProcessingStatus.ANALYZING:
        try:
            from audiomind.analysis.analyzer import analyze_audio

            session.analysis = await asyncio.get_running_loop().run_in_executor(
                _dsp_executor, analyze_audio, session.original_path
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

    def _run_reference():
        """CPU-bound work executed in a thread so the event loop stays free."""
        from audiomind.processing.engine import process_audio

        process_audio(
            input_path=session.original_path,
            output_path=output_path,
            params=_build_reference_params(preset_entry),
            analysis_result=session.analysis,
        )

    try:
        await asyncio.get_running_loop().run_in_executor(_dsp_executor, _run_reference)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Reference render failed: {str(e)}")

    return ReferenceRenderResult(
        reference_path=str(output_path),
        target_lufs=float(preset_entry["target_lufs"]),
        source_preset_id=preset_id,
    )


@router.get("/session/{session_id}/audio/reference/{preset_id}")
async def get_reference_audio(session_id: str, preset_id: str):
    """Serve the rendered Crudo reference WAV for playback."""
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if preset_id not in PRESET_CHAINS:
        raise HTTPException(status_code=400, detail=f"Unknown preset '{preset_id}'")

    path = _reference_output_path(session_id, preset_id)
    if not path.exists():
        raise HTTPException(
            status_code=404,
            detail="Reference not rendered yet. POST /session/{id}/reference/{preset} first.",
        )

    return FileResponse(str(path), media_type="audio/wav", filename=path.name)


@router.get("/session/{session_id}/audio/{audio_type}")
async def get_audio(session_id: str, audio_type: str):
    """Serve audio file for playback."""
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if audio_type == "original":
        path = session.original_path
    elif audio_type == "mastered":
        path = session.mastered_path
    else:
        raise HTTPException(
            status_code=400,
            detail="audio_type must be 'original' or 'mastered'",
        )

    if not path or not Path(path).exists():
        raise HTTPException(status_code=404, detail="Audio file not found")

    return FileResponse(
        str(Path(path).resolve()),
        media_type="audio/wav",
        filename=f"{session_id}_{audio_type}.wav",
    )


@router.get("/session/{session_id}/raw")
async def get_raw_audio(session_id: str):
    """Return raw PCM audio data as JSON for Web Audio API.

    Returns:
    - samples: flat array of Float32 samples (interleaved L/R for stereo)
    - sampleRate: audio sample rate
    - channels: number of channels
    - duration: duration in seconds
    """
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if not session.original_path or not Path(session.original_path).exists():
        raise HTTPException(status_code=404, detail="Audio file not found")

    audio, sr = sf.read(session.original_path, dtype="float32")

    if audio.ndim == 1:
        audio = np.stack([audio, audio], axis=1)

    channels = audio.shape[1]
    duration = audio.shape[0] / sr

    return {
        "samples": audio.flatten().tolist(),
        "sampleRate": sr,
        "channels": channels,
        "duration": duration,
    }


@router.get("/session/{session_id}/raw-mastered")
async def get_raw_mastered_audio(session_id: str):
    """Return raw PCM audio data of the mastered version."""
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if not session.mastered_path or not Path(session.mastered_path).exists():
        raise HTTPException(status_code=404, detail="No mastered audio available")

    audio, sr = sf.read(session.mastered_path, dtype="float32")

    if audio.ndim == 1:
        audio = np.stack([audio, audio], axis=1)

    channels = audio.shape[1]
    duration = audio.shape[0] / sr

    return {
        "samples": audio.flatten().tolist(),
        "sampleRate": sr,
        "channels": channels,
        "duration": duration,
    }


@router.get("/session/{session_id}/download/{format}")
async def download_audio(
    session_id: str,
    format: str,
    _=Depends(require_license),
):
    """Download mastered audio in specified format."""
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if not session.mastered_path or not Path(session.mastered_path).exists():
        raise HTTPException(
            status_code=404, detail="No mastered audio available. Process first."
        )

    if format not in ("wav", "mp3"):
        raise HTTPException(status_code=400, detail="Format must be 'wav' or 'mp3'")

    if format == "mp3":
        import subprocess
        import shutil

        mp3_path = Path(session.mastered_path).with_suffix(".mp3")
        ffmpeg = shutil.which("ffmpeg")
        if not ffmpeg:
            # Try common Windows install path
            for candidate in [
                r"C:\ffmpeg\bin\ffmpeg.exe",
                r"C:\ProgramData\chocolatey\bin\ffmpeg.exe",
            ]:
                if Path(candidate).exists():
                    ffmpeg = candidate
                    break
        if not ffmpeg:
            raise HTTPException(status_code=500, detail="ffmpeg not found. Install ffmpeg for MP3 support.")
        
        result = subprocess.run(
            [ffmpeg, "-i", session.mastered_path, "-codec:a", "libmp3lame", "-b:a", "320k", "-y", str(mp3_path)],
            capture_output=True,
            text=True,
            timeout=60,
        )
        if result.returncode != 0:
            raise HTTPException(status_code=500, detail=f"MP3 conversion failed: {result.stderr[-200:]}")
        
        return FileResponse(
            str(mp3_path),
            media_type="audio/mpeg",
            filename="BrikmasterFinal.mp3",
        )

    return FileResponse(
        session.mastered_path,
        media_type="audio/wav",
        filename="BrikmasterFinal.wav",
    )


@router.get("/session/{session_id}")
async def get_session(session_id: str):
    """Get session status and data (for polling progress)."""
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.post("/session/new", response_model=SessionData)
async def create_session():
    """Create a new empty session (without uploading audio yet).

    Useful for pre-initializing a session before upload, or for
    programmatic session creation.
    """
    import uuid
    session_id = str(uuid.uuid4())
    session = SessionData(session_id=session_id)
    sessions[session_id] = session
    return session


@router.post("/master")
async def master_stateless(
    req: StatelessMasterRequest,
    _=Depends(require_license),
):
    """Stateless one-shot mastering from a signed audio URL.

    Downloads ``audio_url`` (no session, no upload), analyzes it and runs
    the DSP pipeline with the given settings in one synchronous-per-
    request flow. Returns the mastered output path and the measured
    metrics of the final master.

    This endpoint is deliberately parallel to the session-based flow: it
    shares the same engine, analysis and metrics mapping but keeps zero
    in-memory state on the server.
    """
    # Guard the URL scheme before touching the network.
    parsed = urllib.parse.urlparse(req.audio_url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(
            status_code=400, detail="audio_url must be an http(s) URL"
        )

    # Download to a fresh upload-dir file. The suffix follows the URL when
    # recognizable (same pair as /api/upload); otherwise assume WAV.
    suffix = Path(parsed.path).suffix.lower()
    if suffix not in (".wav", ".mp3"):
        suffix = ".wav"
    input_path = (
        settings.upload_dir / f"stateless_{uuid.uuid4().hex}{suffix}"
    ).resolve()
    max_bytes = settings.max_file_size_mb * 1024 * 1024
    try:
        with urllib.request.urlopen(req.audio_url, timeout=60) as resp, open(
            input_path, "wb"
        ) as out:
            total = 0
            while True:
                chunk = resp.read(256 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > max_bytes:
                    input_path.unlink(missing_ok=True)
                    raise HTTPException(
                        status_code=413,
                        detail=f"Audio too large (>{settings.max_file_size_mb}MB)",
                    )
                out.write(chunk)
    except HTTPException:
        raise
    except Exception as e:
        input_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=400, detail=f"Failed to download audio_url: {e}"
        )

    output_path = (
        settings.output_dir / f"stateless_{uuid.uuid4().hex}_mastered.wav"
    ).resolve()

    def _run_pipeline():
        """Analyze + process on the DSP executor; the event loop stays free."""
        from audiomind.analysis.analyzer import analyze_audio
        from audiomind.processing.engine import process_audio

        analysis = analyze_audio(input_path)
        return process_audio(
            input_path=input_path,
            output_path=output_path,
            params=req.settings,
            analysis_result=analysis,
        )

    try:
        result = await asyncio.get_running_loop().run_in_executor(
            _dsp_executor, _run_pipeline
        )
    except Exception as e:
        input_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Mastering failed: {e}")

    return {
        "audio": result.get("output_path", str(output_path)),
        "metrics": _master_result_from_engine(result),
    }
