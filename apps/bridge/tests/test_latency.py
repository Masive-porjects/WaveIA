"""
Tests for LatencyTracker - RTT measurement and stats.
"""
import pytest
import time

from src.latency import LatencyTracker, LatencySample


class TestLatencyTracker:
    @pytest.fixture
    def tracker(self):
        return LatencyTracker(max_samples=100)

    def test_record_ws_rtt(self, tracker):
        """Should record WebSocket RTT samples."""
        tracker.record_ws_rtt(10.5)
        tracker.record_ws_rtt(12.3)

        stats = tracker.get_stats()
        assert stats["total_samples"] == 2
        assert stats["ws_ping"]["count"] == 2
        assert stats["ws_ping"]["min_ms"] == 10.5
        assert stats["ws_ping"]["max_ms"] == 12.3

    def test_record_midi_to_ws(self, tracker):
        """Should record MIDI-to-WS latency."""
        midi_ts = time.time()
        ws_ts = midi_ts + 0.005  # 5ms later

        tracker.record_midi_to_ws(midi_ts, ws_ts)

        stats = tracker.get_stats()
        assert stats["midi_to_ws"]["count"] == 1
        # Should be ~5ms
        assert 4.0 < stats["midi_to_ws"]["mean_ms"] < 6.0

    def test_stats_calculations(self, tracker):
        """Stats should include mean, median, stdev, p95."""
        # Add samples
        for val in [10, 12, 11, 13, 100]:  # One outlier
            tracker.record_ws_rtt(val)

        stats = tracker.get_stats()
        ws = stats["ws_ping"]

        assert ws["count"] == 5
        assert ws["mean_ms"] == pytest.approx(29.2, rel=0.1)
        assert ws["median_ms"] == 12.0
        assert ws["p95_ms"] >= 13.0  # 95th percentile

    def test_max_samples_trim(self, tracker):
        """Should trim old samples when exceeding max_samples."""
        small_tracker = LatencyTracker(max_samples=5)
        for i in range(10):
            small_tracker.record_ws_rtt(float(i))

        assert len(small_tracker.samples) == 5
        # Should keep last 5 (5,6,7,8,9)
        assert small_tracker.samples[0].rtt_ms == 5.0

    def test_get_recent(self, tracker):
        """Should filter samples by time window."""
        now = time.time()
        tracker.record_ws_rtt(10.0)  # Will have timestamp ~now
        time.sleep(0.01)
        tracker.record_ws_rtt(20.0)

        recent = tracker.get_recent(seconds=0.005)  # Very small window
        # Should only get the most recent
        assert len(recent) >= 1

    def test_reset(self, tracker):
        """Reset should clear all samples."""
        tracker.record_ws_rtt(10.0)
        tracker.record_midi_to_ws(time.time(), time.time())
        assert tracker.get_stats()["total_samples"] == 2

        tracker.reset()
        assert tracker.get_stats()["total_samples"] == 0

    def test_empty_stats(self, tracker):
        """Empty tracker should return empty stats."""
        stats = tracker.get_stats()
        assert stats["count"] == 0
        assert stats["ws_ping"] == {}
        assert stats["midi_to_ws"] == {}

    def test_mixed_directions(self, tracker):
        """Should separate stats by direction."""
        tracker.record_ws_rtt(5.0)
        tracker.record_ws_rtt(15.0)
        tracker.record_midi_to_ws(time.time(), time.time() + 0.01)

        stats = tracker.get_stats()
        assert stats["ws_ping"]["count"] == 2
        assert stats["midi_to_ws"]["count"] == 1
        assert stats["total_samples"] == 3