"""
MIDI Listener - Async rtmidi capture.
Listens to MIDI input port and pushes messages to asyncio queue.
"""
import asyncio
import rtmidi
from typing import Optional, Tuple
from dataclasses import dataclass
from enum import Enum

from .config import DEFAULT_CONFIG


class MidiMsgType(Enum):
    NOTE_ON = "note_on"
    NOTE_OFF = "note_off"
    CC = "cc"
    PITCH_BEND = "pitch_bend"
    UNKNOWN = "unknown"


@dataclass
class MidiMessage:
    """Normalized MIDI message."""
    msg_type: MidiMsgType
    channel: int      # 0-15
    data1: int        # Note number or CC number (0-127)
    data2: int        # Velocity or CC value (0-127)
    timestamp: float  # Time received (monotonic)


class MidiListener:
    """
    Async MIDI input listener.

    Uses rtmidi callback to push messages into asyncio.Queue
    for non-blocking consumption by the main loop.
    """

    def __init__(
        self,
        port_name: str = DEFAULT_CONFIG.midi_port_name,
        virtual: bool = DEFAULT_CONFIG.midi_virtual,
        queue: Optional[asyncio.Queue] = None,
    ):
        self.port_name = port_name
        self.virtual = virtual
        self.queue = queue or asyncio.Queue()
        self._midi_in: Optional[rtmidi.MidiIn] = None
        self._port_index: Optional[int] = None
        self._running = False

    def list_ports(self) -> list[str]:
        """List available MIDI input ports."""
        midi_in = rtmidi.MidiIn()
        return midi_in.get_ports()

    def open(self) -> bool:
        """Open MIDI input port."""
        self._midi_in = rtmidi.MidiIn()

        # Try to find port by name
        ports = self._midi_in.get_ports()
        for i, port in enumerate(ports):
            if self.port_name.lower() in port.lower():
                self._midi_in.open_port(i)
                self._port_index = i
                print(f"[MIDI] Opened port [{i}]: {port}")
                break

        # Fallback: create virtual port
        if self._port_index is None and self.virtual:
            try:
                self._midi_in.open_virtual_port(self.port_name)
                print(f"[MIDI] Created virtual port: {self.port_name}")
            except Exception as e:
                print(f"[MIDI] Failed to create virtual port: {e}")
                return False

        if self._port_index is None and not self.virtual:
            print(f"[MIDI] Port '{self.port_name}' not found. Available:")
            for p in ports:
                print(f"  - {p}")
            return False

        # Set callback
        self._midi_in.set_callback(self._callback)
        self._running = True
        return True

    def _callback(self, event, data=None):
        """rtmidi callback - runs in separate thread."""
        message, delta_time = event
        if not message:
            return

        # Parse MIDI message
        status = message[0] if len(message) > 0 else 0
        channel = status & 0x0F
        msg_type = status & 0xF0

        midi_msg = None

        if msg_type == 0x90 and len(message) >= 3:  # Note On
            note, velocity = message[1], message[2]
            if velocity > 0:
                midi_msg = MidiMessage(MidiMsgType.NOTE_ON, channel, note, velocity, delta_time)
            else:
                # Note On with velocity 0 = Note Off
                midi_msg = MidiMessage(MidiMsgType.NOTE_OFF, channel, note, 0, delta_time)

        elif msg_type == 0x80 and len(message) >= 3:  # Note Off
            note, velocity = message[1], message[2]
            midi_msg = MidiMessage(MidiMsgType.NOTE_OFF, channel, note, velocity, delta_time)

        elif msg_type == 0xB0 and len(message) >= 3:  # Control Change
            cc, value = message[1], message[2]
            midi_msg = MidiMessage(MidiMsgType.CC, channel, cc, value, delta_time)

        elif msg_type == 0xE0 and len(message) >= 3:  # Pitch Bend
            value = (message[2] << 7) | message[1]  # 14-bit
            midi_msg = MidiMessage(MidiMsgType.PITCH_BEND, channel, 0, value, delta_time)

        if midi_msg:
            # Thread-safe put into asyncio queue
            try:
                self.queue.put_nowait(midi_msg)
            except asyncio.QueueFull:
                pass  # Drop if queue full (backpressure)

    async def get_message(self) -> MidiMessage:
        """Get next MIDI message (async)."""
        return await self.queue.get()

    def close(self) -> None:
        """Close MIDI port."""
        self._running = False
        if self._midi_in:
            self._midi_in.close_port()
            self._midi_in = None

    async def __aenter__(self):
        self.open()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        self.close()