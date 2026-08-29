"""
Visualizer - Draws hand landmarks, zones, FPS, and CC panels on video frame.
"""
import cv2
import numpy as np
import time
from typing import List, Optional

from ..core.hand_detector import HandDetector, HandLandmarks, FingerState
from ..core.midi_sender import MidiSender
from ..mappers.zone_mapper import ZoneMapper
from ..config.settings import get_config


class Visualizer:
    """Draws overlay on camera feed."""

    def __init__(self, config: dict | None = None):
        self.config = config or get_config()["ui"]
        self.fps_counter = 0
        self.fps_start = time.time()
        self.current_fps = 0.0

        # Zone mapper for drums visualization
        self.zone_mapper = ZoneMapper()

    def update_fps(self) -> None:
        """Update FPS counter."""
        self.fps_counter += 1
        now = time.time()
        if now - self.fps_start >= 1.0:
            self.current_fps = self.fps_counter / (now - self.fps_start)
            self.fps_counter = 0
            self.fps_start = now

    def draw(
        self,
        frame: np.ndarray,
        hands: List[HandLandmarks],
        finger_states: List[FingerState] | None = None,
        midi_sender: Optional[MidiSender] = None,
        mode: str = "studio",
        active_ccs: dict | None = None,
    ) -> np.ndarray:
        """
        Draw all overlays on frame.

        Args:
            frame: BGR frame to draw on.
            hands: List of detected HandLandmarks.
            finger_states: Optional precomputed finger states.
            midi_sender: Optional MidiSender for port status.
            mode: Current mode ("drums", "piano", "studio", etc.)
            active_ccs: Dict of current CC values for panel display.

        Returns:
            Frame with overlays drawn.
        """
        self.update_fps()

        ui_cfg = self.config

        # Draw landmarks
        if ui_cfg.get("show_landmarks", True):
            for hand in hands:
                frame = self._draw_hand(frame, hand)

        # Draw zones for drums mode
        if mode == "drums" and ui_cfg.get("show_zones", True):
            frame = self._draw_drum_zones(frame)

        # Draw bounding boxes
        if ui_cfg.get("show_bbox", True):
            frame = self._draw_bboxes(frame, hands)

        # Draw FPS
        if ui_cfg.get("show_fps", True):
            cv2.putText(
                frame,
                f"FPS: {self.current_fps:.1f}",
                (10, 30),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                (0, 255, 255),
                2,
            )

        # Draw CC panels
        if ui_cfg.get("show_cc_panels", True) and active_ccs:
            frame = self._draw_cc_panels(frame, active_ccs)

        # Draw mode indicator
        cv2.putText(
            frame,
            f"Mode: {mode.upper()}",
            (10, frame.shape[0] - 20),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (255, 255, 255),
            2,
        )

        # Draw MIDI port status
        if midi_sender:
            status = "CONNECTED" if midi_sender._is_open else "DISCONNECTED"
            color = (0, 255, 0) if midi_sender._is_open else (0, 0, 255)
            cv2.putText(
                frame,
                f"MIDI: {status}",
                (frame.shape[1] - 200, 30),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                color,
                2,
            )

        return frame

    def _draw_hand(self, frame: np.ndarray, hand: HandLandmarks) -> np.ndarray:
        """Draw hand landmarks and connections."""
        h, w = frame.shape[:2]
        points = hand.landmarks[:, :2] * np.array([w, h])
        points = points.astype(int)

        # Draw connections
        detector = HandDetector()
        for conn in detector.mp_hands.HAND_CONNECTIONS:
            p1, p2 = points[conn[0]], points[conn[1]]
            cv2.line(frame, tuple(p1), tuple(p2), (0, 255, 0), 2)

        # Draw points with handedness color
        color = (255, 100, 100) if hand.handedness == "Left" else (100, 100, 255)
        for pt in points:
            cv2.circle(frame, tuple(pt), 4, color, -1)

        # Draw handedness label at wrist
        wrist = points[0]
        cv2.putText(
            frame,
            hand.handedness,
            (wrist[0] + 10, wrist[1] - 10),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            color,
            2,
        )

        return frame

    def _draw_drum_zones(self, frame: np.ndarray) -> np.ndarray:
        """Draw drum zone boundaries."""
        h, w = frame.shape[:2]
        num_zones = 4
        zone_width = w // num_zones
        labels = ["KICK", "SNARE", "C.HH", "O.HH"]
        notes = [36, 38, 42, 49]

        for i in range(num_zones):
            x1 = i * zone_width
            x2 = (i + 1) * zone_width
            cv2.rectangle(frame, (x1, 0), (x2, h), (50, 50, 50), 1)
            cv2.putText(
                frame,
                f"{labels[i]} ({notes[i]})",
                (x1 + 5, 25),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                (200, 200, 200),
                1,
            )
        return frame

    def _draw_bboxes(self, frame: np.ndarray, hands: List[HandLandmarks]) -> np.ndarray:
        """Draw bounding boxes around hands."""
        h, w = frame.shape[:2]
        for hand in hands:
            points = hand.landmarks[:, :2] * np.array([w, h])
            x_min, y_min = points.min(axis=0).astype(int)
            x_max, y_max = points.max(axis=0).astype(int)
            color = (255, 100, 100) if hand.handedness == "Left" else (100, 100, 255)
            cv2.rectangle(frame, (x_min, y_min), (x_max, y_max), color, 2)
        return frame

    def _draw_cc_panels(self, frame: np.ndarray, active_ccs: dict) -> np.ndarray:
        """Draw CC value panels on right side."""
        h, w = frame.shape[:2]
        panel_w = 180
        panel_x = w - panel_w - 10
        y_start = 60

        # Background
        cv2.rectangle(
            frame,
            (panel_x - 5, y_start - 25),
            (w - 5, y_start + len(active_ccs) * 30 + 10),
            (0, 0, 0),
            -1,
        )
        cv2.rectangle(
            frame,
            (panel_x - 5, y_start - 25),
            (w - 5, y_start + len(active_ccs) * 30 + 10),
            (100, 100, 100),
            1,
        )

        cv2.putText(
            frame,
            "ACTIVE CCs",
            (panel_x, y_start),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            (255, 255, 255),
            1,
        )

        for i, (cc, value) in enumerate(sorted(active_ccs.items())):
            y = y_start + 25 + i * 25
            # CC label
            cv2.putText(
                frame,
                f"CC{cc}: {value}",
                (panel_x, y),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.45,
                (200, 200, 200),
                1,
            )
            # Bar
            bar_w = int((value / 127.0) * 100)
            cv2.rectangle(frame, (panel_x + 70, y - 12), (panel_x + 70 + bar_w, y - 2), (0, 255, 100), -1)
            cv2.rectangle(frame, (panel_x + 70, y - 12), (panel_x + 170, y - 2), (100, 100, 100), 1)

        return frame