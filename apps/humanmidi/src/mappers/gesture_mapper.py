"""
Gesture Mapper - Routes gesture events to MIDI messages.
Combines multiple gesture detectors and emits MIDI.
"""
from typing import List, Optional
import numpy as np

from ..gestures.base_gesture import GestureEvent
from ..gestures.drums_gesture import DrumsGesture
from ..gestures.piano_gesture import PianoGesture
from ..gestures.cc_thumbs import CCThumbsGesture
from ..gestures.cc_controller import CCControllerGesture
from ..gestures.studio_gesture import StudioGesture
from ..core.hand_detector import HandDetector, FingerState, HandLandmarks
from ..core.midi_sender import MidiSender, MidiMessage


class GestureMapper:
    """
    Maps detected gestures to MIDI messages.

    Supports multiple modes:
    - "drums": 4-zone drum pads
    - "piano": 5-finger piano
    - "cc_controller": Legacy CC74/CC1/PitchBend
    - "studio": LiveParams mapping (Bridge mode)
    """

    def __init__(self, midi_sender: MidiSender, config: dict | None = None):
        self.midi = midi_sender
        self.config = config or {}
        self.mode = self.config.get("mode", "studio")

        # Initialize gesture detectors based on mode
        self.detectors: List = []

        gestures_cfg = self.config.get("gestures", {})

        if self.mode == "drums":
            self.detectors.append(DrumsGesture(gestures_cfg.get("drums")))
        elif self.mode == "piano":
            self.detectors.append(PianoGesture(gestures_cfg.get("piano")))
        elif self.mode == "cc_controller":
            self.detectors.append(CCControllerGesture(gestures_cfg.get("cc_controller")))
        elif self.mode == "studio":
            self.detectors.append(StudioGesture(gestures_cfg.get("studio")))
        else:
            # Default: enable all
            self.detectors.append(DrumsGesture(gestures_cfg.get("drums")))
            self.detectors.append(PianoGesture(gestures_cfg.get("piano")))
            self.detectors.append(CCThumbsGesture(gestures_cfg.get("cc_controller")))
            self.detectors.append(StudioGesture(gestures_cfg.get("studio")))

    def process_hands(self, hands: List[HandLandmarks]) -> List[GestureEvent]:
        """Process all detected hands through all active detectors."""
        all_events = []
        detector_instance = HandDetector()

        for hand in hands:
            finger_state = detector_instance.get_finger_state(hand.landmarks)

            for detector in self.detectors:
                if not detector.is_enabled():
                    continue

                result = detector.detect(hand.landmarks, finger_state, hand.handedness)
                if result:
                    # Handle both single event and list of events
                    if isinstance(result, list):
                        all_events.extend(result)
                    else:
                        all_events.append(result)

        return all_events

    def events_to_midi(self, events: List[GestureEvent]) -> List[MidiMessage]:
        """Convert gesture events to MIDI messages."""
        midi_msgs = []

        for event in events:
            if event.gesture_type == "drum_hit":
                data = event.data
                midi_msgs.append(MidiMessage(
                    type="note_on",
                    channel=9,  # Channel 10 (0-indexed) for drums
                    data1=data["note"],
                    data2=data["velocity"],
                ))
                # Schedule NoteOff (handled by main loop with cooldown)

            elif event.gesture_type in ("piano_note_on", "piano_note_off"):
                data = event.data
                midi_msgs.append(MidiMessage(
                    type="note_on" if event.gesture_type == "piano_note_on" else "note_off",
                    channel=0,
                    data1=data["note"],
                    data2=data.get("velocity", 100),
                ))

            elif event.gesture_type == "cc_change":
                data = event.data
                midi_msgs.append(MidiMessage(
                    type="cc",
                    channel=0,
                    data1=data["cc"],
                    data2=data["value"],
                ))

            elif event.gesture_type == "studio_param":
                data = event.data
                # Studio params are sent as CCs for Bridge to pick up
                midi_msgs.append(MidiMessage(
                    type="cc",
                    channel=0,
                    data1=data["cc"],
                    data2=data["value"],
                ))

            elif event.gesture_type == "studio_preset":
                data = event.data
                # Send as NoteOn for Bridge to detect preset change
                midi_msgs.append(MidiMessage(
                    type="note_on",
                    channel=0,
                    data1=data["note"],
                    data2=100,
                ))

        return midi_msgs

    def send_events(self, events: List[GestureEvent]) -> None:
        """Process events and send MIDI immediately."""
        midi_msgs = self.events_to_midi(events)
        for msg in midi_msgs:
            self.midi.send_message(msg)