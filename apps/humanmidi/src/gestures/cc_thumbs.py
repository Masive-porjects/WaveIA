"""
CC thumbs gesture detector.
Maps left/right thumb positions to CC values with smoothing and dead zone.
Legacy mode: CC74 (filter), CC1 (modulation), Pitch Bend.
"""
import numpy as np
from typing import Optional

from .base_gesture import BaseGesture, GestureEvent
from ..core.hand_detector import HandDetector, FingerState


class CCThumbsGesture(BaseGesture):
    """
    Maps thumb positions to CC values.

    Left thumb (x position): CC74 (filter cutoff) or CC92 (reverb in studio mode)
    Right thumb (x position): CC1 (modulation) or CC74 (filter in studio mode)

    Uses EMA smoothing + dead zone to prevent jitter.
    """

    def __init__(self, config: dict | None = None):
        super().__init__(config)
        self.cc_left = self.config.get("cc_left_thumb", 74)
        self.cc_right = self.config.get("cc_right_thumb", 92)
        self.alpha = self.config.get("smoothing_alpha", 0.3)
        self.dead_zone = self.config.get("dead_zone", 2)

        # Smoothed values
        self._smoothed_left = 0
        self._smoothed_right = 0
        self._initialized = False

    def _map_thumb_to_cc(self, thumb_x: float, is_left_hand: bool) -> int:
        """Map thumb X position (0-1) to CC value (0-127)."""
        # Invert for left hand so moving right increases value
        if is_left_hand:
            val = 1.0 - thumb_x
        else:
            val = thumb_x
        return int(val * 127)

    def _apply_smoothing(self, raw: int, prev_smoothed: float) -> int:
        """Apply EMA smoothing with dead zone."""
        if not self._initialized:
            self._initialized = True
            return raw

        # Dead zone: ignore small changes
        if abs(raw - prev_smoothed) <= self.dead_zone:
            return int(prev_smoothed)

        # EMA: new = alpha * raw + (1-alpha) * prev
        smoothed = self.alpha * raw + (1 - self.alpha) * prev_smoothed
        return int(smoothed)

    def detect(self, landmarks: np.ndarray, finger_state: FingerState, hand_label: str) -> Optional[GestureEvent]:
        if not self.is_enabled():
            return None

        detector = HandDetector()
        thumb_x, _ = detector.get_thumb_position(landmarks)
        is_left = hand_label == "Left"

        raw_cc = self._map_thumb_to_cc(thumb_x, is_left)

        if is_left:
            smoothed = self._apply_smoothing(raw_cc, self._smoothed_left)
            self._smoothed_left = smoothed
            cc_num = self.cc_left
        else:
            smoothed = self._apply_smoothing(raw_cc, self._smoothed_right)
            self._smoothed_right = smoothed
            cc_num = self.cc_right

        return GestureEvent(
            gesture_type="cc_change",
            hand=hand_label,
            data={
                "cc": cc_num,
                "value": smoothed,
                "raw": raw_cc,
            },
            timestamp=__import__("time").time(),
        )