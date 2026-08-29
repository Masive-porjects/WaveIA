"""
Drums gesture detector.
Maps 4 horizontal zones to drum notes (kick, snare, closed HH, open HH).
Velocity based on hand speed. Cooldown to prevent double triggers.
"""
import time
import numpy as np
from typing import Optional

from .base_gesture import BaseGesture, GestureEvent
from ..core.hand_detector import HandDetector, FingerState


class DrumsGesture(BaseGesture):
    """
    Detects drum hits by dividing hand X position into zones.

    Zones (left to right):
    0: Kick (note 36)
    1: Snare (note 38)
    2: Closed Hi-Hat (note 42)
    3: Open Hi-Hat (note 49)
    """

    def __init__(self, config: dict | None = None):
        super().__init__(config)
        self.zones = self.config.get("zones", 4)
        self.notes = self.config.get("notes", [36, 38, 42, 49])
        self.cooldown_frames = self.config.get("cooldown_frames", 10)
        self.velocity_scale = self.config.get("velocity_scale", 1.0)

        # Cooldown tracking per zone
        self._cooldowns = [0] * self.zones
        self._prev_hand_center_x = None

    def detect(self, landmarks: np.ndarray, finger_state: FingerState, hand_label: str) -> Optional[GestureEvent]:
        if not self.is_enabled():
            return None

        # Only trigger on closed fist (all fingers closed) or specific gesture
        # For drums: trigger when hand makes a "hit" motion - quick downward movement
        # Simplified: trigger on any hand position change with fist closed

        # Get hand center X
        detector = HandDetector()  # Use static method
        hand_center_x, _ = detector.get_hand_center(landmarks)

        # Update cooldowns
        for i in range(self.zones):
            if self._cooldowns[i] > 0:
                self._cooldowns[i] -= 1

        # Detect hit: significant X movement or zone change with fist
        zone = int(hand_center_x * self.zones)
        zone = min(max(zone, 0), self.zones - 1)

        # Velocity based on horizontal speed
        velocity = 64
        if self._prev_hand_center_x is not None:
            speed = abs(hand_center_x - self._prev_hand_center_x)
            velocity = int(min(127, 64 + speed * 500 * self.velocity_scale))

        self._prev_hand_center_x = hand_center_x

        # Simple trigger: if fist closed (extended_count == 0) and cooldown expired
        if finger_state.extended_count == 0 and self._cooldowns[zone] == 0:
            self._cooldowns[zone] = self.cooldown_frames
            note = self.notes[zone]
            return GestureEvent(
                gesture_type="drum_hit",
                hand=hand_label,
                data={
                    "note": note,
                    "velocity": velocity,
                    "zone": zone,
                },
                timestamp=time.time(),
            )

        return None