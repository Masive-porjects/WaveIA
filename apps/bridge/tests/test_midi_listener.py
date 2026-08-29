"""
Tests for MidiListener.
"""
import pytest
from unittest.mock import Mock, patch, MagicMock, AsyncMock
import asyncio

from src.midi_listener import MidiListener, MidiMessage, MidiMsgType


class TestMidiListener:
    @pytest.fixture
    def listener(self):
        queue = asyncio.Queue()
        with patch('rtmidi.MidiIn') as mock_midi_class:
            mock_midi = Mock()
            mock_midi_class.return_value = mock_midi
            listener = MidiListener(port_name="TestPort", virtual=False, queue=queue)
            listener._midi_in = mock_midi
            yield listener

    def test_init(self):
        queue = asyncio.Queue()
        with patch('rtmidi.MidiIn'):
            listener = MidiListener(port_name="TestPort", virtual=True, queue=queue)
            assert listener.port_name == "TestPort"
            assert listener.virtual is True
            assert listener.queue is queue

    def test_list_ports(self):
        with patch('rtmidi.MidiIn') as mock_midi_class:
            mock_midi = Mock()
            mock_midi.get_ports.return_value = ["Port 1", "Port 2"]
            mock_midi_class.return_value = mock_midi

            listener = MidiListener()
            ports = listener.list_ports()
            assert ports == ["Port 1", "Port 2"]

    def test_open_port_found(self):
        with patch('rtmidi.MidiIn') as mock_midi_class:
            mock_midi = Mock()
            mock_midi.get_ports.return_value = ["TestPort", "Other"]
            mock_midi_class.return_value = mock_midi

            listener = MidiListener(port_name="TestPort", virtual=False)
            result = listener.open()

            assert result is True
            mock_midi.open_port.assert_called_once_with(0)
            assert listener._port_index == 0

    def test_open_port_not_found_no_virtual(self):
        with patch('rtmidi.MidiIn') as mock_midi_class:
            mock_midi = Mock()
            mock_midi.get_ports.return_value = ["Port 1", "Port 2"]
            mock_midi_class.return_value = mock_midi

            listener = MidiListener(port_name="NonExistent", virtual=False)
            result = listener.open()

            assert result is False

    def test_open_creates_virtual_port(self):
        with patch('rtmidi.MidiIn') as mock_midi_class:
            mock_midi = Mock()
            mock_midi.get_ports.return_value = ["Port 1", "Port 2"]
            mock_midi_class.return_value = mock_midi

            listener = MidiListener(port_name="TestPort", virtual=True)
            result = listener.open()

            assert result is True
            mock_midi.open_virtual_port.assert_called_once_with("TestPort")

    def test_callback_note_on(self):
        queue = asyncio.Queue()
        with patch('rtmidi.MidiIn') as mock_midi_class:
            mock_midi = Mock()
            mock_midi.get_ports.return_value = ["TestPort"]
            mock_midi_class.return_value = mock_midi

            listener = MidiListener(port_name="TestPort", virtual=True, queue=queue)
            listener._midi_in = mock_midi
            listener.open()

            # Simulate callback with Note On (channel 0, note 60, velocity 100)
            listener._callback(([0x90, 60, 100], 0.0))

            msg = queue.get_nowait()
            assert msg.msg_type == MidiMsgType.NOTE_ON
            assert msg.channel == 0
            assert msg.data1 == 60
            assert msg.data2 == 100

    def test_callback_note_on_zero_velocity_becomes_note_off(self):
        queue = asyncio.Queue()
        with patch('rtmidi.MidiIn') as mock_midi_class:
            mock_midi = Mock()
            mock_midi.get_ports.return_value = ["TestPort"]
            mock_midi_class.return_value = mock_midi

            listener = MidiListener(port_name="TestPort", virtual=True, queue=queue)
            listener._midi_in = mock_midi
            listener.open()

            # Note On with velocity 0 = Note Off
            listener._callback(([0x90, 60, 0], 0.0))

            msg = queue.get_nowait()
            assert msg.msg_type == MidiMsgType.NOTE_OFF
            assert msg.data1 == 60
            assert msg.data2 == 0

    def test_callback_note_off(self):
        queue = asyncio.Queue()
        with patch('rtmidi.MidiIn') as mock_midi_class:
            mock_midi = Mock()
            mock_midi.get_ports.return_value = ["TestPort"]
            mock_midi_class.return_value = mock_midi

            listener = MidiListener(port_name="TestPort", virtual=True, queue=queue)
            listener._midi_in = mock_midi
            listener.open()

            listener._callback(([0x80, 60, 64], 0.0))

            msg = queue.get_nowait()
            assert msg.msg_type == MidiMsgType.NOTE_OFF
            assert msg.channel == 0
            assert msg.data1 == 60
            assert msg.data2 == 64

    def test_callback_cc(self):
        queue = asyncio.Queue()
        with patch('rtmidi.MidiIn') as mock_midi_class:
            mock_midi = Mock()
            mock_midi.get_ports.return_value = ["TestPort"]
            mock_midi_class.return_value = mock_midi

            listener = MidiListener(port_name="TestPort", virtual=True, queue=queue)
            listener._midi_in = mock_midi
            listener.open()

            # CC 74 value 64 on channel 0
            listener._callback(([0xB0, 74, 64], 0.0))

            msg = queue.get_nowait()
            assert msg.msg_type == MidiMsgType.CC
            assert msg.channel == 0
            assert msg.data1 == 74
            assert msg.data2 == 64

    def test_callback_pitch_bend(self):
        queue = asyncio.Queue()
        with patch('rtmidi.MidiIn') as mock_midi_class:
            mock_midi = Mock()
            mock_midi.get_ports.return_value = ["TestPort"]
            mock_midi_class.return_value = mock_midi

            listener = MidiListener(port_name="TestPort", virtual=True, queue=queue)
            listener._midi_in = mock_midi
            listener.open()

            # Pitch bend: LSB=0, MSB=64 -> value = 64<<7 | 0 = 8192
            listener._callback(([0xE0, 0x00, 0x40], 0.0))

            msg = queue.get_nowait()
            assert msg.msg_type == MidiMsgType.PITCH_BEND
            assert msg.channel == 0
            assert msg.data2 == 8192

    def test_close(self):
        with patch('rtmidi.MidiIn') as mock_midi_class:
            mock_midi = Mock()
            mock_midi_class.return_value = mock_midi

            listener = MidiListener()
            listener._midi_in = mock_midi
            listener._running = True

            listener.close()

            assert listener._running is False
            mock_midi.close_port.assert_called_once()

    @pytest.mark.asyncio
    async def test_context_manager(self):
        with patch('rtmidi.MidiIn') as mock_midi_class:
            mock_midi = Mock()
            mock_midi.get_ports.return_value = ["TestPort"]
            mock_midi_class.return_value = mock_midi

            async with MidiListener(port_name="TestPort", virtual=True) as listener:
                assert listener._running is True

            mock_midi.close_port.assert_called_once()