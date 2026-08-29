"""
Base gesture class and event definitions.
All gesture detectors inherit from BaseGesture.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional
import numpy as np


@dataclass
class GestureEvent:
    """Event emitted when a gesture is detected."""
    gesture_type: str
    hand: str
    data: dict
    timestamp: float


class BaseGesture(ABC):
    """Abstract base class for all gesture detectors."""

    def __init__(self, config: dict | None = None):
        self.config = config or {}
        self.enabled = self.config.get("enabled", True)

    @abstractmethod
    def detect(self, landmarks: np.ndarray, finger_state, hand_label: str) -> Optional[GestureEvent]:
        pass

    def is_enabled(self) -> bool:
        return self.enabled