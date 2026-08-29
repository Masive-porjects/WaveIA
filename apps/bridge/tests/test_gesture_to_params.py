"""
Tests for GestureToParams - MIDI to LiveParams conversion.
"""
import pytest
import time
import sys
from pathlib import Path

# Add bridge root to path for live_params import
BRIDGE_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(BRIDGE_ROOT))

from src.gesture_to_params import (
    GestureToParams,
    cc_to_filter_cutoff,
    cc_to_reverb_mix,
    cc_to_delay_time,
    cc_to_echo_feedback,
    cc_to_drive,
    note_to_fx_preset,
)
from src.midi_listener import MidiMessage, MidiMsgType


class TestMathConversions:
    """Test exact mathematical conversions."""

    def test_filter_cutoff_log_scale(self):
        """Logarithmic: CC 0->200Hz, CC 127->12000Hz"""
        assert abs(cc_to_filter_cutoff(0) - 200.0) < 1.0
        assert abs(cc_to_filter_cutoff(127) - 12000.0) < 1.0
        # Mid point ~ geometric mean
        mid = cc_to_filter_cutoff(63)
        assert 1000 < mid < 2000

    def test_filter_cutoff_monotonic(self):
        """Should be strictly increasing."""
        prev = 0
        for cc in range(128):
            val = cc_to_filter_cutoff(cc)
            assert val > prev
            prev = val

    def test_reverb_mix_linear(self):
        """Linear: 0-127 -> 0.0-1.0"""
        assert cc_to_reverb_mix(0) == 0.0
        assert cc_to_reverb_mix(127) == 1.0
        assert abs(cc_to_reverb_mix(63) - 0.5) < 0.01

    def test_delay_time_linear(self):
        """Linear: 0-127 -> 50-800ms"""
        assert cc_to_delay_time(0) == 50.0
        assert cc_to_delay_time(127) == 800.0
        # CC 63 is not exact midpoint (0-127 has 128 values, midpoint at 63.5)
        # Expected: 50 + 750 * 63/127 = 50 + 372.047... = 422.047
        assert abs(cc_to_delay_time(63) - 422.047) < 0.01

    def test_echo_feedback_capped(self):
        """Linear but capped at 0.8"""
        assert cc_to_echo_feedback(0) == 0.0
        assert cc_to_echo_feedback(127) == 0.8
        # Should not exceed 0.8
        assert cc_to_echo_feedback(200) == 0.8

    def test_drive_linear(self):
        """Linear: 0-127 -> 0.0-1.0"""
        assert cc_to_drive(0) == 0.0
        assert cc_to_drive(127) == 1.0

    def test_note_to_preset_mapping(self):
        """Exact note to preset mapping."""
        assert note_to_fx_preset(36) == "clean"
        assert note_to_fx_preset(38) == "dub"
        assert note_to_fx_preset(42) == "big_room"
        assert note_to_fx_preset(49) == "radio"
        assert note_to_fx_preset(60) is None


class TestGestureToParams:
    @pytest.fixture
    def mapper(self):
        return GestureToParams()

    def _make_cc_msg(self, cc: int, value: int, channel: int = 0) -> MidiMessage:
        return MidiMessage(
            msg_type=MidiMsgType.CC,
            channel=channel,
            data1=cc,
            data2=value,
            timestamp=time.time(),
        )

    def _make_note_msg(self, note: int, velocity: int = 100, channel: int = 0) -> MidiMessage:
        return MidiMessage(
            msg_type=MidiMsgType.NOTE_ON,
            channel=channel,
            data1=note,
            data2=velocity,
            timestamp=time.time(),
        )

    def test_initial_state_neutral(self, mapper):
        """Default state should be neutral."""
        params = mapper.get_current()
        assert params.filter_cutoff == 12000.0
        assert params.reverb_mix == 0.0
        assert params.delay_time == 250.0
        assert params.echo_feedback == 0.0
        assert params.drive == 0.0
        assert params.fx_preset is None

    def test_cc74_filter_cutoff(self, mapper):
        """CC 74 -> filter_cutoff (log scale)."""
        msg = self._make_cc_msg(74, 63)
        params = mapper.process_midi(msg)

        assert params is not None
        # CC 63 -> ~1500 Hz (geometric mean of 200-12000)
        assert 1000 < params.filter_cutoff < 2000

    def test_cc92_reverb_mix(self, mapper):
        """CC 92 -> reverb_mix (linear)."""
        msg = self._make_cc_msg(92, 100)
        params = mapper.process_midi(msg)

        assert params is not None
        assert abs(params.reverb_mix - 100/127) < 0.01

    def test_cc71_delay_time(self, mapper):
        """CC 71 -> delay_time (linear 50-800ms)."""
        msg = self._make_cc_msg(71, 63)
        params = mapper.process_midi(msg)

        assert params is not None
        assert abs(params.delay_time - 422.047) < 0.1

    def test_cc73_echo_feedback(self, mapper):
        """CC 73 -> echo_feedback (linear, capped 0.8)."""
        msg = self._make_cc_msg(73, 100)
        params = mapper.process_midi(msg)

        assert params is not None
        assert abs(params.echo_feedback - 0.8*100/127) < 0.01

    def test_cc16_drive(self, mapper):
        """CC 16 -> drive (linear)."""
        msg = self._make_cc_msg(16, 80)
        params = mapper.process_midi(msg)

        assert params is not None
        assert abs(params.drive - 80/127) < 0.01

    def test_note_on_preset_change(self, mapper):
        """Note On 36,38,42,49 -> fx_preset."""
        for note, preset in [(36, "clean"), (38, "dub"), (42, "big_room"), (49, "radio")]:
            msg = self._make_note_msg(note)
            params = mapper.process_midi(msg)
            assert params is not None
            assert params.fx_preset == preset

    def test_unknown_cc_ignored(self, mapper):
        """Unknown CC should not update params."""
        msg = self._make_cc_msg(99, 100)  # Not mapped
        params = mapper.process_midi(msg)
        assert params is None

    def test_unknown_note_ignored(self, mapper):
        """Unknown note should not update preset."""
        msg = self._make_note_msg(60)  # Not a preset note
        params = mapper.process_midi(msg)
        assert params is None

    def test_multiple_updates_accumulate(self, mapper):
        """Multiple CCs should accumulate in state."""
        # Update filter
        msg1 = self._make_cc_msg(74, 100)
        params1 = mapper.process_midi(msg1)
        assert params1 is not None
        cutoff1 = params1.filter_cutoff

        # Update reverb
        msg2 = self._make_cc_msg(92, 64)
        params2 = mapper.process_midi(msg2)
        assert params2 is not None

        # Both should be set
        assert params2.filter_cutoff == cutoff1
        assert params2.reverb_mix == 64/127

    def test_reset_to_neutral(self, mapper):
        """Reset should return to neutral."""
        # Change some params
        mapper.process_midi(self._make_cc_msg(74, 0))  # Min cutoff
        mapper.process_midi(self._make_cc_msg(92, 127))  # Max reverb

        mapper.reset()

        params = mapper.get_current()
        assert params.filter_cutoff == 12000.0
        assert params.reverb_mix == 0.0
        assert params.delay_time == 250.0
        assert params.echo_feedback == 0.0
        assert params.drive == 0.0
        assert params.fx_preset is None