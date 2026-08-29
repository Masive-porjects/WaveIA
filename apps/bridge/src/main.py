"""
Bridge Main - MIDI to LiveParams WebSocket Bridge.

Usage:
    python -m src.main [--port 8765] [--midi-port "HumanMidi"] [--verbose]

Pipeline:
    MIDI Input (rtmidi) -> CC/Note Parser -> LiveParams Mapper -> Smoother -> WebSocket Broadcast
"""
import argparse
import asyncio
import signal
import sys
import time
from typing import Optional

from .config import BridgeConfig, DEFAULT_CONFIG
from .midi_listener import MidiListener, MidiMessage
from .gesture_to_params import GestureToParams
from .smoother import LiveParamsSmoother
from .ws_server import WSServer
from .latency import LatencyTracker
from .live_params import LiveParams


class BridgeApp:
    """Main bridge application."""

    def __init__(self, config: BridgeConfig):
        self.config = config
        self.running = False

        # Components
        self.midi_listener: Optional[MidiListener] = None
        self.mapper = GestureToParams()
        self.smoother = LiveParamsSmoother(
            ema_alpha=config.ema_alpha,
            dead_zone=config.dead_zone,
            max_rate_hz=config.max_msg_rate_hz,
        )
        self.ws_server: Optional[WSServer] = None
        self.latency = LatencyTracker()

        # Stats
        self.stats = {
            "midi_messages": 0,
            "params_updates": 0,
            "ws_broadcasts": 0,
            "start_time": time.time(),
        }

    async def initialize(self) -> bool:
        """Initialize all components."""
        print(f"[Bridge] Starting on ws://{self.config.ws_host}:{self.config.ws_port}")
        print(f"[Bridge] MIDI port: {self.config.midi_port_name}")
        print(f"[Bridge] Smoothing: EMA alpha={self.config.ema_alpha}, dead_zone=+/-{self.config.dead_zone}, max_rate={self.config.max_msg_rate_hz}Hz")

        # WebSocket server
        self.ws_server = WSServer(
            host=self.config.ws_host,
            port=self.config.ws_port,
            heartbeat_interval=self.config.heartbeat_interval_s,
        )
        await self.ws_server.start()

        # MIDI listener
        self.midi_listener = MidiListener(
            port_name=self.config.midi_port_name,
            virtual=self.config.midi_virtual,
        )
        if not self.midi_listener.open():
            print("[Bridge] Failed to open MIDI port")
            return False

        print("[Bridge] Ready")
        return True

    async def run(self) -> int:
        """Main event loop."""
        if not await self.initialize():
            return 1

        self.running = True

        # Setup signal handlers
        loop = asyncio.get_running_loop()
        for sig in (signal.SIGINT, signal.SIGTERM):
            loop.add_signal_handler(sig, lambda: self._shutdown())

        try:
            # Run MIDI processing and periodic stats
            await asyncio.gather(
                self._midi_loop(),
                self._stats_loop(),
            )
        except asyncio.CancelledError:
            pass
        finally:
            await self._cleanup()

        return 0

    def _shutdown(self) -> None:
        """Signal shutdown."""
        print("\n[Bridge] Shutdown requested...")
        self.running = False

    async def _midi_loop(self) -> None:
        """Process MIDI messages and broadcast params."""
        while self.running:
            try:
                # Get MIDI message with timeout
                msg = await asyncio.wait_for(
                    self.midi_listener.get_message(),
                    timeout=0.1
                )
            except asyncio.TimeoutError:
                continue
            except Exception as e:
                if self.running:
                    print(f"[Bridge] MIDI error: {e}")
                continue

            self.stats["midi_messages"] += 1

            # Map MIDI to LiveParams
            params = self.mapper.process_midi(msg)
            if params is None:
                continue

            self.stats["params_updates"] += 1

            # Apply smoothing
            smoothed = self.smoother.smooth(params)

            # Broadcast to WebSocket clients
            sent = await self.ws_server.broadcast(smoothed)
            if sent > 0:
                self.stats["ws_broadcasts"] += sent

                # Track latency (MIDI timestamp to now)
                self.latency.record_midi_to_ws(msg.timestamp, time.time())

            # Verbose logging
            if self.config.verbose and self.stats["params_updates"] % 50 == 0:
                self._log_params(smoothed)

    async def _stats_loop(self) -> None:
        """Periodic stats logging."""
        while self.running:
            await asyncio.sleep(10.0)
            self._log_stats()

    def _log_params(self, params: LiveParams) -> None:
        """Log current parameter values."""
        print(
            f"[Bridge] Params: "
            f"cutoff={params.filter_cutoff:.0f}Hz "
            f"reverb={params.reverb_mix:.2f} "
            f"delay={params.delay_time:.0f}ms "
            f"echo_fb={params.echo_feedback:.2f} "
            f"drive={params.drive:.2f} "
            f"preset={params.fx_preset or 'none'}"
        )

    def _log_stats(self) -> None:
        """Log runtime statistics."""
        uptime = time.time() - self.stats["start_time"]
        rate = self.stats["midi_messages"] / uptime if uptime > 0 else 0

        print(
            f"[Bridge] Stats: "
            f"uptime={uptime:.0f}s "
            f"midi={self.stats['midi_messages']} ({rate:.1f}/s) "
            f"updates={self.stats['params_updates']} "
            f"broadcasts={self.stats['ws_broadcasts']} "
            f"clients={self.ws_server.client_count if self.ws_server else 0}"
        )

        # Latency stats
        lat_stats = self.latency.get_stats()
        if lat_stats.get("ws_ping"):
            ws = lat_stats["ws_ping"]
            print(f"[Bridge] Latency WS: mean={ws.get('mean_ms', 0):.1f}ms p95={ws.get('p95_ms', 0):.1f}ms")
        if lat_stats.get("midi_to_ws"):
            midi = lat_stats["midi_to_ws"]
            print(f"[Bridge] Latency MIDI->WS: mean={midi.get('mean_ms', 0):.1f}ms p95={midi.get('p95_ms', 0):.1f}ms")

    async def _cleanup(self) -> None:
        """Cleanup resources."""
        print("[Bridge] Cleaning up...")
        if self.midi_listener:
            self.midi_listener.close()
        if self.ws_server:
            await self.ws_server.stop()
        print("[Bridge] Done")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="MIDI to LiveParams WebSocket Bridge",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python -m src.main                          # Default: ws://localhost:8765, virtual MIDI port
  python -m src.main --port 9000              # Custom WS port
  python -m src.main --midi-port "IAC Driver" # Custom MIDI port
  python -m src.main --verbose                # Verbose parameter logging
        """
    )
    parser.add_argument(
        "--host", default=DEFAULT_CONFIG.ws_host,
        help=f"WebSocket host (default: {DEFAULT_CONFIG.ws_host})"
    )
    parser.add_argument(
        "--port", type=int, default=DEFAULT_CONFIG.ws_port,
        help=f"WebSocket port (default: {DEFAULT_CONFIG.ws_port})"
    )
    parser.add_argument(
        "--midi-port", default=DEFAULT_CONFIG.midi_port_name,
        help=f"MIDI input port name (default: {DEFAULT_CONFIG.midi_port_name})"
    )
    parser.add_argument(
        "--no-virtual", action="store_true",
        help="Don't create virtual MIDI port"
    )
    parser.add_argument(
        "--max-rate", type=int, default=DEFAULT_CONFIG.max_msg_rate_hz,
        help=f"Max broadcast rate Hz (default: {DEFAULT_CONFIG.max_msg_rate_hz})"
    )
    parser.add_argument(
        "--ema-alpha", type=float, default=DEFAULT_CONFIG.ema_alpha,
        help=f"EMA smoothing alpha (default: {DEFAULT_CONFIG.ema_alpha})"
    )
    parser.add_argument(
        "--dead-zone", type=int, default=DEFAULT_CONFIG.dead_zone,
        help=f"CC dead zone (default: {DEFAULT_CONFIG.dead_zone})"
    )
    parser.add_argument(
        "--heartbeat", type=float, default=DEFAULT_CONFIG.heartbeat_interval_s,
        help=f"Heartbeat interval seconds (default: {DEFAULT_CONFIG.heartbeat_interval_s})"
    )
    parser.add_argument(
        "--verbose", "-v", action="store_true",
        help="Verbose parameter logging"
    )
    return parser.parse_args()


async def async_main() -> int:
    args = parse_args()

    config = BridgeConfig(
        ws_host=args.host,
        ws_port=args.port,
        midi_port_name=args.midi_port,
        midi_virtual=not args.no_virtual,
        max_msg_rate_hz=args.max_rate,
        ema_alpha=args.ema_alpha,
        dead_zone=args.dead_zone,
        heartbeat_interval_s=args.heartbeat,
        verbose=args.verbose,
    )

    app = BridgeApp(config)
    return await app.run()


def main() -> int:
    """Entry point."""
    try:
        return asyncio.run(async_main())
    except KeyboardInterrupt:
        return 0


if __name__ == "__main__":
    sys.exit(main())