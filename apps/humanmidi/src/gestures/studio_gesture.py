"""
Studio gesture detector - BRIDGE MODE.
Maps 5 gestures + claps to LiveParams CCs (for Bridge -> Live Engine).

EXACT MAPPING per spec:
- CC 74  = Pulgar derecho (Right thumb X) -> filter_cutoff (LOG: 200 * (12000/200)^(v/127))
- CC 92  = Pulgar izquierdo (Left thumb X) -> reverb_mix (v/127)
- CC 71  = Altura mano (Hand Y) -> delay_time (50 + 750*(v/127))
- CC 73  = Apertura mano (Hand spread) -> echo_feedback (0.8 * v/127)
- CC 16  = Posicion X (Hand X) -> drive (v/127)
- Nota 36/38/42/49 = Palmada zona 0-3 -> fx_preset (clean/dub/big_room/radio)

Uses EMA smoothing (alpha=0.3) + dead zone (±2 CC).
"""
import math
import time
import numpy as np
from typing import Optional, List

from .base_gesture import BaseGesture, GestureEvent
from ..core.hand_detector import HandDetector, FingerState


class StudioGesture(BaseGesture):
    """
    Maps hand gestures to LiveParams CCs for real-time FX control.

    Gesture -> CC mapping:
    - Right thumb X -> CC74 (filter_cutoff, LOG scale)
    - Left thumb X -> CC92 (reverb_mix, linear)
    - Hand Y (height) -> CC71 (delay_time, linear)
    - Hand spread (width) -> CC73 (echo_feedback, linear)
    - Hand X (center) -> CC16 (drive, linear)
    - Clap zones (4 zones) -> NoteOn 36/38/42/49 (fx_preset)
    """

    # FX Preset mapping from clap zones
    CLAP_NOTES = [36, 38, 42, 49]  # Kick, Snare, CHH, OHH zones
    CLAP_PRESETS = ["clean", "dub", "big_room", "radio"]

    def __init__(self, config: dict | None = None):
        super().__init__(config)
        self.alpha = self.config.get("smoothing_alpha", 0.3)
        self.dead_zone = self.config.get("dead_zone", 2)

        # Smoothed CC values
        self._smoothed = {
            "cc74": 0,   # Right thumb -> filter_cutoff
            "cc92": 0,   # Left thumb -> reverb_mix
            "cc71": 0,   # Hand Y -> delay_time
            "cc73": 0,   # Hand spread -> echo_feedback
            "cc16": 0,   # Hand X -> drive
        }
        self._initialized = False

        # Clap detection
        self._prev_fist = { "Left": False, "Right": False }
        self._clap_cooldown = 0

    def _log_scale_filter(self, cc_val: int) -> float:
        """
        Logarithmic scaling for filter cutoff.
        200 Hz to 12000 Hz = ~6 octaves.
        filter_cutoff = 200 * (12000/200)^(cc/127)
        """
        return 200.0 * (60.0 ** (cc_val / 127.0))

    def _map_range(self, val: float, in_min: float, in_max: float, out_min: float, out_max: float) -> float:
        val = max(in_min, min(in_max, val))
        ratio = (val - in_min) / (in_max - in_min)
        return out_min + ratio * (out_max - out_min)

    def _apply_smoothing(self, key: str, raw: int) -> int:
        if not self._initialized:
            self._initialized = True
            self._smoothed[key] = raw
            return raw

        if abs(raw - self._smoothed[key]) <= self.dead_zone:
            return int(self._smoothed[key])

        smoothed = self.alpha * raw + (1 - self.alpha) * self._smoothed[key]
        self._smoothed[key] = smoothed
        return int(smoothed)

    def _detect_clap(self, finger_state: FingerState, hand_label: str) -> Optional[int]:
        """Detect clap (fist -> open transition). Returns zone index 0-3 or None."""
        is_fist = finger_state.extended_count == 0
        was_fist = self._prev_fist.get(hand_label, False)
        self._prev_fist[hand_label] = is_fist

        if was_fist and not is_fist and self._clap_cooldown == 0:
            # Clap detected! Determine zone from hand X position
            # We'll need landmarks for X position - caller should pass it
            self._clap_cooldown = 15  # frames
            return True
        return False

    def detect(self, landmarks: np.ndarray, finger_state: FingerState, hand_label: str) -> Optional[GestureEvent]:
        if not self.is_enabled():
            return None

        detector = HandDetector()

        # Get hand metrics
        thumb_x, thumb_y = detector.get_thumb_position(landmarks)
        center_x, center_y = detector.get_hand_center(landmarks)
        hand_height = detector.get_hand_height(landmarks)
        hand_spread = hand_height  # Approximate

        events = []

        # --- Right thumb X -> CC74 (filter_cutoff, LOG) ---
        if hand_label == "Right":
            raw_cc74 = int(self._map_range(thumb_x, 0.1, 0.9, 0, 127))
            smoothed_74 = self._apply_smoothing("cc74", raw_cc74)
            events.append(GestureEvent(
                gesture_type="studio_param",
                hand=hand_label,
                data={
                    "cc": 74,
                    "value": smoothed_74,
                    "param": "filter_cutoff",
                    "param_value": self._log_scale_filter(smoothed_74),  # Hz
                },
                timestamp=time.time(),
            ))

        # --- Left thumb X -> CC92 (reverb_mix, linear) ---
        if hand_label == "Left":
            raw_cc92 = int(self._map_range(thumb_x, 0.1, 0.9, 0, 127))
            smoothed_92 = self._apply_smoothing("cc92", raw_cc92)
            events.append(GestureEvent(
                gesture_type="studio_param",
                hand=hand_label,
                data={
                    "cc": 92,
                    "value": smoothed_92,
                    "param": "reverb_mix",
                    "param_value": smoothed_92 / 127.0,
                },
                timestamp=time.time(),
            ))

        # --- Hand Y -> CC71 (delay_time: 50-800ms) ---
        # Invert Y so higher hand = longer delay
        raw_cc71 = int(self._map_range(1.0 - center_y, 0.1, 0.9, 0, 127))
        smoothed_71 = self._apply_smoothing("cc71", raw_cc71)
        delay_ms = 50.0 + 750.0 * (smoothed_71 / 127.0)
        events.append(GestureEvent(
            gesture_type="studio_param",
            hand=hand_label,
            data={
                "cc": 71,
                "value": smoothed_71,
                "param": "delay_time",
                "param_value": delay_ms,
            },
            timestamp=time.time(),
        ))

        # --- Hand spread -> CC73 (echo_feedback: 0-0.8) ---
        raw_cc73 = int(self._map_range(hand_spread, 0.05, 0.3, 0, 127))
        smoothed_73 = self._apply_smoothing("cc73", raw_cc73)
        echo_fb = 0.8 * (smoothed_73 / 127.0)
        events.append(GestureEvent(
            gesture_type="studio_param",
            hand=hand_label,
            data={
                "cc": 73,
                "value": smoothed_73,
                "param": "echo_feedback",
                "param_value": echo_fb,
            },
            timestamp=time.time(),
        ))

        # --- Hand X -> CC16 (drive: 0-1) ---
        raw_cc16 = int(self._map_range(center_x, 0.1, 0.9, 0, 127))
        smoothed_16 = self._apply_smoothing("cc16", raw_cc16)
        events.append(GestureEvent(
            gesture_type="studio_param",
            hand=hand_label,
            data={
                "cc": 16,
                "value": smoothed_16,
                "param": "drive",
                "param_value": smoothed_16 / 127.0,
            },
            timestamp=time.time(),
        ))

        # --- Clap detection -> fx_preset ---
        if self._clap_cooldown > 0:
            self._clap_cooldown -= 1

        is_fist = finger_state.extended_count == 0
        was_fist = self._prev_fist.get(hand_label, False)
        self._prev_fist[hand_label] = is_fist

        if was_fist and not is_fist and self._clap_cooldown == 0:
            # Determine zone from hand X
            zone = int(center_x * 4)
            zone = min(max(zone, 0), 3)
            self._clap_cooldown = 15

            events.append(GestureEvent(
                gesture_type="studio_preset",
                hand=hand_label,
                data={
                    "note": self.CLAP_NOTES[zone],
                    "preset": self.CLAP_PRESETS[zone],
                    "zone": zone,
                },
                timestamp=time.time(),
            ))

        # Return all events for full parameter update
        return events

    def get_all_params(self) -> dict:
        """Get all current smoothed parameter values for LiveParams."""
        return {
            "filter_cutoff": self._log_scale_filter(self._smoothed["cc74"]),
            "filter_res": 0.7,  # Default
            "drive": self._smoothed["cc16"] / 127.0,
            "delay_time": 50.0 + 750.0 * (self._smoothed["cc71"] / 127.0),
            "echo_feedback": 0.8 * (self._smoothed["cc73"] / 127.0),
            "reverb_mix": self._smoothed["cc92"] / 127.0,
            "output_level": 0.9,  # Default
            "fx_preset": None,  # Set by clap
        }