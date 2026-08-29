"""
Latency Measurement - Round-trip time tracking.
Provides utilities for measuring and reporting pipeline latency.
"""
import time
import statistics
from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class LatencySample:
    """Single latency measurement."""
    timestamp: float
    rtt_ms: float
    direction: str  # "ws_ping" or "midi_to_ws"


class LatencyTracker:
    """
    Tracks and reports pipeline latency metrics.

    Measures:
    - WebSocket ping/pong RTT
    - MIDI input to WS output latency (when timestamped at source)
    """

    def __init__(self, max_samples: int = 1000):
        self.max_samples = max_samples
        self.samples: List[LatencySample] = []
        self._midi_timestamps: dict = {}  # For tracking MIDI->WS latency

    def record_ws_rtt(self, rtt_ms: float) -> None:
        """Record WebSocket ping/pong round-trip time."""
        self.samples.append(LatencySample(
            timestamp=time.time(),
            rtt_ms=rtt_ms,
            direction="ws_ping",
        ))
        self._trim()

    def record_midi_to_ws(self, midi_ts: float, ws_send_ts: float) -> None:
        """Record MIDI input to WS output latency."""
        latency_ms = (ws_send_ts - midi_ts) * 1000
        self.samples.append(LatencySample(
            timestamp=ws_send_ts,
            rtt_ms=latency_ms,
            direction="midi_to_ws",
        ))
        self._trim()

    def _trim(self) -> None:
        """Keep only recent samples."""
        if len(self.samples) > self.max_samples:
            self.samples = self.samples[-self.max_samples:]

    def get_stats(self) -> dict:
        """Get latency statistics."""
        if not self.samples:
            return {
                "total_samples": 0,
                "count": 0,
                "ws_ping": {},
                "midi_to_ws": {},
            }

        ws_samples = [s.rtt_ms for s in self.samples if s.direction == "ws_ping"]
        midi_samples = [s.rtt_ms for s in self.samples if s.direction == "midi_to_ws"]

        def stats(vals: List[float]) -> dict:
            if not vals:
                return {}
            return {
                "count": len(vals),
                "min_ms": min(vals),
                "max_ms": max(vals),
                "mean_ms": statistics.mean(vals),
                "median_ms": statistics.median(vals),
                "stdev_ms": statistics.stdev(vals) if len(vals) > 1 else 0,
                "p95_ms": sorted(vals)[int(len(vals) * 0.95)] if vals else 0,
            }

        return {
            "total_samples": len(self.samples),
            "ws_ping": stats(ws_samples),
            "midi_to_ws": stats(midi_samples),
        }

    def get_recent(self, seconds: float = 10.0) -> List[LatencySample]:
        """Get samples from last N seconds."""
        cutoff = time.time() - seconds
        return [s for s in self.samples if s.timestamp >= cutoff]

    def reset(self) -> None:
        """Clear all samples."""
        self.samples.clear()