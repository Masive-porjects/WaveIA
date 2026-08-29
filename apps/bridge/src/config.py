"""
Bridge configuration.
Centralized settings for MIDI listener, WebSocket server, and processing.
"""
from dataclasses import dataclass, field
from typing import Optional
import os


@dataclass
class BridgeConfig:
    # WebSocket server
    ws_host: str = "localhost"
    ws_port: int = 8765

    # MIDI input
    midi_port_name: str = "midiMastering Virtual Port"
    midi_virtual: bool = True  # Create virtual port if not found

    # Processing
    max_msg_rate_hz: int = 60  # Max broadcast rate
    ema_alpha: float = 0.3     # EMA smoothing factor
    dead_zone: int = 2         # CC dead zone (±)
    heartbeat_interval_s: float = 5.0

    # Logging
    verbose: bool = False

    @classmethod
    def from_env(cls) -> "BridgeConfig":
        """Load config from environment variables."""
        return cls(
            ws_host=os.getenv("BRIDGE_WS_HOST", "localhost"),
            ws_port=int(os.getenv("BRIDGE_WS_PORT", "8765")),
            midi_port_name=os.getenv("BRIDGE_MIDI_PORT", "midiMastering Virtual Port"),
            midi_virtual=os.getenv("BRIDGE_MIDI_VIRTUAL", "true").lower() == "true",
            max_msg_rate_hz=int(os.getenv("BRIDGE_MAX_RATE", "60")),
            ema_alpha=float(os.getenv("BRIDGE_EMA_ALPHA", "0.3")),
            dead_zone=int(os.getenv("BRIDGE_DEAD_ZONE", "2")),
            heartbeat_interval_s=float(os.getenv("BRIDGE_HEARTBEAT", "5.0")),
            verbose=os.getenv("BRIDGE_VERBOSE", "false").lower() == "true",
        )


# Default instance
DEFAULT_CONFIG = BridgeConfig()