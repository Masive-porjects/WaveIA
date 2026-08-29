"""
Camera handler using OpenCV.
Captures frames from webcam with configured resolution/FPS.
"""
import cv2
import numpy as np
from typing import Optional, Tuple

from ..config.settings import get_config


class CameraHandler:
    """Manages webcam capture."""

    def __init__(self, config: dict | None = None):
        self.config = config or get_config()["camera"]
        self.cap: Optional[cv2.VideoCapture] = None
        self._frame: Optional[np.ndarray] = None

    def start(self) -> bool:
        """Initialize camera capture."""
        self.cap = cv2.VideoCapture(self.config["device_id"])
        if not self.cap.isOpened():
            return False

        # Set resolution and FPS
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.config["width"])
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.config["height"])
        self.cap.set(cv2.CAP_PROP_FPS, self.config["fps"])

        # Verify actual settings
        actual_width = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        actual_height = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        actual_fps = self.cap.get(cv2.CAP_PROP_FPS)

        print(f"Camera started: {actual_width}x{actual_height} @ {actual_fps:.1f}fps")
        return True

    def read_frame(self) -> Tuple[bool, Optional[np.ndarray]]:
        """Read next frame from camera."""
        if self.cap is None:
            return False, None

        ret, frame = self.cap.read()
        if ret:
            self._frame = frame
        return ret, frame

    def get_frame(self) -> Optional[np.ndarray]:
        """Get last captured frame."""
        return self._frame

    def stop(self) -> None:
        """Release camera resources."""
        if self.cap is not None:
            self.cap.release()
            self.cap = None

    def __enter__(self):
        self.start()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.stop()