"""Compliance Phase 1 — acceptance tests.

Covers the delivery-compliance contract introduced in Phase 1:

  1. Transparent passthrough identity (24-bit PCM quantization only).
  2. Explicit PCM writers (PCM_24 default, PCM_16 at 16-bit).
  3. soxr VHQ resampling (44.1k <-> 48k, round-trip fidelity).
  4. Platform loudness targets (Spotify: -14 LUFS, <= -1.0 dBTP).
  5. strict_mode input QC gate — engine raise + API HTTP 422.
  6. TP_OVERSAMPLE unification (8x everywhere).

Conventions mirror the rest of the suite: ``sys.path.insert(0, "src")``,
synthetic numpy WAVs into ``tmp_path``, ``soundfile`` round-trips,
``engine.process_audio`` for integration coverage, and a module-level
``TestClient(app)`` for the API path.
"""
import sys
sys.path.insert(0, "src")

import inspect
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf
from fastapi.testclient import TestClient

from audiomind.main import app
from audiomind.config import settings
from audiomind.models.audio import MasteringParameters
from audiomind.processing.engine import InputQcError, process_audio
from audiomind.processing.io_write import write_output
from audiomind.processing.resample import resample_audio
from audiomind.processing.truepeak import TP_OVERSAMPLE

client = TestClient(app)

SR = 44100


@pytest.fixture(autouse=True)
def _fresh_store(monkeypatch):
    """Isolate session state and force development (license-free) mode."""
    from audiomind.api.upload import sessions

    sessions.clear()
    monkeypatch.setattr(settings, "license_key", "")
    yield
    sessions.clear()


def _write_wav(path: Path, samples: np.ndarray, sr: int = SR,
               subtype: str = "FLOAT") -> None:
    """Write channels-first audio as a WAV (float by default — exact)."""
    x = np.asarray(samples)
    blocks = x.T if x.ndim == 2 else x
    sf.write(str(path), blocks, sr, subtype=subtype)


def _stereo_program(seconds: float, seed: int = 0) -> np.ndarray:
    """Deterministic stereo program: tones + a fixed noise bed."""
    rng = np.random.default_rng(seed)
    n = int(SR * seconds)
    t = np.linspace(0.0, seconds, n, endpoint=False)
    left = 0.4 * np.sin(2 * np.pi * 440 * t) + 0.08 * rng.standard_normal(n)
    right = 0.4 * np.sin(2 * np.pi * 660 * t) + 0.08 * rng.standard_normal(n)
    return np.stack([left, right])


# ── 1. Transparent passthrough ──────────────────────────────────────────


def test_transparent_passthrough_is_identical(tmp_path):
    """transparent + no target + same rate + 24-bit ≈ byte-for-byte audio.

    Only the 24-bit PCM quantization of the writer may touch the samples
    (<= 0.5 LSB = 5.96e-8; the 2e-7 tolerance absorbs float32 drift too).
    """
    in_path = tmp_path / "in.wav"
    out_path = tmp_path / "out.wav"
    _write_wav(in_path, _stereo_program(1.0, seed=1), SR)

    result = process_audio(
        in_path,
        out_path,
        MasteringParameters(
            processing_mode="transparent",
            target_lufs_db=None,
            output_sr="same_as_input",
            output_bit_depth=24,
        ),
    )

    out, out_sr = sf.read(str(out_path), always_2d=True)
    out = out.T
    expected = sf.read(str(in_path), always_2d=True)[0].T
    assert out_sr == SR
    assert out.shape == expected.shape
    np.testing.assert_allclose(out, expected, atol=2e-7, rtol=0)
    assert result["warnings"] == []


# ── 2. Explicit PCM writer (PCM_24 default / PCM_16 at 16-bit) ───────────


def test_default_output_wav_pcm24(tmp_path):
    """write_output honors the requested depth; transparent renders PCM_24."""
    unit24 = tmp_path / "unit24.wav"
    write_output(
        np.random.default_rng(3).standard_normal((2, 8000)) * 0.3,
        unit24, SR, 24,
    )
    assert sf.info(str(unit24)).subtype == "PCM_24"

    unit16 = tmp_path / "unit16.wav"
    write_output(np.zeros((2, 400)), unit16, SR, 16)
    assert sf.info(str(unit16)).subtype == "PCM_16"

    in_path = tmp_path / "in.wav"
    out_path = tmp_path / "out.wav"
    _write_wav(in_path, _stereo_program(0.5, seed=2), SR)
    process_audio(
        in_path, out_path,
        MasteringParameters(processing_mode="transparent"),
    )
    assert sf.info(str(out_path)).subtype == "PCM_24"


# ── 3. soxr VHQ resampling (44.1k <-> 48k) ───────────────────────────────


@pytest.mark.parametrize(
    "src_sr,dst_sr",
    [(44100, 48000), (48000, 44100)],
    ids=["test_src_44100_to_48000", "test_src_48000_to_44100"],
)
def test_src_round_trip_via_engine(tmp_path, src_sr, dst_sr):
    """Engine SRC lands on the requested rate; VHQ round-trip ≈ original."""
    seconds = 1.0
    n_in = int(src_sr * seconds)
    t = np.linspace(0.0, seconds, n_in, endpoint=False)
    tone = 0.5 * np.sin(2 * np.pi * 1000 * t)

    in_path = tmp_path / "in.wav"
    out_path = tmp_path / "out.wav"
    _write_wav(in_path, tone, src_sr)

    result = process_audio(
        in_path, out_path,
        MasteringParameters(
            processing_mode="transparent", output_sr=str(dst_sr)
        ),
    )

    out, out_sr = sf.read(str(out_path), always_2d=True)
    out = out[:, 0]  # mono
    assert out_sr == dst_sr
    assert out.shape[0] == round(n_in * dst_sr / src_sr), (
        "soxr output length must follow round(n * dst / src)"
    )
    assert result["output_sr"] == dst_sr

    # Round-trip back through soxr VHQ — lands within a sample of the input.
    back = resample_audio(out[np.newaxis, :], dst_sr, src_sr)[0]
    m = min(back.shape[0], n_in)
    np.testing.assert_allclose(back[:m], tone[:m], atol=0.01, rtol=0)


# ── 4. Platform delivery (Spotify) ───────────────────────────────────────


def test_platform_spotify_report_and_truepeak(tmp_path):
    """platform_target=spotify → -14 LUFS target, delivered TP <= -1.0 dBTP."""
    in_path = tmp_path / "in.wav"
    out_path = tmp_path / "out.wav"
    _write_wav(in_path, _stereo_program(3.0, seed=4), SR)

    params = MasteringParameters(
        processing_mode="transparent", platform_target="spotify"
    )
    assert params.target_lufs_db == pytest.approx(-14.0)
    assert params.limiter_ceiling_db == pytest.approx(-1.0)

    result = process_audio(in_path, out_path, params)

    assert result["target_lufs"] == pytest.approx(-14.0)
    assert abs(result["integrated_lufs"] - (-14.0)) <= 0.75
    assert result["true_peak_db"] <= -1.0 + 0.05


# ── 5. strict_mode input QC gate ─────────────────────────────────────────


def _write_clipped_wav(path: Path, sr: int = 8000, seconds: float = 0.5) -> None:
    """Hot program hard-clipped to exactly ±1.0.

    FLOAT subtype on purpose: the ±1.0 samples must survive the round-trip
    exactly (PCM quantization would soften them below the 1.0 - 1e-9 clip
    threshold the QC gate counts).
    """
    n = int(sr * seconds)
    t = np.linspace(0.0, seconds, n, endpoint=False)
    clipped = np.clip(1.6 * np.sin(2 * np.pi * 1000 * t), -1.0, 1.0)
    assert np.any(np.abs(clipped) >= 1.0 - 1e-9)
    _write_wav(path, clipped, sr)


def test_strict_mode_rejects_clipped_input(tmp_path):
    in_path = tmp_path / "clipped.wav"
    out_path = tmp_path / "out.wav"
    _write_clipped_wav(in_path)

    with pytest.raises(InputQcError) as excinfo:
        process_audio(
            in_path, out_path,
            MasteringParameters(processing_mode="transparent", strict_mode=True),
        )
    message = str(excinfo.value)
    assert "strict_mode" in message
    assert "clipping" in message  # Spanish rejection names the hard clip


def test_strict_mode_off_returns_warnings(tmp_path):
    in_path = tmp_path / "clipped.wav"
    out_path = tmp_path / "out.wav"
    _write_clipped_wav(in_path)

    result = process_audio(
        in_path, out_path,
        MasteringParameters(processing_mode="transparent", strict_mode=False),
    )
    assert result["warnings"], "clipped input must yield QC warnings"
    assert any("clipping" in w for w in result["warnings"])


def test_strict_mode_api_422(tmp_path, monkeypatch):
    """Session flow maps InputQcError → HTTP 422 with a clear Spanish detail.

    Uses the REAL upload + session endpoints. Upload's background
    auto-analysis is stubbed by patching the ANALYZER MODULE (the master's
    lazy ``analyze_audio`` wrapper late-binds from it per call), so no
    librosa/pedalboard work races in the background and no 8-preset
    prerender gets launched.
    """
    import audiomind.analysis.analyzer as analyzer_mod
    from audiomind.api.upload import sessions

    in_path = tmp_path / "clipped.wav"
    _write_clipped_wav(in_path)
    monkeypatch.setattr(analyzer_mod, "analyze_audio", lambda _p: None)

    resp = client.post(
        "/api/upload",
        files={"file": ("clipped.wav", in_path.read_bytes(), "audio/wav")},
    )
    assert resp.status_code == 200, resp.text
    session_id = resp.json()["session_id"]
    assert session_id in sessions

    resp = client.post(
        f"/api/session/{session_id}/process",
        json={"processing_mode": "transparent", "strict_mode": True},
    )
    assert resp.status_code == 422, resp.text
    detail = resp.json()["detail"]
    assert "strict_mode" in detail
    assert "clipping" in detail


# ── 6. TP_OVERSAMPLE unification ─────────────────────────────────────────


def test_tp_oversample_shared_constant():
    """TP_OVERSAMPLE == 8 and loudness metering defaults to it."""
    from audiomind.processing.loudness import (
        LoudnessMeter,
        true_peak_db as loudness_true_peak_db,
    )

    assert TP_OVERSAMPLE == 8
    params = inspect.signature(loudness_true_peak_db).parameters
    assert params["oversample"].default == TP_OVERSAMPLE
    params = inspect.signature(LoudnessMeter.true_peak).parameters
    assert params["oversample"].default == TP_OVERSAMPLE