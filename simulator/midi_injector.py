"""
MIDI Injector — Inyecta eventos MIDI en un puerto virtual.

Modo alternativo para validar la cadena completa:
HumanMidi → Puerto MIDI Virtual → Bridge Real → WS → Studio

Requiere: python-rtmidi, puerto virtual (loopMIDI Windows / IAC macOS)
"""

import asyncio
import time
import sys
from typing import Optional
from pathlib import Path

# Agregar scenarios al path
sys.path.insert(0, str(Path(__file__).parent))
from scenarios import Scenario, SweepScenario, PresetsScenario, RandomWalkScenario, IdleScenario, ChaosScenario


class MidiInjector:
    """
    Inyector MIDI hacia puerto virtual.

    Convierte LiveParams del escenario a eventos MIDI CC/Note
    y los envía al puerto virtual especificado.
    """

    # Mapeo CC → Parámetro (match Bridge/HumanMidi)
    CC_MAP = {
        "filter_cutoff": 74,      # Pulgar derecho → filter_cutoff (log)
        "reverb_mix": 92,         # Pulgar izquierdo → reverb_mix
        "delay_time": 71,         # Altura mano → delay_time
        "echo_feedback": 73,      # Apertura mano → echo_feedback
        "drive": 16,              # Posición X → drive
    }

    # Notas para presets
    PRESET_NOTES = {
        "clean": 36,      # Kick
        "dub": 38,        # Snare
        "big_room": 42,   # Closed HH
        "radio": 49,      # Open HH
    }

    def __init__(
        self,
        virtual_port_name: str = "midiMastering Virtual Port",
        scenario: str = "sweep",
        rate: int = 60,
        seed: int = 42,
    ):
        self.virtual_port_name = virtual_port_name
        self.scenario_name = scenario
        self.rate = rate
        self.interval = 1.0 / rate
        self.seed = seed

        self.scenario = self._create_scenario(scenario, seed=seed)
        self.midi_out = None
        self.port_index = None
        self.running = False
        self.start_time = 0.0
        self.scenario_elapsed = 0.0

    def _create_scenario(self, name: str, seed: int) -> object:
        """Factory de escenarios."""
        scenarios = {
            "sweep": lambda: SweepScenario(step_mode=False),
            "presets": lambda: PresetsScenario(interval=2.0),
            "random_walk": lambda: RandomWalkScenario(seed=seed),
            "idle": lambda: IdleScenario(),
            "chaos": lambda: ChaosScenario(seed=seed),
        }
        if name not in scenarios:
            raise ValueError(f"Escenario desconocido: {name}")
        return scenarios[name]()

    def _list_ports(self) -> list:
        """Lista puertos MIDI disponibles."""
        import rtmidi
        midi_out = rtmidi.MidiOut()
        return midi_out.get_ports()

    def open_port(self) -> bool:
        """Abre el puerto MIDI virtual."""
        import rtmidi
        self.midi_out = rtmidi.MidiOut()
        ports = self.midi_out.get_ports()

        # Buscar puerto por nombre (case-insensitive)
        target = self.virtual_port_name.lower()
        for i, port in enumerate(ports):
            if target in port.lower():
                self.midi_out.open_port(i)
                self.port_index = i
                print(f"[MidiInjector] Puerto abierto: {ports[i]} (index {i})")
                return True

        # Si no existe, crear puerto virtual
        try:
            self.midi_out.open_virtual_port(self.virtual_port_name)
            print(f"[MidiInjector] Puerto virtual creado: {self.virtual_port_name}")
            return True
        except Exception as e:
            print(f"[MidiInjector] No se pudo abrir/crear puerto: {e}")
            print(f"[MidiInjector] Puertos disponibles:")
            for p in ports:
                print(f"  - {p}")
            return False

    def _live_params_to_midi(self, params: dict) -> list:
        """Convierte LiveParams a lista de eventos MIDI (cc, note)."""
        events = []
        now = time.time()

        # CCs continuos
        for param, cc in self.CC_MAP.items():
            if param in params:
                value = params[param]
                if param == "filter_cutoff":
                    # Log scale: 200-12000 Hz → CC 0-127
                    cc_value = int(round(127 * (math.log(value / 200) / math.log(12000 / 200))))
                else:
                    # Lineal 0-1 → 0-127
                    cc_value = int(round(value * 127))
                cc_value = max(0, min(127, cc_value))
                events.append(("cc", cc, cc_value, now))

        # Presets via NoteOn
        if "fx_preset" in params and params["fx_preset"]:
            preset = params["fx_preset"]
            if preset in self.PRESET_NOTES:
                note = self.PRESET_NOTES[preset]
                events.append(("note_on", note, 100, now))

        return events

    def _send_midi(self, events: list) -> None:
        """Envía eventos MIDI al puerto."""
        if not self.midi_out:
            return

        for event in events:
            if event[0] == "cc":
                _, cc, value, _ = event
                # CC: status 0xB0 | channel 0, cc, value
                self.midi_out.send_message([0xB0, cc, value])
            elif event[0] == "note_on":
                _, note, velocity, _ = event
                # Note On: status 0x90 | channel 0, note, velocity
                self.midi_out.send_message([0x90, note, velocity])
                # Programar Note Off a los 50ms
                # (en producción real se usaría un timer, aquí simplificado)

    async def run(self) -> None:
        """Ejecuta el inyector MIDI."""
        if not self.open_port():
            raise RuntimeError("No se pudo abrir puerto MIDI")

        self.running = True
        self.start_time = time.time()

        print(f"[MidiInjector] Inyectando MIDI a {self.rate}Hz...")
        print("[MidiInjector] Ctrl+C para detener")

        try:
            while self.running:
                loop_start = time.time()
                self.scenario_elapsed = time.time() - self.start_time

                # Generar params del escenario
                params = self.scenario.generate_params(self.scenario_elapsed)
                if params:
                    events = self._live_params_to_midi(params)
                    self._send_midi(events)

                # Control de tasa
                elapsed = time.time() - loop_start
                sleep_time = max(0, self.interval - elapsed)
                await asyncio.sleep(sleep_time)

        except KeyboardInterrupt:
            print("\n[MidiInjector] Detenido por usuario")
        finally:
            self.cleanup()

    def cleanup(self) -> None:
        """Limpia recursos."""
        self.running = False
        if self.midi_out:
            self.midi_out.close_port()
            self.midi_out = None


async def main():
    """Entry point para testing standalone."""
    import argparse

    parser = argparse.ArgumentParser(description="MIDI Injector")
    parser.add_argument("--scenario", choices=["sweep", "presets", "random_walk", "idle", "chaos"], default="sweep")
    parser.add_argument("--rate", type=int, default=60)
    parser.add_argument("--midi-port", default="midiMastering Virtual Port")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    injector = MidiInjector(
        virtual_port_name=args.midi_port,
        scenario=args.scenario,
        rate=args.rate,
        seed=args.seed,
    )
    await injector.run()


if __name__ == "__main__":
    asyncio.run(main())