"""Disk-persisted session store (survives Railway restarts/redeploys).

Sessions live in memory for speed, but are mirrored to a JSON file inside
the upload directory. When a Railway volume is mounted at ``/app/uploads``
(see the deploy notes), both the uploaded audio files AND ``sessions.json``
survive container restarts, so a demo user never loses their session.

The mirror is best-effort: a persistence failure never breaks a request.
"""
from __future__ import annotations

import json
from pathlib import Path

from audiomind.config import settings
from audiomind.models.audio import SessionData

# Lives inside the (volume-mounted) upload dir so both the audio and the
# session metadata ride the same persistent disk.
SESSION_FILE: Path = settings.upload_dir / "sessions.json"


def load_sessions() -> dict[str, SessionData]:
    """Load persisted sessions from disk (empty dict on any failure)."""
    if not SESSION_FILE.exists():
        return {}
    try:
        raw = json.loads(SESSION_FILE.read_text(encoding="utf-8"))
        return {
            sid: SessionData.model_validate(data)
            for sid, data in raw.items()
        }
    except Exception:
        return {}


def save_sessions(sessions: dict[str, SessionData]) -> None:
    """Best-effort mirror of the in-memory session store to disk."""
    try:
        SESSION_FILE.parent.mkdir(parents=True, exist_ok=True)
        data = {
            sid: session.model_dump(mode="json")
            for sid, session in sessions.items()
        }
        SESSION_FILE.write_text(
            json.dumps(data, ensure_ascii=False), encoding="utf-8"
        )
    except Exception:
        pass