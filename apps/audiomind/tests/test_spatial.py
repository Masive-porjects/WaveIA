"""Tests for spatial.py — Mid/Side processing (Section 5.7)."""
import numpy as np
import pytest

from audiomind.processing.spatial import (
    mid_side_encode,
    mid_side_decode,
    apply_claridad_spatial,
    apply_cinematico_spatial,
    check_phase_correlation,
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
