"""Mastering API endpoints."""
from pathlib import Path
import asyncio
import shutil
from concurrent.futures import ThreadPoolExecutor

from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import FileResponse
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
from audiomind.analysis.analyzer import analyze_audio
from audiomind.processing.engine import process_audio
from audiomind.processing.loudness import measure_lufs
from audiomind.processing.presets import PRESET_CHAINS
from audiomind.processing.validation import validate_master
from audiomind.api.license import require_license

router = APIRouter()

# Thread pool for CPU-bound DSP — keeps the FastAPI event loop free
# so progress polling and other requests remain responsive during processing.
_dsp_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="dsp")

# Engine's default proportional-processing intensity (see
# ``process_audio`` signature). The Layer 2 auto-retry scales it down once.
_BASE_INTENSITY_MULTIPLIER = 1.8
_RETRY_INTENSITY_SCALE = 0.8


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

    # Use background analysis if already done; skip re-analysis entirely
    # when it's still running (status == ANALYZING) to avoid double work.
    # The engine handles analysis_result=None gracefully with safe defaults.
    if not session.analysis and session.status != ProcessingStatus.ANALYZING:
        session.status = ProcessingStatus.ANALYZING
        try:
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
            session.analysis = await asyncio.get_running_loop().run_in_executor(
                _dsp_executor, analyze_audio, session.original_path
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

    def _run_reference():
        """CPU-bound work executed in a thread so the event loop stays free."""
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
            filename=f"{session_id}_mastered.mp3",
        )

    return FileResponse(
        session.mastered_path,
        media_type="audio/wav",
        filename=f"{session_id}_mastered.wav",
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
