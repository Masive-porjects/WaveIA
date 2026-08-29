#!/usr/bin/env python3
"""
Simulador MIDI → LiveParams → WebSocket

Modos:
  --mode server  : Levanta WS server mock (puerto 8765) - DEFAULT
  --mode midi    : Inyector MIDI hacia puerto virtual

Escenarios:
  --scenario sweep          : Barrido determinista de params
  --scenario presets        : Cambia presets por notas MIDI
  --scenario random_walk    : Caminata aleatoria acotada (seed fijo)
  --scenario idle           : Solo HELLO + PING/PONG
  --scenario chaos          : Payloads inválidos intencionales

Ejemplos:
  python -m simulator.main --mode server --scenario sweep --port 8765 --rate 60 --duration 10 --loop
  python -m simulator.main --mode server --scenario presets --preset-interval 2.0
  python -m simulator.main --mode midi --scenario random_walk --midi-port "midiMastering Virtual Port"
"""

import argparse
import asyncio
import sys
from typing import Optional

from simulator.scenarios import SweepScenario, PresetsScenario, RandomWalkScenario, IdleScenario, ChaosScenario
from simulator.mock_bridge import MockBridge


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Simulador MIDI → LiveParams → WebSocket",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--mode",
        choices=["server", "midi"],
        default="server",
        help="Modo de operación: server (WS mock bridge) o midi (inyector MIDI)",
    )
    parser.add_argument(
        "--scenario",
        choices=["sweep", "presets", "random_walk", "idle", "chaos"],
        default="sweep",
        help="Escenario a ejecutar",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8765,
        help="Puerto WS server (modo server)",
    )
    parser.add_argument(
        "--rate",
        type=int,
        default=60,
        help="Frecuencia de updates (Hz)",
    )
    parser.add_argument(
        "--duration",
        type=float,
        default=10.0,
        help="Duración del escenario en segundos",
    )
    parser.add_argument(
        "--loop",
        action="store_true",
        help="Repetir escenario indefinidamente",
    )
    parser.add_argument(
        "--step-mode",
        action="store_true",
        help="sweep: avanza por pasos discretos con valores exactos",
    )
    parser.add_argument(
        "--preset-interval",
        type=float,
        default=2.0,
        help="Segundos entre cambios de preset (scenario presets)",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Seed para random_walk (reproducible)",
    )
    parser.add_argument(
        "--midi-port",
        type=str,
        default="midiMastering Virtual Port",
        help="Nombre del puerto MIDI virtual (modo midi)",
    )
    parser.add_argument(
        "--host",
        type=str,
        default="localhost",
        help="Host WS server",
    )
    return parser.parse_args()


async def run_server_mode(args: argparse.Namespace) -> None:
    """Ejecuta el mock bridge WS server."""
    # Seleccionar escenario
    scenario_map = {
        "sweep": SweepScenario(step_mode=args.step_mode),
        "presets": PresetsScenario(interval=args.preset_interval),
        "random_walk": RandomWalkScenario(seed=args.seed),
        "idle": IdleScenario(),
        "chaos": ChaosScenario(),
    }
    scenario = scenario_map[args.scenario]

    bridge = MockBridge(
        host=args.host,
        port=args.port,
        scenario=scenario,
        rate=args.rate,
        duration=args.duration,
        loop=args.loop,
    )

    print(f"[Simulator] Iniciando mock bridge WS en {args.host}:{args.port}")
    print(f"[Simulator] Escenario: {args.scenario} (rate={args.rate}Hz, duration={args.duration}s, loop={args.loop})")
    
    try:
        await bridge.run()
    except KeyboardInterrupt:
        print("\n[Simulator] Detenido por usuario")
    except Exception as e:
        print(f"[Simulator] Error: {e}", file=sys.stderr)
        sys.exit(1)


async def run_midi_mode(args: argparse.Namespace) -> None:
    """Inyector MIDI hacia puerto virtual."""
    try:
        from midi_injector import MidiInjector
    except ImportError:
        print("[Simulator] Modo midi requiere python-rtmidi", file=sys.stderr)
        sys.exit(1)

    injector = MidiInjector(
        virtual_port_name=args.midi_port,
        scenario=args.scenario,
        rate=args.rate,
        seed=getattr(args, "seed", 42),
    )

    print(f"[Simulator] Iniciando inyector MIDI en puerto '{args.midi_port}'")
    print(f"[Simulator] Escenario: {args.scenario} (rate={args.rate}Hz)")

    try:
        await injector.run()
    except KeyboardInterrupt:
        print("\n[Simulator] Detenido por usuario")
    except Exception as e:
        print(f"[Simulator] Error: {e}", file=sys.stderr)
        sys.exit(1)


def main() -> int:
    args = parse_args()

    if args.mode == "server":
        asyncio.run(run_server_mode(args))
    else:
        asyncio.run(run_midi_mode(args))

    return 0


if __name__ == "__main__":
    sys.exit(main())