"""Vocal Chain API endpoints.

POST /api/session/{id}/vocal       — apply vocal processing
GET  /api/session/{id}/vocal/audio — serve processed vocal audio
"""

from pathlib import Path
from pydantic import BaseModel, Field
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import FileResponse

from audiomind.config import settings
from audiomind.api.upload import sessions, save_sessions
from audiomind.api.license import require_license
from audiomind.models.audio import ProcessingStatus

router = APIRouter()


class VocalParamsModel(BaseModel):
    """Vocal chain request body — 3 control knobs mapped to 0-1 range."""

    deesser_amount: float = Field(0.3, ge=0, le=1.0, description="De-Esser intensity. 0 = off, 1 = max sibilance reduction.")
    pitch_shift_semitones: float = Field(0.0, ge=-3, le=3, description="Pitch shift in semitones. 0 = off. Positive = up, negative = down.")
    cohesion_amount: float = Field(0.4, ge=0, le=1.0, description="Optical compression amount. 0 = off, 1 = max glue/presence.")


@router.post("/session/{session_id}/vocal")
def process_vocal_endpoint(
    session_id: str,
    params: VocalParamsModel,
    _=Depends(require_license),
):
    """Run the VoiceChain Pro on a session's audio.

    Applies De-Esser → Pitch Shift → Optical Compressor in series.
    """
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if not session.original_path or not Path(session.original_path).exists():
        raise HTTPException(
            status_code=400, detail="No audio file found for this session"
        )

    output_path = settings.output_dir / f"{session_id}_vocal.wav"

    session.status = ProcessingStatus.PROCESSING
    session.progress = 0.0

    try:
        from audiomind.processing.vocal import process_vocal, VocalParameters

        vp = VocalParameters(
            deesser_amount=params.deesser_amount,
            pitch_shift_semitones=params.pitch_shift_semitones,
            cohesion_amount=params.cohesion_amount,
        )

        def update_progress(pct: float) -> None:
            session.progress = pct

        result = process_vocal(
            input_path=session.original_path,
            output_path=output_path,
            params=vp,
            progress_cb=update_progress,
        )

        session.mastered_path = result["output_path"]
        session.status = ProcessingStatus.COMPLETED
        session.progress = 1.0
        save_sessions(sessions)

        return {
            "session_id": session_id,
            "status": "completed",
            "gain_reduction_db": result["gain_reduction_db"],
            "output_path": result["output_path"],
        }
    except Exception as e:
        session.status = ProcessingStatus.ERROR
        session.error = f"Vocal processing failed: {str(e)}"
        raise HTTPException(status_code=500, detail=session.error)


@router.get("/session/{session_id}/vocal/audio")
async def get_vocal_audio(session_id: str):
    """Serve the processed vocal WAV file."""
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    path = settings.output_dir / f"{session_id}_vocal.wav"
    if not path.exists():
        raise HTTPException(status_code=404, detail="No vocal-processed audio found. Run /vocal first.")

    return FileResponse(
        str(path.resolve()),
        media_type="audio/wav",
        filename=f"{session_id}_vocal.wav",
    )
