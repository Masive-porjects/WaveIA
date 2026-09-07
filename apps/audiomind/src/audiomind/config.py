from pathlib import Path

from pydantic_settings import BaseSettings

# Path to the backend/ directory (parent of src/)
_BACKEND_DIR = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    app_name: str = "AudioMind"
    debug: bool = True

    # File storage
    upload_dir: Path = _BACKEND_DIR / "uploads"
    output_dir: Path = _BACKEND_DIR / "outputs"
    samples_dir: Path = _BACKEND_DIR / "samples"
    projects_dir: Path = _BACKEND_DIR / "projects"
    # Pre-built mastered tracks (hackathon / demo speedup)
    prebuilt_dir: Path = _BACKEND_DIR / "prebuilt"
    max_file_size_mb: int = 50

    # Processing
    target_lufs: float = -14.0
    sample_rate: int = 44100

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    # CORS: local dev origins + the production Studio (Railway). The railway
    # origin is in the default so a deployment that doesn't override these is
    # never blocked — a CORS-silent 502 makes the frontend "freeze" mid-master.
    cors_origins: list[str] = [
        "https://studio-production-f546.up.railway.app",
        "http://localhost:3000",
        "http://localhost:5173",
    ]

    # License
    license_key: str = ""  # AUDIOMIND_LICENSE_KEY env var

    model_config = {
        "env_prefix": "AUDIOMIND_",
        "env_file": str(_BACKEND_DIR / ".env"),
        "env_file_encoding": "utf-8",
    }


settings = Settings()

# Ensure directories exist
settings.upload_dir.mkdir(parents=True, exist_ok=True)
settings.output_dir.mkdir(parents=True, exist_ok=True)
settings.samples_dir.mkdir(parents=True, exist_ok=True)
settings.projects_dir.mkdir(parents=True, exist_ok=True)
settings.prebuilt_dir.mkdir(parents=True, exist_ok=True)
