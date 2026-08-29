"""
Tests for MidiSender.
"""
import pytest
from unittest.mock import Mock, patch, MagicMock, PropertyMock

from src.core.midi_sender import MidiSender, MidiMessage


class TestMidiSender:
    def test_init(self):
        sender = MidiSender({"virtual_port_name": "TestPort"})
        assert sender.port_name == "TestPort"
        assert sender._is_open is False

    def test_list_ports(self):
        sender = MidiSender()
        # Mock the entire midi_out object
        mock_midi_out = Mock()
        mock_midi_out.get_ports.return_value = ["Port 1", "Port 2"]
        sender.midi_out = mock_midi_out

        ports = sender.list_ports()
        assert ports == ["Port 1", "Port 2"]

    def test_open_port_found(self):
        sender = MidiSender({"virtual_port_name": "TestPort"})
        mock_midi_out = Mock()
        mock_midi_out.get_ports.return_value = ["TestPort", "Other"]
        sender.midi_out = mock_midi_out

        result = sender.open_port()
        assert result is True
        mock_midi_out.open_port.assert_called_once_with(0)
        assert sender._is_open is True

    def test_open_port_not_found(self):
        sender = MidiSender({"virtual_port_name": "NonExistent"})
        mock_midi_out = Mock()
        mock_midi_out.get_ports.return_value = ["Port 1", "Port 2"]
        sender.midi_out = mock_midi_out

        result = sender.open_port()
        assert result is False
        assert sender._is_open is False

    def test_open_virtual_port(self):
        sender = MidiSender({"virtual_port_name": "TestPort"})
        mock_midi_out = Mock()
        mock_midi_out.open_virtual_port.return_value = None
        sender.midi_out = mock_midi_out

        result = sender.open_virtual_port()
        assert result is True
        mock_midi_out.open_virtual_port.assert_called_once_with("TestPort")
        assert sender._is_open is True

    def test_open_virtual_port_fails(self):
        sender = MidiSender({"virtual_port_name": "TestPort"})
        mock_midi_out = Mock()
        mock_midi_out.open_virtual_port.side_effect = Exception("Failed")
        sender.midi_out = mock_midi_out

        result = sender.open_virtual_port()
        assert result is False

    def test_send_note_on(self):
        sender = MidiSender()
        sender._is_open = True
        mock_midi_out = Mock()
        sender.midi_out = mock_midi_out

        sender.send_note_on(60, 100, 0)
        mock_midi_out.send_message.assert_called_once_with([0x90, 60, 100])

    def test_send_note_off(self):
        sender = MidiSender()
        sender._is_open = True
        mock_midi_out = Mock()
        sender.midi_out = mock_midi_out

        sender.send_note_off(60, 0, 0)
        mock_midi_out.send_message.assert_called_once_with([0x80, 60, 0])

    def test_send_cc(self):
        sender = MidiSender()
        sender._is_open = True
        mock_midi_out = Mock()
        sender.midi_out = mock_midi_out

        sender.send_cc(74, 64, 0)
        mock_midi_out.send_message.assert_called_once_with([0xB0, 74, 64])

    def test_send_pitch_bend(self):
        sender = MidiSender()
        sender._is_open = True
        mock_midi_out = Mock()
        sender.midi_out = mock_midi_out

        sender.send_pitch_bend(8192, 0)  # Center value
        mock_midi_out.send_message.assert_called_once_with([0xE0, 0x00, 0x40])

    def test_send_pitch_bend_max(self):
        sender = MidiSender()
        sender._is_open = True
        mock_midi_out = Mock()
        sender.midi_out = mock_midi_out

        sender.send_pitch_bend(16383, 0)  # Max value
        mock_midi_out.send_message.assert_called_once_with([0xE0, 0x7F, 0x7F])

    def test_send_message_note_on(self):
        sender = MidiSender()
        sender._is_open = True
        mock_midi_out = Mock()
        sender.midi_out = mock_midi_out

        sender.send_message(MidiMessage("note_on", 0, 60, 100))
        mock_midi_out.send_message.assert_called_once_with([0x90, 60, 100])

    def test_send_message_note_off(self):
        sender = MidiSender()
        sender._is_open = True
        mock_midi_out = Mock()
        sender.midi_out = mock_midi_out

        sender.send_message(MidiMessage("note_off", 0, 60, 0))
        mock_midi_out.send_message.assert_called_once_with([0x80, 60, 0])

    def test_send_message_cc(self):
        sender = MidiSender()
        sender._is_open = True
        mock_midi_out = Mock()
        sender.midi_out = mock_midi_out

        sender.send_message(MidiMessage("cc", 0, 74, 64))
        mock_midi_out.send_message.assert_called_once_with([0xB0, 74, 64])

    def test_send_message_pitch_bend(self):
        sender = MidiSender()
        sender._is_open = True
        mock_midi_out = Mock()
        sender.midi_out = mock_midi_out

        sender.send_message(MidiMessage("pitch_bend", 0, 0, 8192))
        mock_midi_out.send_message.assert_called_once_with([0xE0, 0x00, 0x40])

    def test_close(self):
        sender = MidiSender()
        sender._is_open = True
        mock_midi_out = Mock()
        sender.midi_out = mock_midi_out

        sender.close()
        mock_midi_out.close_port.assert_called_once()
        assert sender._is_open is False

    def test_context_manager(self):
        mock_midi_out = Mock()
        mock_midi_out.get_ports.return_value = ["TestPort"]

        with patch('src.core.midi_sender.rtmidi.MidiOut', return_value=mock_midi_out):
            with MidiSender({"virtual_port_name": "TestPort"}) as sender:
                assert sender._is_open is True
            mock_midi_out.close_port.assert_called_once()

    def test_send_when_closed(self):
        """Sending when not open should be no-op."""
        sender = MidiSender()
        sender._is_open = False
        mock_midi_out = Mock()
        sender.midi_out = mock_midi_out

        sender.send_note_on(60, 100)
        sender.send_cc(74, 64)
        sender.send_pitch_bend(8192)

        mock_midi_out.send_message.assert_not_called()