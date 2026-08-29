"""
Gesture to LiveParams Mapper.
Converts MIDI CC/Note messages to LiveParams with exact mathematical conversions.
"""
import math
import time
from dataclasses import dataclass, field
from typing import Optional

from .live_params import LiveParams


# ─── Mathematical Conversions ────────────────────────────────────────

def cc_to_filter_cutoff(cc: int) -> float:
    """
    Logarithmic mapping for filter cutoff.
    200 Hz to 12000 Hz ≈ 6 octaves.
    f(cc) = 200 * (12000/200)^(cc/127)
    """
    cc = max(0, min(127, cc))
    return 200.0 * (60.0 ** (cc / 127.0))


def cc_to_reverb_mix(cc: int) -> float:
    """Linear: 0-127 -> 0.0-1.0"""
    return max(0.0, min(1.0, cc / 127.0))


def cc_to_delay_time(cc: int) -> float:
    """Linear: 0-127 -> 50-800 ms"""
    cc = max(0, min(127, cc))
    return 50.0 + 750.0 * (cc / 127.0)


def cc_to_echo_feedback(cc: int) -> float:
    """Linear: 0-127 -> 0.0-0.8 (capped for safety)"""
    return max(0.0, min(0.8, 0.8 * cc / 127.0))


def cc_to_drive(cc: int) -> float:
    """Linear: 0-127 -> 0.0-1.0"""
    return max(0.0, min(1.0, cc / 127.0))


def note_to_fx_preset(note: int) -> Optional[str]:
    """Map clap notes to FX presets."""
    mapping = {
        36: "clean",      # Kick zone
        38: "dub",        # Snare zone
        42: "big_room",   # Closed HH zone
        49: "radio",      # Open HH zone
    }
    return mapping.get(note)


# ─── Parameter State ────────────────────────────────────────────────

@dataclass
class ParamState:
    """Internal state for parameter smoothing and tracking."""
    filter_cutoff: float = 12000.0
    filter_res: float = 0.7
    drive: float = 0.0
    delay_time: float = 250.0
    echo_feedback: float = 0.0
    reverb_mix: float = 0.0
    output_level: float = 0.9
    fx_preset: Optional[str] = None
    last_update: float = field(default_factory=time.time)

    def to_live_params(self, ts: Optional[float] = None) -> LiveParams:
        return LiveParams(
            ts=ts or time.time(),
            filter_cutoff=self.filter_cutoff,
            filter_res=self.filter_res,
            drive=self.drive,
            delay_time=self.delay_time,
            echo_feedback=self.echo_feedback,
            reverb_mix=self.reverb_mix,
            output_level=self.output_level,
            fx_preset=self.fx_preset,
        )


# ─── Main Mapper Class ──────────────────────────────────────────────

class GestureToParams:
    """
    Maps incoming MIDI messages to LiveParams.

    Handles:
    - CC 74  -> filter_cutoff (logarithmic)
    - CC 92  -> reverb_mix (linear)
    - CC 71  -> delay_time (linear)
    - CC 73  -> echo_feedback (linear, capped 0.8)
    - CC 16  -> drive (linear)
    - Notes 36,38,42,49 -> fx_preset
    """

    # CC number to parameter mapping
    CC_MAP = {
        74: "filter_cutoff",
        92: "reverb_mix",
        71: "delay_time",
        73: "echo_feedback",
        16: "drive",
    }

    def __init__(self):
        self.state = ParamState()

    def process_midi(self, msg) -> Optional[LiveParams]:
        """
        Process a single MIDI message.

        Args:
            msg: MidiMessage from midi_listener

        Returns:
            Updated LiveParams if message was relevant, None otherwise
        """
        updated = False

        if msg.msg_type.value == "cc":
            updated = self._process_cc(msg.data1, msg.data2)

        elif msg.msg_type.value == "note_on":
            updated = self._process_note(msg.data1)

        if updated:
            self.state.last_update = time.time()
            return self.state.to_live_params()

        return None

    def _process_cc(self, cc: int, value: int) -> bool:
        """Process Control Change message."""
        param = self.CC_MAP.get(cc)
        if param is None:
            return False

        if param == "filter_cutoff":
            self.state.filter_cutoff = cc_to_filter_cutoff(value)
        elif param == "reverb_mix":
            self.state.reverb_mix = cc_to_reverb_mix(value)
        elif param == "delay_time":
            self.state.delay_time = cc_to_delay_time(value)
        elif param == "echo_feedback":
            self.state.echo_feedback = cc_to_echo_feedback(value)
        elif param == "drive":
            self.state.drive = cc_to_drive(value)
        else:
            return False

        return True

    def _process_note(self, note: int) -> bool:
        """Process Note On message for preset changes."""
        preset = note_to_fx_preset(note)
        if preset is None:
            return False

        self.state.fx_preset = preset
        return True

    def get_current(self) -> LiveParams:
        """Get current LiveParams without updating timestamp."""
        return self.state.to_live_params()

    def reset(self) -> None:
        """Reset to neutral/default values."""
        self.state = ParamState()