"""Mix Engine API endpoints (Paso 01 — per-stem routing).

``POST /api/session/{id}/mix`` — split the session audio into 4 stems,
route them at neutral 0 dB gains onto a stereo mono-compatible bus, write
``outputs/{id}_mix.wav`` and serve it. The JSON analysis payload
(per-stem analysis + full-mix ``tempo_bpm`` / ``genre`` /
``genre_confidence``) travels in the ``X-Mix-Result`` response header and
is mirrored on the session (``mix_path`` / ``mix_analysis``). The mix is
recorded independently of the mastering pipeline: ``mastered_path`` is
never touched.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from audiomind.api.license import require_license
from audiomind.api.upload import sessions
from audiomind.config import settings
from audiomind.processing.mix_engine import build_mix
from audiomind.services import demo_guard
from audiomind.session_store import save_sessions

router = APIRouter()


@router.post("/session/{session_id}/mix")
async def mix_session(
    session_id: str,
    _: None = Depends(require_license),
) -> FileResponse:
    """Split a session's audio into stems and serve the neutral mix.

    The heavy pipeline (``build_mix``) runs inside the gated DSP pool, so
    concurrent heavy jobs on a 1 GB demo box stay serialized. The result
    WAV is served with the JSON analysis in the ``X-Mix-Result`` header:
    ``{"analysis": {stem: {...}}, "tempo_bpm": ..., "genre": ...,
    "genre_confidence": ..., "sample_rate": ..., "duration_seconds": ...}``.
    """
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if not session.original_path or not Path(session.original_path).exists():
        raise HTTPException(
            status_code=400, detail="No audio file found for this session"
        )

    # Defensive demo duration guard, same policy as /process: sessions
    # restored from disk or created outside /api/upload are caught here.
    if demo_guard.duration_over_limit(
        session.analysis.duration_seconds if session.analysis else None
    ):
        raise HTTPException(
            status_code=422,
            detail=demo_guard.demo_duration_message(
                settings.demo_max_duration_seconds
            ),
        )

    def _run_mix() -> dict[str, Any]:
        with demo_guard.gate():
            return build_mix(session_id, str(session.original_path))

    try:
        result = await asyncio.get_running_loop().run_in_executor(
            demo_guard.DSP_THREAD_POOL, _run_mix
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Mix failed: {str(e)}") from e

    # The session payload mirrors the header: analysis + full-mix fields.
    # ``mix_path`` stays a separate field (the file pointer).
    payload = {key: value for key, value in result.items() if key != "mix_path"}
    session.mix_path = result["mix_path"]
    session.mix_analysis = payload
    demo_guard.touch(session_id)
    save_sessions(sessions)

    return FileResponse(
        result["mix_path"],
        media_type="audio/wav",
        filename=f"{session_id}_mix.wav",
        headers={"X-Mix-Result": json.dumps(payload, ensure_ascii=True)},
    )