"""
HumanMidiApp - Main application facade.
Orchestrates camera, hand detection, gestures, MIDI, and UI.
"""
import argparse
import sys
import time
import signal
from typing import Optional, List

import cv2

from .core.camera_handler import CameraHandler
from .core.hand_detector import HandDetector, HandLandmarks, FingerState
from .core.midi_sender import MidiSender
from .mappers.gesture_mapper import GestureMapper
from .ui.visualizer import Visualizer
from .ui.console import ConsoleUI
from .config.settings import get_config, load_config


class HumanMidiApp:
    """
    Main application class.

    Modes:
    - drums: 4-zone drum pads
    - piano: 5-finger piano
    - cc_controller: Legacy CC74/CC1/PitchBend
    - studio: LiveParams mapping (Bridge mode) - DEFAULT
    """

    def __init__(self, args: argparse.Namespace):
        self.args = args
        self.config = load_config()
        self.running = False

        # Override config with CLI args
        if args.mode:
            self.config.setdefault("gestures", {})["mode"] = args.mode
        if args.camera_id is not None:
            self.config["camera"]["device_id"] = args.camera_id
        if args.midi_port:
            self.config["midi"]["virtual_port_name"] = args.midi_port
        if args.no_camera:
            self.config["camera"]["enabled"] = False

        self.mode = self.config.get("gestures", {}).get("mode", "studio")

        # Components
        self.camera: Optional[CameraHandler] = None
        self.hand_detector: Optional[HandDetector] = None
        self.midi_sender: Optional[MidiSender] = None
        self.gesture_mapper: Optional[GestureMapper] = None
        self.visualizer: Optional[Visualizer] = None
        self.console_ui: Optional[ConsoleUI] = None

        # State
        self.active_ccs = {}

        # Signal handling
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)

    def _signal_handler(self, signum, frame):
        print("\nShutting down...")
        self.running = False

    def initialize(self) -> bool:
        """Initialize all components."""
        print(f"Initializing HumanMidi in '{self.mode}' mode...")

        # Camera
        if self.config["camera"].get("enabled", True):
            self.camera = CameraHandler(self.config["camera"])
            if not self.camera.start():
                print("ERROR: Failed to start camera")
                return False
        else:
            print("Camera disabled (--no-camera)")

        # Hand detector
        self.hand_detector = HandDetector(self.config["hand_detector"])

        # MIDI sender
        self.midi_sender = MidiSender(self.config["midi"])
        if not self.midi_sender.open_port():
            # Try virtual port
            if not self.midi_sender.open_virtual_port():
                print("WARNING: No MIDI port opened. MIDI output disabled.")

        # Gesture mapper
        self.gesture_mapper = GestureMapper(self.midi_sender, self.config)

        # UI
        if not self.args.no_ui:
            self.visualizer = Visualizer(self.config["ui"])
        self.console_ui = ConsoleUI(self.config)

        print(f"HumanMidi ready. Mode: {self.mode}")
        print("Press 'q' in video window or Ctrl+C to quit.")
        return True

    def run(self) -> int:
        """Main loop."""
        if not self.initialize():
            return 1

        self.running = True
        frame_count = 0

        try:
            while self.running:
                frame_start = time.time()

                # Read frame
                frame = None
                if self.camera:
                    ret, frame = self.camera.read_frame()
                    if not ret or frame is None:
                        continue
                else:
                    # No camera: create blank frame for UI
                    frame = cv2.cvtColor(
                        cv2.imread("blank.png") if False else None,
                        cv2.COLOR_BGR2RGB,
                    )
                    if frame is None:
                        frame = cv2.cvtColor(
                            cv2.imread("blank.png") if False else None,
                            cv2.COLOR_BGR2RGB,
                        )
                    if frame is None:
                        frame = cv2.imread("blank.png") if False else None
                    if frame is None:
                        import numpy as np
                        frame = np.zeros((480, 640, 3), dtype=np.uint8)

                # Detect hands
                hands: List[HandLandmarks] = []
                finger_states: List[FingerState] = []
                if self.hand_detector:
                    hands = self.hand_detector.process(frame)
                    if hands:
                        finger_states = [
                            self.hand_detector.get_finger_state(h.landmarks)
                            for h in hands
                        ]

                # Process gestures
                events = []
                if self.gesture_mapper:
                    events = self.gesture_mapper.process_hands(hands)

                # Send MIDI
                if self.gesture_mapper and events:
                    self.gesture_mapper.send_events(events)

                # Collect active CCs for display
                self.active_ccs = {}
                for event in events:
                    if event.gesture_type in ("cc_change", "studio_param"):
                        self.active_ccs[event.data["cc"]] = event.data["value"]

                # Update UI
                if self.visualizer and frame is not None:
                    frame = self.visualizer.draw(
                        frame,
                        hands,
                        finger_states,
                        self.midi_sender,
                        self.mode,
                        self.active_ccs,
                    )
                    cv2.imshow(self.config["ui"]["window_name"], frame)
                    key = cv2.waitKey(1) & 0xFF
                    if key == ord('q'):
                        break

                if self.console_ui:
                    midi_status = "CONNECTED" if (self.midi_sender and self.midi_sender._is_open) else "DISCONNECTED"
                    self.console_ui.update(
                        hands,
                        finger_states,
                        self.mode,
                        midi_status,
                        self.active_ccs,
                    )

                frame_count += 1

        except KeyboardInterrupt:
            pass
        finally:
            self.cleanup()

        return 0

    def cleanup(self) -> None:
        """Clean up resources."""
        print("\nCleaning up...")
        if self.camera:
            self.camera.stop()
        if self.hand_detector:
            self.hand_detector.close()
        if self.midi_sender:
            self.midi_sender.close()
        cv2.destroyAllWindows()
        if self.console_ui:
            self.console_ui.clear()
        print("Done.")


def main() -> int:
    """Entry point called by run.py."""
    parser = argparse.ArgumentParser(
        description="HumanMidi - Hand gestures to MIDI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Modes:
  drums          4-zone drum pads (kick, snare, closed HH, open HH)
  piano          5-finger piano (C major, octave by hand height)
  cc_controller  Legacy CC74 (filter), CC1 (mod), Pitch Bend
  studio         LiveParams mapping for Bridge (DEFAULT)

Examples:
  python run.py --mode studio
  python run.py --mode drums --camera-id 1
  python run.py --list-midi
        """
    )
    parser.add_argument(
        "--mode",
        choices=["drums", "piano", "cc_controller", "studio", "cc-thumbs"],
        default="studio",
        help="Gesture mode (default: studio)",
    )
    parser.add_argument(
        "--camera-id", type=int, default=None,
        help="Camera device ID (default: from config)"
    )
    parser.add_argument(
        "--midi-port", type=str, default=None,
        help="MIDI virtual port name (default: from config)"
    )
    parser.add_argument(
        "--no-camera", action="store_true",
        help="Disable camera (for testing)"
    )
    parser.add_argument(
        "--no-ui", action="store_true",
        help="Disable video window (console only)"
    )
    parser.add_argument(
        "--list-midi", action="store_true",
        help="List available MIDI ports and exit"
    )
    parser.add_argument(
        "--config", type=str, default=None,
        help="Path to config.yaml"
    )

    args = parser.parse_args()

    # Handle --list-midi
    if args.list_midi:
        midi = MidiSender()
        ports = midi.list_ports()
        print("Available MIDI output ports:")
        for i, port in enumerate(ports):
            print(f"  [{i}] {port}")
        return 0

    # Normalize mode alias
    if args.mode == "cc-thumbs":
        args.mode = "cc_controller"

    app = HumanMidiApp(args)
    return app.run()


if __name__ == "__main__":
    sys.exit(main())