#!/usr/bin/env python3
"""
Genera fixture de audio determinista para el E2E demo flow.

Output: e2e/fixtures/demo-audio.wav
- 10 segundos, 44.1 kHz, 16-bit PCM, stereo (< 2 MB)
- Senal: mezcla de senoidales (220/330/440/880/1760 Hz) con envelope,
  sin RNG — el archivo es identico entre corridas.

Usage (desde la raiz del repo):
  apps/audiomind/.venv/Scripts/python.exe e2e/fixtures/generate_demo_fixture.py
"""

import numpy as np
import soundfile as sf
from pathlib import Path

SR = 44100
DURATION_SECONDS = 10.0


def generate_demo_audio(output_path: str = "demo-audio.wav") -> None:
    n_samples = int(SR * DURATION_SECONDS)
    t = np.linspace(0, DURATION_SECONDS, n_samples, endpoint=False)

    # Deterministic signal: harmonic stack + a slow pitch glide so the
    # backend analysis sees non-trivial content (no RNG anywhere).
    glide = 1.0 + 0.15 * np.sin(2 * np.pi * 0.25 * t)
    sig = (
        0.30 * np.sin(2 * np.pi * 220 * glide * t)
        + 0.20 * np.sin(2 * np.pi * 330 * glide * t)
        + 0.15 * np.sin(2 * np.pi * 440 * glide * t)
        + 0.08 * np.sin(2 * np.pi * 880 * glide * t)
        + 0.04 * np.sin(2 * np.pi * 1760 * glide * t)
    )

    # Envelope: attack 50ms, release 200ms
    env = np.ones(n_samples)
    attack = int(0.05 * SR)
    release = int(0.20 * SR)
    if attack > 0:
        env[:attack] = np.linspace(0, 1, attack)
    if release > 0:
        env[-release:] = np.linspace(1, 0, release)
    sig = sig * env

    # Stereo: L=full, R=0.9 (ligero ancho)
    stereo = np.stack([sig, sig * 0.9], axis=1).astype(np.float32)

    # Normalize to prevent clipping
    peak = np.max(np.abs(stereo))
    if peak > 0.95:
        stereo = stereo * (0.95 / peak)

    out = Path(__file__).parent / output_path
    out.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(out), stereo, SR, subtype="PCM_16")

    size_mb = out.stat().st_size / (1024 * 1024)
    print(f"[Fixture] Generated: {out}")
    print(f"[Fixture] Duration: {DURATION_SECONDS}s, SR: {SR}Hz, Channels: 2")
    print(f"[Fixture] Size: {size_mb:.2f} MB")
    print(f"[Fixture] Peak: {np.max(np.abs(stereo)):.3f}")


if __name__ == "__main__":
    generate_demo_audio("demo-audio.wav")