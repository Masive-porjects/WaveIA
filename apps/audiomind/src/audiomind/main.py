from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from audiomind.config import settings
from audiomind.api.upload import router as upload_router
from audiomind.api.mastering import router as mastering_router
from audiomind.api.license import router as license_router
from audiomind.api.splitter import router as splitter_router
from audiomind.api.vocal import router as vocal_router
from audiomind.api.songstarter import router as songstarter_router

app = FastAPI(
    title=settings.app_name,
    description="AI-powered audio mastering studio",
    version="0.1.0",
)

# Increase upload body limit from default 16MB to match config
from starlette.requests import Request
Request.max_body_size = settings.max_file_size_mb * 1024 * 1024
app.state.max_body_size = settings.max_file_size_mb * 1024 * 1024

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload_router, prefix="/api")
app.include_router(mastering_router, prefix="/api")
app.include_router(license_router, prefix="/api")
app.include_router(splitter_router, prefix="/api")
app.include_router(vocal_router, prefix="/api")
app.include_router(songstarter_router, prefix="/api")


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": settings.app_name}
