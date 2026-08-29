"""Focused tests for the rule-based genre classifier (_detect_genre).

These build small synthetic audio signals and run them through the real
feature extraction + rule pipeline:

- A bright distorted electric-guitar solo must NOT be classified as
  reggaeton (regression: half-time tempo readings plus sub-heavy
  distortion used to imitate the urban signature).
- A dark, bass-heavy mid-tempo groove must still classify as reggaeton.
- A fast bright distorted signal classifies as metal.
"""
import sys
sys.path.insert(0, "src")

import librosa
import numpy as np

from audiomind.analysis.analyzer import _detect_genre

SR = 22050


def _classify(y: np.ndarray) -> tuple[str, float]:
    """Replicate analyze_audio's feature extraction, then call _detect_genre."""
    rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=512)[0]
    rms_db = librosa.amplitude_to_db(rms, ref=np.max)
    dynamic_range = abs(
        float(np.mean(rms_db[: len(rms_db) // 10]))
        - float(np.mean(rms_db[-len(rms_db) // 10 :]))
    )
    spectral_centroid = float(np.mean(librosa.feature.spectral_centroid(y=y, sr=SR)))
    tempo, _ = librosa.beat.beat_track(y=y, sr=SR)
    tempo_val = float(tempo) if np.isscalar(tempo) else float(tempo[0])
    return _detect_genre(
        tempo=tempo_val,
        spectral_centroid=spectral_centroid,
        dynamic_range=dynamic_range,
        rms_db=rms_db,
        sr=SR,
        y=y,
    )


def _distorted_guitar(hf_noise_level: float) -> np.ndarray:
    """Distorted low-tuned guitar: sub/bass fundamentals + tanh clipping +
    preemphasized HF noise (clipping buzz), fading out for wide dynamics."""
    rng = np.random.default_rng(7)
    duration = 8.0
    t = np.linspace(0, duration, int(SR * duration), endpoint=False)
    harmonics = sum(a * np.sin(2 * np.pi * f * t) for f, a in [
        (55, 1.2), (82.41, 1.5), (110, 0.8), (164.81, 0.8), (220, 0.6),
        (329.63, 0.55), (440, 0.5), (659.25, 0.45), (880, 0.4),
    ])
    distorted = np.tanh(6 * harmonics)
    buzz = librosa.effects.preemphasis(rng.standard_normal(len(t)), coef=0.95)
    fade = np.ones_like(t)
    n_fade = int(2.5 * SR)
    fade[-n_fade:] = np.linspace(1, 0.02, n_fade)
    y = (distorted + hf_noise_level * buzz) * fade
    return y * (0.8 / max(abs(y)))


def _reggaeton_loop() -> np.ndarray:
    """Dark bass-heavy groove: 50/80 Hz sub drone + 60 Hz kicks at ~102 BPM."""
    duration = 12.0
    t = np.linspace(0, duration, int(SR * duration), endpoint=False)
    bass = 0.7 * np.sin(2 * np.pi * 50 * t) + 0.3 * np.sin(2 * np.pi * 80 * t)
    beat = 60.0 / 204  # estimator lands at ~103 BPM
    env = np.zeros_like(t)
    for k in range(int(duration / beat)):
        start = int(k * beat * SR)
        n = min(int(0.09 * SR), len(t) - start - 1)
        if n <= 0:
            break
        env[start : start + n] = 1.0
    y = bass + env * np.sin(2 * np.pi * 60 * t) * 0.9
    return y * (0.85 / max(abs(y)))


def test_bright_distorted_solo_not_reggaeton():
    # Bright centroid (~4500 Hz) must trip the urban darkness guard even
    # though tempo (~103 BPM) and bass ratio (>0.45) match the old rule.
    genre, _ = _classify(_distorted_guitar(hf_noise_level=0.35))
    assert genre != "reggaeton"


def test_fast_distorted_signal_classifies_metal():
    # High ZCR + high centroid + fast tempo -> metal, score in [0.72, 0.78].
    genre, confidence = _classify(_distorted_guitar(hf_noise_level=0.45))
    assert genre == "metal"
    assert 0.72 <= confidence <= 0.78


def test_dark_bassy_midtempo_still_reggaeton():
    genre, confidence = _classify(_reggaeton_loop())
    assert genre == "reggaeton"
    assert confidence >= 0.7


def test_other_fallback_intact():
    # Silence-like steady tone matches no rule -> honest fallback.
    t = np.linspace(0, 6.0, int(SR * 6.0), endpoint=False)
    quiet_tone = 0.05 * np.sin(2 * np.pi * 500 * t)
    genre, confidence = _classify(quiet_tone)
    assert genre == "other"
    assert confidence == 0.3
