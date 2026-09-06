"""Tests for spatial.py — Mid/Side processing (Section 5.7)."""
import numpy as np
import pytest
import soundfile as sf
from scipy.signal import butter, sosfilt

from audiomind.processing.spatial import (
    SIDE_HPF_DEFAULT_HZ,
    apply_cinematico_spatial,
    apply_claridad_spatial,
    apply_side_hpf,
    check_phase_correlation,
    mid_side_decode,
    mid_side_encode,
    safety_enforce_correlation,
)

SR = 44100
DURATION = 0.5  # seconds
SAMPLES = int(SR * DURATION)


def _make_stereo(left_freq: float = 440.0, right_freq: float = 440.0) -> np.ndarray:
    """Create a simple stereo sine wave pair."""
    t = np.linspace(0, DURATION, SAMPLES, endpoint=False)
    left = 0.5 * np.sin(2 * np.pi * left_freq * t)
    right = 0.5 * np.sin(2 * np.pi * right_freq * t)
    return np.stack([left, right])


class TestMidSideEncodeDecode:
    def test_roundtrip(self):
        """Encode then decode should return the original signal."""
        audio = _make_stereo(440, 880)
        mid, side = mid_side_encode(audio)
        reconstructed = mid_side_decode(mid, side)
        np.testing.assert_allclose(reconstructed, audio, atol=1e-7)

    def test_identical_channels_produce_zero_side(self):
        """Mono signal (identical L/R) should have zero Side."""
        t = np.linspace(0, DURATION, SAMPLES, endpoint=False)
        mono = 0.5 * np.sin(2 * np.pi * 440 * t)
        audio = np.stack([mono, mono])
        mid, side = mid_side_encode(audio)
        np.testing.assert_allclose(side, 0.0, atol=1e-10)

    def test_opposite_channels_produce_zero_mid(self):
        """Fully anti-phase signal should have zero Mid."""
        t = np.linspace(0, DURATION, SAMPLES, endpoint=False)
        left = 0.5 * np.sin(2 * np.pi * 440 * t)
        right = -left
        audio = np.stack([left, right])
        mid, side = mid_side_encode(audio)
        np.testing.assert_allclose(mid, 0.0, atol=1e-10)

    def test_mono_upmixes_to_zero_side(self):
        """Mono (1, samples) must not crash — upmixes so side is identically 0."""
        t = np.linspace(0, DURATION, SAMPLES, endpoint=False)
        mono = 0.5 * np.sin(2 * np.pi * 440 * t)
        mid, side = mid_side_encode(mono.reshape(1, -1))
        np.testing.assert_allclose(mid, mono * np.sqrt(2), atol=1e-10)
        np.testing.assert_allclose(side, 0.0, atol=1e-12)

    def test_mono_mid_side_roundtrip_preserves_signal(self):
        """Encode→decode a mono track should reproduce the original mono signal."""
        t = np.linspace(0, DURATION, SAMPLES, endpoint=False)
        mono = 0.5 * np.sin(2 * np.pi * 440 * t)
        mid, side = mid_side_encode(mono.reshape(1, -1))
        decoded = mid_side_decode(mid, side)
        np.testing.assert_allclose(decoded[0], mono, atol=1e-10)
        np.testing.assert_allclose(decoded[0], decoded[1], atol=1e-10)


class TestPhaseCorrelation:
    def test_identical_signal_correlation_one(self):
        """Identical L/R should have correlation = 1.0."""
        audio = _make_stereo(440, 440)
        corr = check_phase_correlation(audio)
        assert corr == pytest.approx(1.0, abs=1e-7)

    def test_opposite_signal_correlation_negative(self):
        """Anti-phase L/R should have correlation = -1.0."""
        t = np.linspace(0, DURATION, SAMPLES, endpoint=False)
        left = 0.5 * np.sin(2 * np.pi * 440 * t)
        right = -left
        audio = np.stack([left, right])
        corr = check_phase_correlation(audio)
        assert corr == pytest.approx(-1.0, abs=1e-7)

    def test_uncorrelated_signal_near_zero(self):
        """Different frequencies should have low correlation."""
        audio = _make_stereo(100, 8000)
        corr = check_phase_correlation(audio)
        assert abs(corr) < 0.1


class TestSafetyEnforceCorrelation:
    def test_reduces_side_for_negative_correlation(self):
        """Should attenuate Side until correlation >= 0.2."""
        t = np.linspace(0, DURATION, SAMPLES, endpoint=False)
        left = 0.5 * np.sin(2 * np.pi * 440 * t)
        right = -left  # correlation = -1
        audio = np.stack([left, right])

        corrected = safety_enforce_correlation(audio, SR)
        corr = check_phase_correlation(corrected)
        assert corr >= 0.2

    def test_preserves_already_safe_signal(self):
        """Signal with positive correlation should pass through unchanged."""
        audio = _make_stereo(440, 440)
        corr_before = check_phase_correlation(audio)
        assert corr_before >= 0.2

        corrected = safety_enforce_correlation(audio, SR)
        corr_after = check_phase_correlation(corrected)
        assert corr_after >= 0.2


class TestSpatialPresets:
    def test_claridad_no_nan_no_clipping(self):
        """Claridad spatial processing should not produce NaN or clipping."""
        audio = _make_stereo(440, 880)
        mid, side = mid_side_encode(audio)
        processed_side = apply_claridad_spatial(side, SR)
        assert not np.any(np.isnan(processed_side))
        assert np.max(np.abs(processed_side)) <= 1.0 + 1e-6

    def test_cinematico_no_nan_no_clipping(self):
        """Cinematico spatial processing should not produce NaN or clipping."""
        audio = _make_stereo(440, 880)
        mid, side = mid_side_encode(audio)
        processed_side = apply_cinematico_spatial(side, SR)
        assert not np.any(np.isnan(processed_side))
        assert np.max(np.abs(processed_side)) <= 1.0 + 1e-6

    def test_claridad_roundtrip_shape(self):
        """Full encode → process → decode cycle preserves shape."""
        audio = _make_stereo(440, 880)
        mid, side = mid_side_encode(audio)
        processed_side = apply_claridad_spatial(side, SR)
        result = mid_side_decode(mid, processed_side)
        assert result.shape == audio.shape


# ── Side-channel HPF (Phase B — B1) ──────────────────────────────────


class TestSideHpf:
    def test_cuts_sub_bass_keeps_upper_mids(self):
        """apply_side_hpf must remove the sub-bass (60 Hz) from the side
        while leaving the upper-mids (1 kHz) untouched."""
        t = np.linspace(0, DURATION, SAMPLES, endpoint=False)
        side = 0.4 * np.sin(2 * np.pi * 60 * t) + 0.3 * np.sin(2 * np.pi * 1000 * t)
        out = apply_side_hpf(side, SR)

        lp = butter(4, 90.0 / (SR / 2.0), btype="low", output="sos")
        bp = butter(
            4, [900.0 / (SR / 2.0), 1100.0 / (SR / 2.0)], btype="band", output="sos"
        )
        start = int(0.1 * SR)  # skip the filter transient

        def rms(x):
            return float(np.sqrt(np.mean(x**2)))

        low_in = rms(sosfilt(lp, side)[start:])
        low_out = rms(sosfilt(lp, out)[start:])
        assert 20 * np.log10(low_out / low_in) < -10.0  # sub-bass cut hard

        mid_in = rms(sosfilt(bp, side)[start:])
        mid_out = rms(sosfilt(bp, out)[start:])
        assert abs(20 * np.log10(mid_out / mid_in)) < 1.0  # 1 kHz preserved

    def test_zero_side_stays_zero(self):
        z = np.zeros((2, SAMPLES))
        assert np.array_equal(apply_side_hpf(z, SR), z)

    def test_shape_and_dtype_preserved(self):
        t = np.linspace(0, DURATION, SAMPLES, endpoint=False)
        side = (0.3 * np.sin(2 * np.pi * 60 * t)).astype(np.float32)
        for x in (side, side[np.newaxis, :]):  # 1-D mono and (1, N)
            out = apply_side_hpf(x, SR)
            assert out.shape == x.shape
            assert out.dtype == x.dtype

    def test_default_corner_matches_anchor(self):
        assert SIDE_HPF_DEFAULT_HZ == 100.0


class TestEngineSideHpf:
    def test_gate_is_bit_exact_bypass_on_mono_material(self, tmp_path):
        """side_hpf_enabled=False (default) vs True on material with NO side
        content (identical L/R): the side is exactly zero, so the HPF is a
        no-op and both masters are bit-identical — even with different
        corners."""
        from audiomind.models.audio import MasteringParameters
        from audiomind.processing.engine import process_audio

        in_path = tmp_path / "in.wav"
        _write_stereo(in_path, _sub_bass_stereo(correlated=True))
        base = MasteringParameters(target_lufs_db=-14.0)

        out_off = tmp_path / "out_off.wav"
        out_a = tmp_path / "out_a.wav"
        out_b = tmp_path / "out_b.wav"
        process_audio(in_path, out_off, base)
        process_audio(
            in_path, out_a, base.model_copy(update={"side_hpf_enabled": True})
        )
        process_audio(
            in_path, out_b,
            base.model_copy(update={"side_hpf_enabled": True, "side_hpf_hz": 60.0}),
        )

        off, _ = _read_wav(out_off)
        a, _ = _read_wav(out_a)
        b, _ = _read_wav(out_b)
        np.testing.assert_array_equal(a, off)
        np.testing.assert_array_equal(b, off)

    def test_engaged_changes_master_on_decorrelated_sub_bass(self, tmp_path):
        """side_hpf_enabled=True with decorrelated sub-bass must change the
        final master. The <120 Hz mono collapse erases the direct side
        sub-bass difference (lone lows are mono-ized anyway), so the
        difference reaches the master through the loudness normalization and
        limiter stages downstream — the same coupling the other engaged-stage
        tests rely on."""
        from audiomind.models.audio import MasteringParameters
        from audiomind.processing.engine import process_audio

        in_path = tmp_path / "in.wav"
        _write_stereo(in_path, _sub_bass_stereo(correlated=False))
        base = MasteringParameters(target_lufs_db=-14.0)

        out_off = tmp_path / "out_off.wav"
        out_on = tmp_path / "out_on.wav"
        process_audio(in_path, out_off, base)
        m = process_audio(
            in_path, out_on, base.model_copy(update={"side_hpf_enabled": True})
        )

        off, _ = _read_wav(out_off)
        on, _ = _read_wav(out_on)
        assert not np.array_equal(off, on)
        assert np.all(np.isfinite(on))
        assert np.isfinite(m["integrated_lufs"])

    def test_cutoff_knob_changes_master(self, tmp_path):
        """The corner knob matters: 100 Hz vs 60 Hz treat the 60 Hz side
        content very differently (−17 dB vs −3 dB at the corner), so the
        masters differ."""
        from audiomind.models.audio import MasteringParameters
        from audiomind.processing.engine import process_audio

        in_path = tmp_path / "in.wav"
        _write_stereo(in_path, _sub_bass_stereo(correlated=False))
        base = MasteringParameters(target_lufs_db=-14.0)

        out_100 = tmp_path / "out_100.wav"
        out_60 = tmp_path / "out_60.wav"
        process_audio(
            in_path, out_100,
            base.model_copy(update={"side_hpf_enabled": True, "side_hpf_hz": 100.0}),
        )
        process_audio(
            in_path, out_60,
            base.model_copy(update={"side_hpf_enabled": True, "side_hpf_hz": 60.0}),
        )

        a, _ = _read_wav(out_100)
        b, _ = _read_wav(out_60)
        assert not np.array_equal(a, b)


def _sub_bass_stereo(correlated: bool, dur_s: float = 0.5, seed: int = 0) -> np.ndarray:
    """Stereo program with decorrelated (or exactly correlated) sub-bass.

    ``correlated=True``: both channels share the SAME array, so the side is
    exactly zero and the side HPF is a bit-exact no-op.
    ``correlated=False``: amplitude-decorrelated 60 Hz (0.4 vs 0.15) plus
    in-phase 300 Hz and independent bed noise — side content the HPF must
    clean.
    """
    n = int(SR * dur_s)
    t = np.linspace(0, dur_s, n, endpoint=False)
    rng = np.random.default_rng(seed)
    if correlated:
        mono = 0.4 * np.sin(2 * np.pi * 60 * t) + 0.1 * np.sin(2 * np.pi * 1000 * t)
        return np.stack([mono, mono])  # side == 0 exactly
    left = (
        0.4 * np.sin(2 * np.pi * 60 * t)
        + 0.1 * np.sin(2 * np.pi * 300 * t)
        + 0.05 * rng.standard_normal(n)
    )
    right = (
        0.15 * np.sin(2 * np.pi * 60 * t)
        + 0.1 * np.sin(2 * np.pi * 300 * t)
        + 0.05 * rng.standard_normal(n)
    )
    return np.stack([left, right])


def _write_stereo(path, x: np.ndarray, sr: int = SR):
    # 32-bit float WAV — lossless roundtrip so bit-exact bypass can be
    # asserted sample-for-sample.
    sf.write(str(path), x.T, sr, subtype="FLOAT")


def _read_wav(path):
    arr, sr = sf.read(str(path), always_2d=True)
    return arr.T, sr
