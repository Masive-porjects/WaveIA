from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
import threading
import time

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from audiomind.config import settings
from audiomind.services import demo_guard
from audiomind.api.upload import router as upload_router
from audiomind.api.mastering import router as mastering_router
from audiomind.api.license import router as license_router
from audiomind.api.splitter import router as splitter_router
from audiomind.api.vocal import router as vocal_router
from audiomind.api.songstarter import router as songstarter_router
from audiomind.api.batch import router as batch_router
from audiomind.api.mix import router as mix_router


def _ttl_janitor_loop() -> None:
    """Daemon loop pruning idle demo sessions (only when TTL is enabled)."""
    while True:
        time.sleep(60)
        try:
            demo_guard.prune_expired_sessions()
        except Exception:
            pass  # the janitor never dies on a bad prune


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """Start the session TTL janitor when demo TTL is configured."""
    if settings.session_ttl_minutes > 0:
        threading.Thread(
            target=_ttl_janitor_loop, daemon=True, name="session-ttl-janitor"
        ).start()
    yield


app = FastAPI(
    title=settings.app_name,
    description="AI-powered audio mastering studio",
    version="0.1.0",
    lifespan=lifespan,
)

# Increase upload body limit from default 16MB to match config
from starlette.requests import Request
Request.max_body_size = settings.max_file_size_mb * 1024 * 1024
app.state.max_body_size = settings.max_file_size_mb * 1024 * 1024

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=settings.cors_origin_regex or None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    # Only the mix analysis header: browsers cannot read custom response
    # headers cross-origin (studio :3000 → backend :8000) without this.
    expose_headers=["X-Mix-Result"],
)

app.include_router(upload_router, prefix="/api")
# mix_router MUST be registered before mastering_router: the literal
# GET /session/{id}/audio/mix would otherwise lose to mastering's
# parameterized /session/{id}/audio/{audio_type} (Starlette matches in
# registration order — see mastering.py's "literal beats parameter" note).
app.include_router(mix_router, prefix="/api")
app.include_router(mastering_router, prefix="/api")
app.include_router(license_router, prefix="/api")
app.include_router(splitter_router, prefix="/api")
app.include_router(vocal_router, prefix="/api")
app.include_router(songstarter_router, prefix="/api")
app.include_router(batch_router, prefix="/api")


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": settings.app_name}


@app.get("/api/demo/stats")
async def demo_stats():
    """Read-only demo validation meter (no secrets, no mutation).

    Reports the number of heavy-DSP pipeline executions since process
    start (cache hits never increment it) plus live session state, so
    local validation can prove "DSP executions = 0 after upload" and
    "N DSP for N distinct preset requests" over the real HTTP path.
    """
    from audiomind.api.upload import sessions

    return {
        "service": settings.app_name,
        "demo_max_duration_seconds": settings.demo_max_duration_seconds,
        "max_concurrent_dsp": settings.max_concurrent_dsp,
        "prerender_mode": settings.prerender_mode,
        "max_file_size_mb": settings.max_file_size_mb,
        "session_ttl_minutes": settings.session_ttl_minutes,
        "dsp_executions": demo_guard.dsp_execution_count(),
        "active_sessions": len(sessions),
    }
