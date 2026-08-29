"""
Legacy CC controller gesture detector.
Maps hand position to CC74 (filter), CC1 (modulation), Pitch Bend.
Kept for backward compatibility.
"""
import numpy as np
from typing import Optional

from .base_gesture import BaseGesture, GestureEvent
from ..core.hand_detector import HandDetector, FingerState


class CCControllerGesture(BaseGesture):
    """
    Legacy gesture mapping:
    - Hand X position -> CC74 (filter cutoff)
    - Hand Y position -> CC1 (modulation)
    - Hand width/spread -> Pitch Bend
    """

    def __init__(self, config: dict | None = None):
        super().__init__(config)
        self.cc_x = self.config.get("cc_x", 74)
        self.cc_y = self.config.get("cc_y", 1)
        self.alpha = self.config.get("smoothing_alpha", 0.3)
        self.dead_zone = self.config.get("dead_zone", 2)

        self._smoothed_x = 0
        self._smoothed_y = 0
        self._initialized = False

    def _map_range(self, val: float, in_min: float, in_max: float, out_min: int, out_max: int) -> int:
        """Map value from input range to output range."""
        val = max(in_min, min(in_max, val))
        ratio = (val - in_min) / (in_max - in_min)
        return int(out_min + ratio * (out_max - out_min))

    def _apply_smoothing(self, raw: int, prev_smoothed: float) -> int:
        if not self._initialized:
            self._initialized = True
            return raw

        if abs(raw - prev_smoothed) <= self.dead_zone:
            return int(prev_smoothed)

        smoothed = self.alpha * raw + (1 - self.alpha) * prev_smoothed
        return int(smoothed)

    def detect(self, landmarks: np.ndarray, finger_state: FingerState, hand_label: str) -> Optional[GestureEvent]:
        if not self.is_enabled():
            return None

        detector = HandDetector()
        center_x, center_y = detector.get_hand_center(landmarks)
        hand_width = detector.get_hand_height(landmarks)  # Approximate spread

        # Map to CC values
        raw_x = self._map_range(center_x, 0.1, 0.9, 0, 127)
        raw_y = self._map_range(center_y, 0.1, 0.9, 0, 127)

        smoothed_x = self._apply_smoothing(raw_x, self._smoothed_x)
        smoothed_y = self._apply_smoothing(raw_y, self._smoothed_y)

        self._smoothed_x = smoothed_x
        self._smoothed_y = smoothed_y

        events = []

        # CC74 (X)
        events.append(GestureEvent(
            gesture_type="cc_change",
            hand=hand_label,
            data={"cc": self.cc_x, "value": smoothed_x, "raw": raw_x},
            timestamp=__import__("time").time(),
        ))

        # CC1 (Y)
        events.append(GestureEvent(
            gesture_type="cc_change",
            hand=hand_label,
            data={"cc": self.cc_y, "value": smoothed_y, "raw": raw_y},
            timestamp=__import__("time").time(),
        ))

        return events[0] if events else None