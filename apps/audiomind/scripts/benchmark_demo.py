"""Benchmark a single preset master of a <=240s track over the REAL API path.

Purpose
-------
Produce evidence for the client-demo budget claim on THIS machine: does a
single preset master of a 45s / 60s track complete in a demo-viable time?
This script measures the actual user-facing path, not a mocked one.

Option used: **A — a real uvicorn server in a subprocess.**

Why not TestClient or in-process uvicorn?
* TestClient runs the ASGI app directly (no TCP, no uvicorn) — that is
  NOT what the user experiences in the demo, so it is rejected here.
* In-process uvicorn (uvicorn.Server.run in a thread) is the classic
  Windows winsock/asyncio sand trap; a subprocess avoids it entirely and
  is the closest faithful reproduction of the deployed demo:
  uvicorn -> FastAPI -> single-flight demo_guard -> gated DSP pool.

What the timed window covers
----------------------------
For every run a NEW session is created the way the studio does it:
  1. POST /api/upload (multipart WAV)        -> returns instantly;
     background analysis starts server-side.
  2. Poll GET /api/session/{id} until the upload-time analysis finishes
     (the studio UI waits for analysis before enabling "master").
  3. Walls-clock strictly around
     POST /api/session/{id}/process?preset_id=universal
     with body = engine defaults ``{}`` (the schema's neutral defaults).
     The endpoint AWAITS the single-flight DSP future, so the POST
     response is the completion signal; a follow-up GET confirms the
     final session status (untimed, verification only).

The server runs with the DEMO environment (the values the Railway/Vercel
demo deployment sets, see src/audiomind/config.py):
  AUDIOMIND_PRERENDER_MODE=on_demand        (no automatic preset DSP)
  AUDIOMIND_MAX_CONCURRENT_DSP=1            (serialize heavy DSP)
  AUDIOMIND_DEMO_MAX_DURATION_SECONDS=240   (demo upload cap: 4 minutes)
  AUDIOMIND_MAX_FILE_SIZE_MB=100            (4-min PCM24 upload headroom)
  AUDIOMIND_SESSION_TTL_MINUTES=60          (janitor prunes idle uploads)

Generated tracks are sine+noise hybrids (timing only, audio quality is
irrelevant) written to ``apps/audiomind/outputs/`` (gitignored):
  benchmark_45.wav, benchmark_60.wav  — 44100 Hz, stereo.

Dependencies: numpy + soundfile only (both already in pyproject.toml);
all HTTP uses the stdlib (urllib). No new requirements.

Usage
-----
    uv run python scripts/benchmark_demo.py [--runs N]

``--runs`` defaults to 2 (warm + repeat). Exit code:
  0  -> every run of both tracks completed
  1  -> at least one run did not complete (or timed out)
  2  -> the benchmark server could not be started
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import statistics
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

import numpy as np

# Ensure backend/ is on sys.path (repo script convention — see
# generate_samples.py), so audiomind.config resolves even when the
# package is not installed editable.
_HERE = Path(__file__).resolve().parent
_BACKEND = _HERE.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from audiomind.config import settings  # noqa: E402  (path bootstrap first)

SR = 44100
PRESET_ID = "universal"
HOST = "127.0.0.1"
TRACK_DURATIONS_S = (45.0, 60.0)

# Demo deployment environment (see config.py "Client demo mode").
# 240 s = the 4-minute client cap; 100 MB covers a 4-min PCM24 44.1k
# stereo upload (≈63.5 MB) plus overhead, while MP3/16-bit WAV stay
# comfortably inside.
DEMO_ENV = {
    "AUDIOMIND_PRERENDER_MODE": "on_demand",
    "AUDIOMIND_MAX_CONCURRENT_DSP": "1",
    "AUDIOMIND_DEMO_MAX_DURATION_SECONDS": "240",
    "AUDIOMIND_MAX_FILE_SIZE_MB": "100",
    "AUDIOMIND_SESSION_TTL_MINUTES": "60",
}

# Bounded waiting budgets (seconds).
SERVER_BOOT_TIMEOUT = 90.0
ANALYSIS_WAIT_TIMEOUT = 90.0
CONFIRM_POLL_TIMEOUT = 60.0


# ── Track generation ───────────────────────────────────────────────────


def generate_track(duration_s: float, path: Path) -> float:
    """Synthetic stereo track (sine + noise hybrid), returns real duration."""
    import soundfile as sf

    n = int(SR * duration_s)
    t = np.linspace(0.0, duration_s, n, endpoint=False)
    left = 0.3 * np.sin(2 * np.pi * 220.0 * t) + 0.05 * np.random.uniform(
        -1, 1, n
    )
    right = 0.3 * np.sin(2 * np.pi * 221.0 * t + 0.5) + 0.05 * np.random.uniform(
        -1, 1, n
    )
    audio = np.stack([left, right], axis=1).astype("float32")
    path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(path), audio, SR, subtype="PCM_16")
    real = len(audio) / SR
    print(f"  OK {path.name} — {real:.3f}s generated")
    return real


# ── Minimal HTTP client (stdlib only) ──────────────────────────────────


class HttpError(Exception):
    def __init__(self, status: int, detail: str):
        super().__init__(f"HTTP {status}: {detail}")
        self.status = status
        self.detail = detail


def _request(
    base_url: str, method: str, url_path: str,
    body: bytes | None = None, headers: dict[str, str] | None = None,
    timeout: float = 60.0,
) -> dict:
    req = urllib.request.Request(f"{base_url}{url_path}", data=body, method=method)
    for key, value in (headers or {}).items():
        req.add_header(key, value)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise HttpError(exc.code, detail) from exc


def upload_wav(base_url: str, file_path: Path, timeout: float = 120.0) -> str:
    """POST /api/upload (multipart) → session_id."""
    boundary = uuid.uuid4().hex
    payload = file_path.read_bytes()
    head = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{file_path.name}"\r\n'
        "Content-Type: audio/wav\r\n\r\n"
    ).encode()
    tail = f"\r\n--{boundary}--\r\n".encode()
    body = head + payload + tail
    data = _request(
        base_url, "POST", "/api/upload",
        body=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        timeout=timeout,
    )
    return data["session_id"]


def get_session(base_url: str, session_id: str) -> dict:
    return _request(base_url, "GET", f"/api/session/{session_id}")


def process_preset(
    base_url: str, session_id: str, timeout: float,
) -> dict:
    """POST /api/session/{id}/process?preset_id=universal , body = defaults."""
    return _request(
        base_url, "POST",
        f"/api/session/{session_id}/process?preset_id={PRESET_ID}",
        body=b"{}",
        headers={"Content-Type": "application/json"},
        timeout=timeout,
    )


# ── Server orchestration (real uvicorn in a subprocess) ────────────────


def find_free_port() -> int:
    import socket

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind((HOST, 0))
        return int(sock.getsockname()[1])


def _server_log_path() -> Path:
    base = Path(os.environ.get("TEMP", tempfile.gettempdir()))
    return base / f"audiomind-benchmark-uvicorn-{os.getpid()}.log"


def start_server(port: int) -> tuple[subprocess.Popen, Path]:
    """Spawn uvicorn against the REAL app; returns (proc, log_path)."""
    env = os.environ.copy()
    env.update(DEMO_ENV)
    env["PYTHONUNBUFFERED"] = "1"
    log_path = _server_log_path()
    log_file = log_path.open("w", encoding="utf-8")
    proc = subprocess.Popen(
        [
            sys.executable, "-m", "uvicorn", "audiomind.main:app",
            "--host", HOST, "--port", str(port), "--log-level", "warning",
        ],
        cwd=str(_BACKEND),
        env=env,
        stdout=log_file,
        stderr=subprocess.STDOUT,
        creationflags=getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0),
    )
    return proc, log_path


def wait_until_healthy(base_url: str, timeout: float = SERVER_BOOT_TIMEOUT) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if _server_healthy(base_url):
            return
        time.sleep(0.5)
    raise RuntimeError(f"server did not become healthy within {timeout:.0f}s")


def _server_healthy(base_url: str) -> bool:
    try:
        _request(base_url, "GET", "/health", timeout=2.0)
        return True
    except Exception:
        return False


def stop_server(proc: subprocess.Popen | None) -> None:
    if proc is None:
        return
    if proc.poll() is None:
        proc.terminate()
        try:
            proc.wait(timeout=15)
        except subprocess.TimeoutExpired:
            subprocess.run(
                ["taskkill", "/PID", str(proc.pid), "/T", "/F"],
                capture_output=True,
            )


# ── One timed run through the REAL endpoint path ────────────────────────


def timed_preset_path(
    base_url: str,
    track_path: Path,
    source_duration_s: float,
    request_timeout: float,
) -> dict:
    """Upload, wait for analysis, TIME /process, then confirm completion.

    Returns the row dict: source_s / preset_id / wall_time_s / completed.
    ``wall_time_s`` is the wall clock strictly around POST /process — the
    request the demo user waits on. The confirm poll runs AFTER the clock
    stops (the endpoint awaits the DSP future, so the POST response is the
    completion signal; the poll is a verification step).
    """
    session_id = upload_wav(base_url, track_path)
    # Wait for the upload-time background analysis (studio waits for it
    # before enabling "master"). Missing analysis is tolerated by the
    # engine, but this keeps the timed window focused on DSP.
    deadline = time.monotonic() + ANALYSIS_WAIT_TIMEOUT
    while time.monotonic() < deadline:
        session = get_session(base_url, session_id)
        if session.get("status") != "analyzing":
            break
        time.sleep(0.5)

    start = time.perf_counter()
    try:
        response = process_preset(base_url, session_id, request_timeout)
        wall_time_s = time.perf_counter() - start
    except Exception as exc:
        wall_time_s = time.perf_counter() - start
        print(f"  !! process failed: {exc}")
        return {
            "source_s": round(source_duration_s, 2),
            "preset_id": PRESET_ID,
            "wall_time_s": round(wall_time_s, 2),
            "completed": False,
        }

    # Confirm final status (untimed): poll until terminal or timeout.
    confirmed = response.get("status")
    deadline = time.monotonic() + CONFIRM_POLL_TIMEOUT
    while confirmed not in ("completed", "error") and time.monotonic() < deadline:
        time.sleep(0.5)
        confirmed = get_session(base_url, session_id).get("status")
    completed = confirmed == "completed" and _output_exists(session_id)

    return {
        "source_s": round(source_duration_s, 2),
        "preset_id": PRESET_ID,
        "wall_time_s": round(wall_time_s, 2),
        "completed": bool(completed),
    }


def _output_exists(session_id: str) -> bool:
    """The mastered file on disk (same machine, server writes to outputs/)."""
    candidate = settings.output_dir / f"{session_id}_{PRESET_ID}_mastered.wav"
    return candidate.exists() and candidate.stat().st_size > 0


# ── Reporting ───────────────────────────────────────────────────────────


def print_machine_facts() -> None:
    print("Machine facts:")
    print(f"  system        : {platform.system()} {platform.release()}")
    print(f"  processor     : {platform.processor() or 'unknown'}")
    print(f"  cpu_count     : {os.cpu_count() or 'unknown'}")
    print(f"  python        : {platform.python_version()}")
    print(f"  interpreter   : {sys.executable}")
    print(f"  demo env      : {DEMO_ENV}")


def print_table(rows: list[dict]) -> list[float]:
    print("| source_s | wall_elapsed_s | ratio | completed |")
    print("|----------|----------------|-------|-----------|")
    wall_times: list[float] = []
    for row in rows:
        wall = float(row["wall_time_s"])
        wall_times.append(wall)
        ratio = wall / float(row["source_s"]) if float(row["source_s"]) else 0.0
        print(
            f"| {row['source_s']:>8.2f} | {wall:>14.2f} | {ratio:>5.2f} | "
            f"{str(row['completed']):>9} |"
        )
    return wall_times


# ── Main ───────────────────────────────────────────────────────────────


def run_benchmark(runs: int, request_timeout: float) -> int:
    print_machine_facts()
    print()

    # Generate the tracks ONCE into the gitignored outputs/ area.
    track_paths: dict[float, Path] = {}
    for duration_s in TRACK_DURATIONS_S:
        stem = f"benchmark_{int(duration_s)}"
        track_paths[duration_s] = settings.output_dir / f"{stem}.wav"
        generate_track(duration_s, track_paths[duration_s])
    print()

    port = find_free_port()
    base_url = f"http://{HOST}:{port}"
    proc: subprocess.Popen | None = None
    log_path: Path | None = None
    all_rows: list[dict] = []
    all_completed = True

    try:
        proc, log_path = start_server(port)
        print(f"Starting real uvicorn server on {base_url} (demo env)...")
        wait_until_healthy(base_url)
        print("  server healthy.\n")

        for duration_s in TRACK_DURATIONS_S:
            print(f"== Track {duration_s:.0f}s — preset={PRESET_ID} "
                  f"({runs} run(s)) ==")
            rows: list[dict] = []
            for run in range(1, runs + 1):
                label = "warm" if run == 1 else "repeat"
                print(f"  run {run}/{runs} ({label})...")
                row = timed_preset_path(
                    base_url, track_paths[duration_s], duration_s, request_timeout
                )
                rows.append(row)
                all_rows.append(row)
                all_completed = all_completed and bool(row["completed"])
            print()
            print_table(rows)
            wall_median = statistics.median(float(r["wall_time_s"]) for r in rows)
            src = rows[0]["source_s"]
            print(f"median wall_time_s for {src:.2f}s track: {wall_median:.2f} "
                  f"(ratio {wall_median / src:.2f}x)\n")
    finally:
        # Did the server die BEFORE the benchmark stopped it? If so it
        # crashed mid-run (report it). Otherwise the exit code below is
        # just our own terminate — normal shutdown — and is not an error.
        crashed = proc is not None and proc.poll() is not None
        stop_server(proc)
        if crashed and proc.returncode != 0:
            print(f"Server exited unexpectedly (code {proc.returncode}); "
                  f"log: {log_path}")

    if not all_completed:
        print("RESULT: FAIL — at least one run did not complete.")
        return 1
    print("RESULT: PASS — every run of both tracks completed.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Benchmark a single preset master over the REAL uvicorn API path "
            "(Option A: uvicorn subprocess on a free port)."
        )
    )
    parser.add_argument(
        "--runs", type=int, default=2,
        help="Runs per track (warm + repeats); default 2, minimum 2.",
    )
    parser.add_argument(
        "--request-timeout", type=float, default=600.0,
        help="Per-request timeout for POST /process in seconds (default 600).",
    )
    args = parser.parse_args()
    if args.runs < 2:
        parser.error("--runs must be >= 2 (warm + repeat)")

    try:
        return run_benchmark(args.runs, args.request_timeout)
    except RuntimeError as exc:
        print(f"ERROR: {exc}")
        log_path = _server_log_path()
        if log_path.exists():
            print(f"Server log tail ({log_path}):")
            lines = log_path.read_text(
                encoding="utf-8", errors="replace"
            ).splitlines()
            tail = lines[-25:]
            print("\n".join(f"  | {line}" for line in tail))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())