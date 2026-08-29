"""
Hand detector using MediaPipe.
Detects hand landmarks, finger extensions, and provides normalized coordinates.
"""
import cv2
import numpy as np
import mediapipe as mp
from typing import Optional, List, Tuple
from dataclasses import dataclass

from ..config.settings import get_config


@dataclass
class HandLandmarks:
    """Normalized hand landmarks (0-1 range)."""
    landmarks: np.ndarray
    handedness: str
    score: float


@dataclass
class FingerState:
    """Extended finger states for a hand."""
    thumb_extended: bool
    index_extended: bool
    middle_extended: bool
    ring_extended: bool
    pinky_extended: bool
    extended_count: int


class HandDetector:
    """MediaPipe hand detection wrapper."""

    WRIST = 0
    THUMB_CMC = 1
    THUMB_MCP = 2
    THUMB_IP = 3
    THUMB_TIP = 4
    INDEX_MCP = 5
    INDEX_PIP = 6
    INDEX_DIP = 7
    INDEX_TIP = 8
    MIDDLE_MCP = 9
    MIDDLE_PIP = 10
    MIDDLE_DIP = 11
    MIDDLE_TIP = 12
    RING_MCP = 13
    RING_PIP = 14
    RING_DIP = 15
    RING_TIP = 16
    PINKY_MCP = 17
    PINKY_PIP = 18
    PINKY_DIP = 19
    PINKY_TIP = 20

    def __init__(self, config: dict | None = None):
        self.config = config or get_config()["hand_detector"]
        self.mp_hands = mp.solutions.hands
        self.hands = self.mp_hands.Hands(
            model_complexity=self.config["model_complexity"],
            max_num_hands=self.config["max_num_hands"],
            min_detection_confidence=self.config["min_detection_confidence"],
            min_tracking_confidence=self.config["min_tracking_confidence"],
        )
        self.mp_drawing = mp.solutions.drawing_utils

    def process(self, frame_bgr: np.ndarray) -> List[HandLandmarks]:
        frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        results = self.hands.process(frame_rgb)

        hands_data = []
        if results.multi_hand_landmarks:
            for hand_landmarks, handedness in zip(
                results.multi_hand_landmarks, results.multi_handedness
            ):
                landmarks = np.array(
                    [[lm.x, lm.y, lm.z] for lm in hand_landmarks.landmark],
                    dtype=np.float32,
                )

                hand_label = handedness.classification[0].label
                score = handedness.classification[0].score

                hands_data.append(
                    HandLandmarks(
                        landmarks=landmarks,
                        handedness=hand_label,
                        score=score,
                    )
                )

        return hands_data

    def get_finger_state(self, landmarks: np.ndarray) -> FingerState:
        index_ext = landmarks[self.INDEX_TIP, 1] < landmarks[self.INDEX_PIP, 1]
        middle_ext = landmarks[self.MIDDLE_TIP, 1] < landmarks[self.MIDDLE_PIP, 1]
        ring_ext = landmarks[self.RING_TIP, 1] < landmarks[self.RING_PIP, 1]
        pinky_ext = landmarks[self.PINKY_TIP, 1] < landmarks[self.PINKY_PIP, 1]

        thumb_tip = landmarks[self.THUMB_TIP]
        thumb_ip = landmarks[self.THUMB_IP]
        thumb_dist_tip = np.linalg.norm(thumb_tip[:2] - landmarks[self.WRIST][:2])
        thumb_dist_ip = np.linalg.norm(thumb_ip[:2] - landmarks[self.WRIST][:2])
        thumb_ext = thumb_dist_tip > thumb_dist_ip

        extended_count = sum([index_ext, middle_ext, ring_ext, pinky_ext])

        return FingerState(
            thumb_extended=bool(thumb_ext),
            index_extended=bool(index_ext),
            middle_extended=bool(middle_ext),
            ring_extended=bool(ring_ext),
            pinky_extended=bool(pinky_ext),
            extended_count=extended_count,
        )

    def get_hand_center(self, landmarks: np.ndarray) -> Tuple[float, float]:
        mcp_indices = [
            self.INDEX_MCP,
            self.MIDDLE_MCP,
            self.RING_MCP,
            self.PINKY_MCP,
        ]
        center = landmarks[mcp_indices].mean(axis=0)
        return float(center[0]), float(center[1])

    def get_hand_height(self, landmarks: np.ndarray) -> float:
        wrist = landmarks[self.WRIST]
        middle_tip = landmarks[self.MIDDLE_TIP]
        return float(np.linalg.norm(middle_tip[:2] - wrist[:2]))

    def get_thumb_position(self, landmarks: np.ndarray) -> Tuple[float, float]:
        tip = landmarks[self.THUMB_TIP]
        return float(tip[0]), float(tip[1])

    def draw_landmarks(
        self,
        frame: np.ndarray,
        landmarks: np.ndarray,
        connections: bool = True,
    ) -> np.ndarray:
        h, w = frame.shape[:2]
        points = landmarks[:, :2] * np.array([w, h])
        points = points.astype(int)

        if connections:
            for conn in self.mp_hands.HAND_CONNECTIONS:
                p1, p2 = points[conn[0]], points[conn[1]]
                cv2.line(frame, tuple(p1), tuple(p2), (0, 255, 0), 2)

        for pt in points:
            cv2.circle(frame, tuple(pt), 4, (255, 0, 0), -1)

        return frame

    def close(self) -> None:
        self.hands.close()