"""Generate default drum samples for SongStarter.

Creates synthetic WAV samples using only numpy (no external samples needed).
Run once during setup:
    python scripts/generate_samples.py
"""

import sys
from pathlib import Path

import numpy as np

# Ensure backend/ is on sys.path so audiomind.config resolves
_HERE = Path(__file__).resolve().parent
_BACKEND = _HERE.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from audiomind.config import settings

SR = 44100  # sample rate


def _apply_envelope(wave: np.ndarray, attack_s: float, decay_s: float) -> np.ndarray:
    """Apply attack/decay envelope to a sample array."""
    n = len(wave)
    attack_n = int(attack_s * SR)
    decay_n = int(decay_s * SR)

    env = np.ones(n)

    if attack_n > 0:
        env[:attack_n] = np.linspace(0, 1, attack_n)

    if decay_n > 0:
        decay_start = max(0, n - decay_n)
        env[decay_start:] = np.linspace(env[decay_start - 1] if decay_start > 0 else 1, 0, n - decay_start)

    return wave * env


def generate_kick() -> np.ndarray:
    """Kick drum: 60 Hz sine with exponential decay, 200ms."""
    duration = 0.2
    t = np.linspace(0, duration, int(SR * duration), endpoint=False)
    wave = np.sin(2 * np.pi * 60 * t)
    # Exponential decay envelope
    env = np.exp(-t * 20)
    wave = wave * env
    return _apply_envelope(wave, 0.001, 0.199)


def generate_snare() -> np.ndarray:
    """Snare: white noise + 200 Hz sine with fast decay, 150ms."""
    duration = 0.15
    n = int(SR * duration)
    t = np.linspace(0, duration, n, endpoint=False)

    noise = np.random.uniform(-1, 1, n)
    tone = np.sin(2 * np.pi * 200 * t)

    # Mix: 60% noise, 40% tone
    wave = noise * 0.6 + tone * 0.4
    env = np.exp(-t * 25)
    wave = wave * env
    return _apply_envelope(wave, 0.001, 0.149)


def generate_hihat_closed() -> np.ndarray:
    """Closed hi-hat: high-pass filtered white noise, short decay 50ms."""
    duration = 0.05
    n = int(SR * duration)
    noise = np.random.uniform(-1, 1, n)

    # Simple high-pass by applying a first-order difference
    noise = np.diff(noise, prepend=0)
    noise = noise / (np.max(np.abs(noise)) + 1e-10)

    env = np.exp(-np.linspace(0, duration, n) * 60)
    wave = noise * env
    return _apply_envelope(wave, 0.001, 0.049)


def generate_hihat_open() -> np.ndarray:
    """Open hi-hat: high-pass filtered white noise, long decay 200ms."""
    duration = 0.2
    n = int(SR * duration)
    noise = np.random.uniform(-1, 1, n)

    # Simple high-pass
    noise = np.diff(noise, prepend=0)
    noise = noise / (np.max(np.abs(noise)) + 1e-10)

    env = np.exp(-np.linspace(0, duration, n) * 12)
    wave = noise * env
    return _apply_envelope(wave, 0.001, 0.199)


def generate_clap() -> np.ndarray:
    """Clap: white noise with short envelope + 2 repeats, 80ms body."""
    def _clap_shot(duration=0.08):
        n = int(SR * duration)
        noise = np.random.uniform(-1, 1, n)
        env = np.exp(-np.linspace(0, duration, n) * 30)
        return noise * env

    main = _clap_shot(0.08)
    pre1 = _clap_shot(0.04) * 0.3
    pre2 = _clap_shot(0.04) * 0.5

    # Sequence: pre2 (earliest), pre1 (mid), then main
    gap = int(0.01 * SR)  # 10ms gaps
    total_len = len(main) + 2 * gap + len(pre1) + len(pre2)
    wave = np.zeros(total_len)

    start = 0
    wave[start:start + len(pre2)] = pre2
    start += len(pre2) + gap
    wave[start:start + len(pre1)] = pre1
    start += len(pre1) + gap
    wave[start:start + len(main)] = main

    return _apply_envelope(wave, 0.001, 0.199)


SAMPLE_DEFS = {
    "kick.wav": generate_kick,
    "snare.wav": generate_snare,
    "hihat-closed.wav": generate_hihat_closed,
    "hihat-open.wav": generate_hihat_open,
    "clap.wav": generate_clap,
}


def main():
    import soundfile as sf

    samples_dir = settings.samples_dir
    samples_dir.mkdir(parents=True, exist_ok=True)

    for name, gen_fn in SAMPLE_DEFS.items():
        path = samples_dir / name
        audio = gen_fn()
        sf.write(str(path), audio, SR)
        print(f"  OK {path.name} — {len(audio) / SR:.3f}s")

    print(f"\nAll samples written to {samples_dir}")


if __name__ == "__main__":
    main()
