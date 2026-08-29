"""
Piano gesture detector.
Maps 5 fingers to piano notes (C major scale), octave by hand height.
Anti-stuck-notes protection.
"""
import time
import numpy as np
from typing import Optional, List, Set

from .base_gesture import BaseGesture, GestureEvent
from ..core.hand_detector import HandDetector, FingerState


class PianoGesture(BaseGesture):
    """
    Detects piano notes from finger extensions.

    Finger mapping (thumb to pinky):
    - Thumb: root (offset 0)
    - Index: +2 semitones
    - Middle: +4 semitones
    - Ring: +5 semitones
    - Pinky: +7 semitones

    Octave determined by hand height (y position):
    - Higher hand = higher octave (range 2-6)
    """

    # C major scale intervals from root (C=0)
    FINGER_OFFSETS = [0, 2, 4, 5, 7]

    def __init__(self, config: dict | None = None):
        super().__init__(config)
        self.finger_offsets = self.config.get("finger_offsets", self.FINGER_OFFSETS)
        self.octave_range = self.config.get("octave_range", [2, 6])
        self.anti_stuck = self.config.get("anti_stuck_notes", True)

        # Track active notes to send NoteOff when released
        self._active_notes: Set[int] = set()
        self._prev_finger_states = [False] * 5

    def _calculate_note(self, finger_idx: int, hand_height: float) -> int:
        """Calculate MIDI note for a finger at given hand height."""
        # Map hand height (0-1 normalized) to octave range
        height_norm = max(0.0, min(1.0, hand_height))
        octave = int(self.octave_range[0] + height_norm * (self.octave_range[1] - self.octave_range[0] + 1))
        octave = min(octave, self.octave_range[1])

        # Base note: C in given octave (C0 = 12, C1 = 24, etc.)
        base_note = 12 * (octave + 1)  # C4 (middle C) = 60
        return base_note + self.finger_offsets[finger_idx]

    def detect(self, landmarks: np.ndarray, finger_state: FingerState, hand_label: str) -> Optional[GestureEvent]:
        if not self.is_enabled():
            return None

        detector = HandDetector()
        hand_height = detector.get_hand_height(landmarks)

        # Current finger states (index, middle, ring, pinky + thumb)
        current_states = [
            finger_state.thumb_extended,
            finger_state.index_extended,
            finger_state.middle_extended,
            finger_state.ring_extended,
            finger_state.pinky_extended,
        ]

        events = []

        # Detect note on/off for each finger
        for i, (prev, curr) in enumerate(zip(self._prev_finger_states, current_states)):
            note = self._calculate_note(i, hand_height)

            if curr and not prev:
                # Finger extended -> Note On
                if note not in self._active_notes:
                    self._active_notes.add(note)
                    events.append(GestureEvent(
                        gesture_type="piano_note_on",
                        hand=hand_label,
                        data={"note": note, "velocity": 100, "finger": i},
                        timestamp=time.time(),
                    ))
            elif not curr and prev:
                # Finger retracted -> Note Off
                if note in self._active_notes:
                    self._active_notes.discard(note)
                    events.append(GestureEvent(
                        gesture_type="piano_note_off",
                        hand=hand_label,
                        data={"note": note, "finger": i},
                        timestamp=time.time(),
                    ))

        # Anti-stuck: if hand lost, send NoteOff for all active notes
        if self.anti_stuck and finger_state.extended_count == 0 and self._active_notes:
            for note in list(self._active_notes):
                events.append(GestureEvent(
                    gesture_type="piano_note_off",
                    hand=hand_label,
                    data={"note": note, "finger": -1},
                    timestamp=time.time(),
                ))
            self._active_notes.clear()

        self._prev_finger_states = current_states

        # Return first event (or could batch)
        return events[0] if events else None