"""
Default configuration values for HumanMidi.
Used as base for deep-merge with config/config.yaml
"""
from typing import Any

DEFAULTS: dict[str, Any] = {
    "midi": {
        "virtual_port_name": "HumanMidi",
    },
    "camera": {
        "device_id": 0,
        "width": 640,
        "height": 480,
        "fps": 30,
    },
    "hand_detector": {
        "model_complexity": 1,
        "max_num_hands": 2,
        "min_detection_confidence": 0.7,
        "min_tracking_confidence": 0.5,
    },
    "gestures": {
        "drums": {
            "enabled": True,
            "zones": 4,
            "notes": [36, 38, 42, 49],
            "cooldown_frames": 10,
            "velocity_scale": 1.0,
        },
        "piano": {
            "enabled": True,
            "finger_offsets": [0, 2, 4, 5, 7],
            "octave_range": [2, 6],
            "anti_stuck_notes": True,
        },
        "cc_controller": {
            "enabled": True,
            "cc_left_thumb": 74,
            "cc_right_thumb": 92,
            "smoothing_alpha": 0.3,
            "dead_zone": 2,
        },
        "studio": {
            "enabled": True,
            "smoothing_alpha": 0.3,
            "dead_zone": 2,
        },
    },
    "ui": {
        "show_landmarks": True,
        "show_bbox": True,
        "show_zones": True,
        "show_fps": True,
        "show_cc_panels": True,
        "window_name": "HumanMidi",
    },
}