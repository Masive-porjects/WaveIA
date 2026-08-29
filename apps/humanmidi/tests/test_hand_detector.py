"""
Tests for HandDetector.
"""
import pytest
import numpy as np
from unittest.mock import Mock, patch, MagicMock

from src.core.hand_detector import HandDetector, HandLandmarks, FingerState


class TestHandDetector:
    @pytest.fixture
    def detector(self):
        with patch('mediapipe.solutions.hands.Hands') as mock_hands_class:
            mock_hands = Mock()
            mock_hands_class.return_value = mock_hands
            mock_hands_class.HAND_CONNECTIONS = [
                (0, 1), (1, 2), (2, 3), (3, 4),  # thumb
                (0, 5), (5, 6), (6, 7), (7, 8),  # index
                (0, 9), (9, 10), (10, 11), (11, 12),  # middle
                (0, 13), (13, 14), (14, 15), (15, 16),  # ring
                (0, 17), (17, 18), (18, 19), (19, 20),  # pinky
                (5, 9), (9, 13), (13, 17), (0, 17),  # palm
            ]
            detector = HandDetector()
            detector.hands = mock_hands
            yield detector

    def test_init(self):
        with patch('mediapipe.solutions.hands.Hands'):
            detector = HandDetector()
            assert detector is not None

    def test_process_no_hands(self, detector):
        mock_results = Mock()
        mock_results.multi_hand_landmarks = None
        mock_results.multi_handedness = None
        detector.hands.process.return_value = mock_results

        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        hands = detector.process(frame)
        assert hands == []

    def test_process_with_hands(self, detector):
        mock_landmark = Mock()
        mock_landmark.x = 0.5
        mock_landmark.y = 0.5
        mock_landmark.z = 0.0

        mock_hand_landmarks = Mock()
        mock_hand_landmarks.landmark = [mock_landmark] * 21

        mock_classification = Mock()
        mock_classification.label = "Right"
        mock_classification.score = 0.9

        mock_handedness = Mock()
        mock_handedness.classification = [mock_classification]

        mock_results = Mock()
        mock_results.multi_hand_landmarks = [mock_hand_landmarks]
        mock_results.multi_handedness = [mock_handedness]
        detector.hands.process.return_value = mock_results

        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        hands = detector.process(frame)

        assert len(hands) == 1
        assert hands[0].handedness == "Right"
        assert hands[0].score == 0.9
        assert hands[0].landmarks.shape == (21, 3)

    def test_get_finger_state_all_extended(self, detector):
        landmarks = np.zeros((21, 3), dtype=np.float32)
        landmarks[0] = [0.5, 0.8, 0.0]
        landmarks[1:5] = [[0.4, 0.7, 0.0], [0.35, 0.6, 0.0], [0.3, 0.5, 0.0], [0.25, 0.4, 0.0]]
        landmarks[5:9] = [[0.5, 0.7, 0.0], [0.5, 0.5, 0.0], [0.5, 0.4, 0.0], [0.5, 0.3, 0.0]]
        landmarks[9:13] = [[0.55, 0.7, 0.0], [0.55, 0.5, 0.0], [0.55, 0.4, 0.0], [0.55, 0.3, 0.0]]
        landmarks[13:17] = [[0.6, 0.7, 0.0], [0.6, 0.5, 0.0], [0.6, 0.4, 0.0], [0.6, 0.3, 0.0]]
        landmarks[17:21] = [[0.65, 0.7, 0.0], [0.65, 0.5, 0.0], [0.65, 0.4, 0.0], [0.65, 0.3, 0.0]]

        state = detector.get_finger_state(landmarks)
        assert state.index_extended is True
        assert state.middle_extended is True
        assert state.ring_extended is True
        assert state.pinky_extended is True
        assert state.extended_count == 4

    def test_get_finger_state_fist(self, detector):
        landmarks = np.zeros((21, 3), dtype=np.float32)
        landmarks[0] = [0.5, 0.8, 0.0]
        landmarks[4] = [0.3, 0.9, 0.0]
        landmarks[8] = [0.5, 0.9, 0.0]
        landmarks[12] = [0.55, 0.9, 0.0]
        landmarks[16] = [0.6, 0.9, 0.0]
        landmarks[20] = [0.65, 0.9, 0.0]
        landmarks[3] = [0.35, 0.6, 0.0]
        landmarks[6] = [0.5, 0.5, 0.0]
        landmarks[10] = [0.55, 0.5, 0.0]
        landmarks[14] = [0.6, 0.5, 0.0]
        landmarks[18] = [0.65, 0.5, 0.0]

        state = detector.get_finger_state(landmarks)
        assert state.index_extended is False
        assert state.middle_extended is False
        assert state.ring_extended is False
        assert state.pinky_extended is False
        assert state.extended_count == 0

    def test_get_hand_center(self, detector):
        landmarks = np.zeros((21, 3), dtype=np.float32)
        landmarks[5] = [0.4, 0.5, 0.0]
        landmarks[9] = [0.5, 0.5, 0.0]
        landmarks[13] = [0.6, 0.5, 0.0]
        landmarks[17] = [0.7, 0.5, 0.0]

        cx, cy = detector.get_hand_center(landmarks)
        assert abs(cx - 0.55) < 0.01
        assert abs(cy - 0.5) < 0.01

    def test_get_hand_height(self, detector):
        landmarks = np.zeros((21, 3), dtype=np.float32)
        landmarks[0] = [0.5, 0.8, 0.0]
        landmarks[12] = [0.5, 0.3, 0.0]

        height = detector.get_hand_height(landmarks)
        assert abs(height - 0.5) < 0.01

    def test_get_thumb_position(self, detector):
        landmarks = np.zeros((21, 3), dtype=np.float32)
        landmarks[4] = [0.3, 0.5, 0.0]

        tx, ty = detector.get_thumb_position(landmarks)
        assert abs(tx - 0.3) < 0.01
        assert abs(ty - 0.5) < 0.01

    def test_close(self, detector):
        detector.close()
        detector.hands.close.assert_called_once()