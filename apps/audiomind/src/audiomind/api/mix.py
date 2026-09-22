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
from pydantic import BaseModel

from audiomind.api.license import require_license
from audiomind.api.upload import sessions
from audiomind.config import settings
from audiomind.processing.mix_engine import build_mix
from audiomind.services import demo_guard
from audiomind.session_store import save_sessions

router = APIRouter()


class MixRequest(BaseModel):
    """Optional body of ``POST /session/{id}/mix`` (v6).

    The spatial dimension stage (Paso 04: tempo delay + Schroeder reverb
    per stem) stays ENABLED by default — no body keeps the current
    behaviour. ``dimension_enabled=False`` routes the stems exactly like
    Paso 03 (no ``dimension_report`` in the payload).

    ``vocal_treatment`` opts into the ADAPTIVE vocal treatment by
    measured register (Eje A, ``vocal_adaptive``): default ``False``
    keeps the exact previous routing (no ``vocal_treatment_report`` key);
    ``True`` consumes the register/f0 measured on the vocal stem and
    reports what ran in ``vocal_treatment_report``.
    """

    dimension_enabled: bool = True
    vocal_treatment: bool = False


@router.post("/session/{session_id}/mix")
async def mix_session(
    session_id: str,
    request: MixRequest | None = None,
    _: None = Depends(require_license),
) -> FileResponse:
    """Split a session's audio into stems and serve the mix.

    The heavy pipeline (``build_mix``) runs inside the gated DSP pool, so
    concurrent heavy jobs on a 1 GB demo box stay serialized. The result
    WAV is served with the JSON analysis in the ``X-Mix-Result`` header:
    ``{"analysis": {stem: {...}}, "tempo_bpm": ..., "genre": ...,
    "genre_confidence": ..., "sample_rate": ..., "duration_seconds": ...}``.
    An optional JSON body (``MixRequest``) toggles the spatial dimension
    stage: ``{"dimension_enabled": false}`` disables delay+reverb (Paso 03
    routing); no body or ``true`` keeps the default (dimension ON). The
    same body opts into the adaptive vocal treatment:
    ``{"vocal_treatment": true}`` adds ``vocal_treatment_report`` to the
    payload (default off keeps the previous payload).
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
            # v6 — spatial dimension optional: None = enabled (default,
            # DIMENSION_PROFILES), {} = disabled (routing identical to
            # Paso 03, no dimension_report).
            dimension_profiles = (
                None
                if (request is None or request.dimension_enabled)
                else {}
            )
            return build_mix(
                session_id,
                str(session.original_path),
                dimension_profiles=dimension_profiles,
                vocal_treatment=bool(
                    request is not None and request.vocal_treatment
                ),
            )

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


@router.get("/session/{session_id}/audio/mix")
async def get_mix_audio(
    session_id: str,
    _: None = Depends(require_license),
) -> FileResponse:
    """Serve the persisted mix WAV (stable URL for player + download).

    The mix survives backend restarts like any persisted session: this
    GET reads ``session.mix_path`` directly instead of re-running
    ``build_mix``, so the frontend player/download can use a stable URL
    even after a page reload.
    """
    session = sessions.get(session_id)
    if not session or not session.mix_path or not Path(session.mix_path).exists():
        raise HTTPException(status_code=404, detail="Mix not found for this session")
    return FileResponse(
        session.mix_path,
        media_type="audio/wav",
        filename=f"{session_id}_mix.wav",
    )
