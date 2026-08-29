"""
MIDI sender using python-rtmidi.
Opens virtual MIDI port and sends NoteOn/Off, CC, Pitch Bend messages.
"""
import rtmidi
from typing import Optional, List
from dataclasses import dataclass

from ..config.settings import get_config


@dataclass
class MidiMessage:
    """Represents a MIDI message to send."""
    type: str  # "note_on", "note_off", "cc", "pitch_bend"
    channel: int  # 0-15
    data1: int  # note/cc number (0-127)
    data2: int  # velocity/value (0-127)


class MidiSender:
    """Sends MIDI messages to virtual port."""

    def __init__(self, config: dict | None = None):
        self.config = config or get_config()["midi"]
        self.midi_out = rtmidi.MidiOut()
        self.port_name = self.config["virtual_port_name"]
        self._port_index: Optional[int] = None
        self._is_open = False

    def list_ports(self) -> List[str]:
        """List available MIDI output ports."""
        return self.midi_out.get_ports()

    def open_port(self, port_name: str | None = None) -> bool:
        """
        Open MIDI output port by name.

        Args:
            port_name: Name of port to open. If None, uses config virtual_port_name.

        Returns:
            True if port opened successfully.
        """
        target_name = port_name or self.port_name
        ports = self.midi_out.get_ports()

        for i, port in enumerate(ports):
            if target_name.lower() in port.lower():
                self.midi_out.open_port(i)
                self._port_index = i
                self._is_open = True
                print(f"MIDI port opened: {port} (index {i})")
                return True

        print(f"MIDI port '{target_name}' not found. Available ports:")
        for p in ports:
            print(f"  - {p}")
        return False

    def open_virtual_port(self, port_name: str | None = None) -> bool:
        """
        Create a virtual MIDI port (Linux/Windows with appropriate backend).

        Note: On macOS, use IAC Driver. On Windows, use loopMIDI.
        This creates a port that other apps can connect to.
        """
        name = port_name or self.port_name
        try:
            self.midi_out.open_virtual_port(name)
            self._is_open = True
            print(f"Virtual MIDI port created: {name}")
            return True
        except Exception as e:
            print(f"Failed to create virtual port: {e}")
            return False

    def send_note_on(self, note: int, velocity: int = 100, channel: int = 0) -> None:
        """Send Note On message."""
        if not self._is_open:
            return
        msg = [0x90 | channel, note & 0x7F, velocity & 0x7F]
        self.midi_out.send_message(msg)

    def send_note_off(self, note: int, velocity: int = 0, channel: int = 0) -> None:
        """Send Note Off message."""
        if not self._is_open:
            return
        msg = [0x80 | channel, note & 0x7F, velocity & 0x7F]
        self.midi_out.send_message(msg)

    def send_cc(self, cc: int, value: int, channel: int = 0) -> None:
        """Send Control Change message."""
        if not self._is_open:
            return
        msg = [0xB0 | channel, cc & 0x7F, value & 0x7F]
        self.midi_out.send_message(msg)

    def send_pitch_bend(self, value: int, channel: int = 0) -> None:
        """Send Pitch Bend message (14-bit, 0-16383, center=8192)."""
        if not self._is_open:
            return
        lsb = value & 0x7F
        msb = (value >> 7) & 0x7F
        msg = [0xE0 | channel, lsb, msb]
        self.midi_out.send_message(msg)

    def send_message(self, message: MidiMessage) -> None:
        """Send a MidiMessage dataclass."""
        if message.type == "note_on":
            self.send_note_on(message.data1, message.data2, message.channel)
        elif message.type == "note_off":
            self.send_note_off(message.data1, message.data2, message.channel)
        elif message.type == "cc":
            self.send_cc(message.data1, message.data2, message.channel)
        elif message.type == "pitch_bend":
            self.send_pitch_bend(message.data2, message.channel)

    def close(self) -> None:
        """Close MIDI port."""
        if self._is_open:
            self.midi_out.close_port()
            self._is_open = False

    def __enter__(self):
        # Auto-open port on context entry
        if not self._is_open:
            self.open_port()
            if not self._is_open:
                self.open_virtual_port()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()