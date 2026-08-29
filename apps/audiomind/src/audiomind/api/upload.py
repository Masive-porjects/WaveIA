import asyncio
import uuid
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, HTTPException

from audiomind.config import settings
from audiomind.models.audio import SessionData, ProcessingStatus

router = APIRouter()

# In-memory session store (Phase 1)
sessions: dict[str, SessionData] = {}

# Strong references to background analysis tasks so they are never GC'd
_background_tasks: set[asyncio.Future] = set()


@router.post("/upload", response_model=SessionData)
async def upload_audio(file: UploadFile = File(...)):
    """Upload an audio file for mastering analysis."""
    # Validate file type
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    suffix = Path(file.filename).suffix.lower()
    if suffix not in (".wav", ".mp3"):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported format '{suffix}'. Only WAV and MP3 are supported.",
        )

    # Validate file size
    content = await file.read()
    size_mb = len(content) / (1024 * 1024)
    if size_mb > settings.max_file_size_mb:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({size_mb:.1f}MB). Maximum is {settings.max_file_size_mb}MB.",
        )

    # Create session
    session_id = str(uuid.uuid4())
    filename = f"{session_id}{suffix}"
    file_path = settings.upload_dir / filename

    # Ensure absolute path
    file_path = file_path.resolve()
    
    # Save file
    file_path.write_bytes(content)

    # Create session data
    session = SessionData(
        session_id=session_id,
        status=ProcessingStatus.UPLOADED,
        original_path=str(file_path),
        original_filename=file.filename,
    )
    sessions[session_id] = session

    # Auto-analyze the uploaded audio in the background so the upload
    # returns immediately and the event loop never blocks on librosa.
    session.status = ProcessingStatus.ANALYZING
    loop = asyncio.get_running_loop()

    def _analyze() -> None:
        try:
            from audiomind.analysis.analyzer import analyze_audio

            session.analysis = analyze_audio(str(file_path))
        except Exception:
            pass  # Analysis is optional on upload; process will do it if needed
        finally:
            session.status = ProcessingStatus.UPLOADED

    task = loop.run_in_executor(None, _analyze)
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)

    return session


@router.post("/session/new")
async def create_session(data: dict | None = None):
    """Create a new processing session (used by SongStarter tests)."""
    session_id = str(uuid.uuid4())
    sessions[session_id] = SessionData(
        session_id=session_id,
        status=ProcessingStatus.UPLOADED,
    )
    return {"session_id": session_id}


@router.get("/session/{session_id}", response_model=SessionData)
async def get_session(session_id: str):
    """Get session status and data."""
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session
