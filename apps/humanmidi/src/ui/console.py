"""
Console UI - Text-based status display for terminal mode.
"""
import sys
import time
from typing import List, Optional

from ..core.hand_detector import HandLandmarks, FingerState
from ..config.settings import get_config


class ConsoleUI:
    """Text-based UI for terminal output."""

    def __init__(self, config: dict | None = None):
        self.config = config or get_config()
        self.last_update = 0
        self.update_interval = 0.1  # 10 Hz max

    def update(
        self,
        hands: List[HandLandmarks],
        finger_states: List[FingerState] | None = None,
        mode: str = "studio",
        midi_status: str = "DISCONNECTED",
        active_ccs: dict | None = None,
    ) -> None:
        """Update console display (throttled)."""
        now = time.time()
        if now - self.last_update < self.update_interval:
            return
        self.last_update = now

        # Clear line and print status
        sys.stdout.write("\r\033[K")  # Clear line

        # Hands status
        hand_strs = []
        for hand in hands:
            hand_strs.append(f"{hand.handedness}:{hand.score:.2f}")
        hands_str = " | ".join(hand_strs) if hand_strs else "No hands"

        # Mode and MIDI
        status = f"[{mode.upper()}] MIDI: {midi_status} | Hands: {hands_str}"

        # Active CCs
        if active_ccs:
            cc_str = " ".join(f"CC{cc}={val}" for cc, val in sorted(active_ccs.items()))
            status += f" | {cc_str}"

        sys.stdout.write(status)
        sys.stdout.flush()

    def clear(self) -> None:
        """Clear console line."""
        sys.stdout.write("\r\033[K")
        sys.stdout.flush()

    def print(self, msg: str) -> None:
        """Print message on new line."""
        self.clear()
        print(msg)