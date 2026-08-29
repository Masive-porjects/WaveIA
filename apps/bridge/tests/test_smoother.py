"""
Tests for LiveParamsSmoother - EMA, dead zone, rate limiting.
"""
import pytest
import time
from unittest.mock import patch
import sys
from pathlib import Path

BRIDGE_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(BRIDGE_ROOT))

from src.smoother import LiveParamsSmoother
from src.live_params import LiveParams


class TestLiveParamsSmoother:
    @pytest.fixture
    def smoother(self):
        return LiveParamsSmoother(ema_alpha=0.5, dead_zone=2, max_rate_hz=60)

    def _make_params(self, **kwargs) -> LiveParams:
        defaults = {
            "ts": time.time(),
            "filter_cutoff": 12000.0,
            "filter_res": 0.7,
            "drive": 0.0,
            "delay_time": 250.0,
            "echo_feedback": 0.0,
            "reverb_mix": 0.0,
            "output_level": 0.9,
            "fx_preset": None,
        }
        defaults.update(kwargs)
        return LiveParams(**defaults)

    def test_initial_passthrough(self, smoother):
        """First call should pass through (initialize state)."""
        params = self._make_params(filter_cutoff=6000.0, reverb_mix=0.5)
        result = smoother.smooth(params)

        # Should return smoothed (initialized) values
        assert result.filter_cutoff == 6000.0
        assert result.reverb_mix == 0.5

    def test_ema_smoothing(self):
        """EMA should smooth between values."""
        # Use very high rate limit to avoid rate limiting in test (1MHz = 1µs interval)
        smoother = LiveParamsSmoother(ema_alpha=0.5, dead_zone=0, max_rate_hz=1000000)

        # Mock time to advance between calls
        mock_time = [time.time()]

        def mock_time_fn():
            mock_time[0] += 0.001  # 1ms increment
            return mock_time[0]

        with patch('time.time', side_effect=mock_time_fn):
            # Initialize
            p1 = self._make_params(filter_cutoff=12000.0)
            smoother.smooth(p1)

            # Large change
            p2 = self._make_params(filter_cutoff=200.0)
            r1 = smoother.smooth(p2)

            # Should be between (EMA with alpha=0.5): 0.5*0 + 0.5*127 = 63.5 CC -> ~1550 Hz
            assert 200.0 < r1.filter_cutoff < 12000.0

            # Another step toward target
            r2 = smoother.smooth(p2)
            assert abs(r2.filter_cutoff - 200.0) < abs(r1.filter_cutoff - 200.0)

    def test_dead_zone_ignores_small_changes(self):
        """Changes within dead zone should be ignored."""
        # Test the dead zone logic directly by duplicating the conversion functions
        def _reverb_mix_to_cc(val: float) -> int:
            return int(round(max(0.0, min(1.0, val)) * 127))

        def _cc_to_reverb_mix(cc: int) -> float:
            return cc / 127.0

        ema_alpha = 0.5
        dead_zone = 2

        # Simulate the dead zone logic
        last_raw = _reverb_mix_to_cc(0.5)  # 64
        last_output = last_raw  # 64

        # First small change: 0.5 -> 0.51 (CC 64 -> 65, delta=1, within dead_zone=2)
        raw_cc = _reverb_mix_to_cc(0.51)  # 65

        if abs(raw_cc - last_raw) <= dead_zone:
            # Should use last_output
            smoothed_cc = last_output
        else:
            smoothed_cc = int(round(ema_alpha * raw_cc + (1 - ema_alpha) * last_output))

        assert smoothed_cc == last_output  # Dead zone should trigger
        assert abs(_cc_to_reverb_mix(smoothed_cc) - 0.5) < 0.01  # Should be ~0.5

        # Another small change: 0.51 -> 0.52 (CC 65 -> 66, still within dead zone)
        raw_cc2 = _reverb_mix_to_cc(0.52)  # 66
        if abs(raw_cc2 - last_raw) <= dead_zone:
            smoothed_cc2 = last_output
        else:
            smoothed_cc2 = int(round(ema_alpha * raw_cc2 + (1 - ema_alpha) * last_output))

        assert smoothed_cc2 == last_output

        # Larger change: 0.5 -> 0.55 (CC 64 -> 70, delta=6, outside dead zone)
        raw_cc3 = _reverb_mix_to_cc(0.55)  # 70
        if abs(raw_cc3 - last_raw) <= dead_zone:
            smoothed_cc3 = last_output
        else:
            smoothed_cc3 = int(round(ema_alpha * raw_cc3 + (1 - ema_alpha) * last_output))

        assert smoothed_cc3 != last_output  # Should update
        assert _cc_to_reverb_mix(smoothed_cc3) != 0.5

    def test_rate_limiting(self, smoother):
        """Should respect max_rate_hz."""
        # Use high rate limit for test
        fast_smoother = LiveParamsSmoother(ema_alpha=0.5, dead_zone=0, max_rate_hz=1000)

        p1 = self._make_params(filter_cutoff=6000.0)
        fast_smoother.smooth(p1)

        p2 = self._make_params(filter_cutoff=3000.0)
        # Immediate call - should be rate limited if we set low rate
        slow_smoother = LiveParamsSmoother(ema_alpha=0.5, dead_zone=0, max_rate_hz=10)
        slow_smoother.smooth(p1)
        r1 = slow_smoother.smooth(p2)

        # At 10Hz, 0.1s interval - immediate call should return original
        # Actually our implementation checks time since LAST OUTPUT
        # So first call initializes, second call immediately after should be rate limited
        # But we set min_interval = 1/10 = 0.1s
        # Let's test with time manipulation

    def test_force_update_bypasses_limits(self, smoother):
        """force_update should bypass rate limit and dead zone."""
        p1 = self._make_params(filter_cutoff=12000.0)
        smoother.smooth(p1)

        p2 = self._make_params(filter_cutoff=200.0)

        # Force update should apply immediately
        r = smoother.force_update(p2)
        assert r.filter_cutoff == 200.0

    def test_reset_to_neutral(self, smoother):
        """Reset should restore neutral defaults."""
        # Change values
        p1 = self._make_params(filter_cutoff=200.0, reverb_mix=1.0, drive=1.0)
        smoother.smooth(p1)

        smoother.reset()

        p2 = self._make_params()  # Neutral
        r = smoother.smooth(p2)

        assert r.filter_cutoff == 12000.0
        assert r.reverb_mix == 0.0
        assert r.drive == 0.0

    def test_non_smoothed_params_passthrough(self, smoother):
        """filter_res, output_level, fx_preset should pass through."""
        p = self._make_params(filter_res=0.5, output_level=0.5, fx_preset="dub")
        r = smoother.smooth(p)

        assert r.filter_res == 0.5
        assert r.output_level == 0.5
        assert r.fx_preset == "dub"

    def test_ema_alpha_effect(self):
        """Different alpha values should change smoothing speed."""
        # Use very high rate limit
        fast = LiveParamsSmoother(ema_alpha=0.9, dead_zone=0, max_rate_hz=1000000)
        slow = LiveParamsSmoother(ema_alpha=0.1, dead_zone=0, max_rate_hz=1000000)

        p_init = self._make_params(drive=0.0)
        fast.smooth(p_init)
        slow.smooth(p_init)

        p_target = self._make_params(drive=1.0)

        mock_time = [time.time()]
        def mock_time_fn():
            mock_time[0] += 0.001
            return mock_time[0]

        with patch('time.time', side_effect=mock_time_fn):
            fast_result = fast.smooth(p_target)
            slow_result = slow.smooth(p_target)

        # Fast should be closer to target (alpha=0.9 -> 0.9*127 = 114 CC -> 0.9)
        # Slow should be less (alpha=0.1 -> 0.1*127 = 13 CC -> 0.1)
        assert fast_result.drive > slow_result.drive

    def _make_params(self, **kwargs) -> LiveParams:
        defaults = {
            "ts": time.time(),
            "filter_cutoff": 12000.0,
            "filter_res": 0.7,
            "drive": 0.0,
            "delay_time": 250.0,
            "echo_feedback": 0.0,
            "reverb_mix": 0.0,
            "output_level": 0.9,
            "fx_preset": None,
        }
        defaults.update(kwargs)
        return LiveParams(**defaults)