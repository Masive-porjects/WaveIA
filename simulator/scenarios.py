"""
Escenarios del simulador.

Cada escenario implementa generate_params(t) -> LiveParams | None
y opcionalmente get_next_step() para step-mode.
"""

import sys
import math
import random
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional, List, Iterator
from pathlib import Path

# Importar LiveParams desde el contrato compartido
# sys.path.insert(0, str(Path(__file__).parent.parent / "packages" / "contracts" / "scripts"))
# Usar tipo dinámico para evitar problemas de importación en desarrollo
LiveParams = dict  # type: ignore


class Scenario(ABC):
    """Base abstracta para escenarios."""

    @abstractmethod
    def generate_params(self, t: float) -> Optional[LiveParams]:
        """Genera LiveParams en tiempo t (segundos desde inicio).
        Retorna None para no enviar update (ej. idle)."""
        pass

    def get_next_step(self) -> Optional[LiveParams]:
        """Para step-mode: avanza al siguiente paso discreto.
        Retorna None cuando se acabó el escenario."""
        return None

    def reset(self) -> None:
        """Reinicia el estado del escenario."""
        pass


@dataclass
class SweepStep:
    param: str
    start: float
    end: float
    duration: float


class SweepScenario(Scenario):
    """
    Barrido determinista y monotónico de cada parámetro, uno a la vez.

    Orden:
    1. filter_cutoff: 200 → 12000 Hz (log)
    2. drive: 0 → 1
    3. delay_time: 50 → 800 ms
    4. echo_feedback: 0 → 0.8
    5. reverb_mix: 0 → 1
    6. filter_res: 0.7 → 12 (lineal)
    """

    # Valores de barrido (param, start, end, duration_s)
    SWEEP_SEQUENCE = [
        SweepStep("filter_cutoff", 200.0, 12000.0, 3.0),
        SweepStep("drive", 0.0, 1.0, 2.0),
        SweepStep("delay_time", 50.0, 800.0, 2.0),
        SweepStep("echo_feedback", 0.0, 0.8, 2.0),
        SweepStep("reverb_mix", 0.0, 1.0, 2.0),
        SweepStep("filter_res", 0.7, 12.0, 2.0),
    ]

    def __init__(self, step_mode: bool = False):
        self.step_mode = step_mode
        self.current_step = 0
        self.step_start_time = 0.0
        self.step_t = 0.0
        self._params = self._neutral_params()

    def _neutral_params(self) -> LiveParams:
        return {
            "filter_cutoff": 12000.0,
            "filter_res": 0.7,
            "drive": 0.0,
            "delay_time": 250.0,
            "echo_feedback": 0.0,
            "reverb_mix": 0.0,
            "output_level": 0.9,
            "fx_preset": None,
            "ts": time.time(),
        }

    def _log_interpolate(self, start: float, end: float, t: float) -> float:
        """Interpolación logarítmica para filter_cutoff."""
        return start * (end / start) ** t

    def _linear_interpolate(self, start: float, end: float, t: float) -> float:
        return start + (end - start) * t

    def _interpolate(self, step: SweepStep, t: float) -> float:
        if step.param == "filter_cutoff":
            return self._log_interpolate(step.start, step.end, t)
        return self._linear_interpolate(step.start, step.end, t)

    def reset(self) -> None:
        self.current_step = 0
        self.step_start_time = 0.0
        self.step_t = 0.0
        self._params = self._neutral_params()

    def generate_params(self, t: float) -> Optional[LiveParams]:
        if self.step_mode:
            return self._generate_step_mode(t)
        return self._generate_continuous(t)

    def _generate_continuous(self, t: float) -> Optional[LiveParams]:
        # Calcular qué step estamos ejecutando
        elapsed = t
        step_start = 0.0

        for i, step in enumerate(self.SWEEP_SEQUENCE):
            step_end = step_start + step.duration
            if step_start <= elapsed < step_end:
                self.current_step = i
                step_t = (elapsed - step_start) / step.duration
                value = self._interpolate(step, step_t)

                self._params = self._neutral_params()
                self._params[step.param] = value
                self._params["ts"] = time.time()
                return self._params
            step_start = step_end

        # Escenario terminado - mantener último valor
        self._params["ts"] = time.time()
        return self._params

    def _generate_step_mode(self, t: float) -> Optional[LiveParams]:
        # En step-mode, cada llamada a get_next_step() avanza al siguiente valor discreto
        if self.step_t == 0.0:
            # Primera llamada - iniciar primer step
            self.step_start_time = t
            self.step_t = 0.0
            if self.current_step < len(self.SWEEP_SEQUENCE):
                step = self.SWEEP_SEQUENCE[self.current_step]
                value = step.start
                self._params = self._neutral_params()
                self._params[step.param] = value
                self._params["ts"] = time.time()
                return self._params
            return None

        # Verificar si avanzar al siguiente step
        step = self.SWEEP_SEQUENCE[self.current_step]
        if t - self.step_start_time >= step.duration:
            self.current_step += 1
            self.step_start_time = t
            if self.current_step < len(self.SWEEP_SEQUENCE):
                step = self.SWEEP_SEQUENCE[self.current_step]
                value = step.start
                self._params = self._neutral_params()
                self._params[step.param] = value
                self._params["ts"] = time.time()
                return self._params
            return None

        # Interpolar dentro del step actual
        step_t = (t - self.step_start_time) / step.duration
        value = self._interpolate(step, step_t)
        self._params = self._neutral_params()
        self._params[step.param] = value
        self._params["ts"] = time.time()
        return self._params

    def get_next_step(self) -> Optional[LiveParams]:
        """Para step-mode: avanza al siguiente step discreto."""
        if self.current_step >= len(self.SWEEP_SEQUENCE):
            return None
        step = self.SWEEP_SEQUENCE[self.current_step]
        self._params = self._neutral_params()
        self._params[step.param] = step.end  # Valor final del step
        self._params["ts"] = time.time()
        self.current_step += 1
        return self._params


class PresetsScenario(Scenario):
    """
    Cambia presets por notas MIDI cada N segundos.

    Notas → Presets:
    36 (Kick)    → clean
    38 (Snare)   → dub
    42 (Closed HH) → big_room
    49 (Open HH) → radio
    """

    PRESET_SEQUENCE = [
        (36, "clean"),
        (38, "dub"),
        (42, "big_room"),
        (49, "radio"),
    ]

    def __init__(self, interval: float = 2.0):
        self.interval = interval
        self.current_index = 0
        self.last_change = 0.0
        self._params = self._neutral_params()

    def _neutral_params(self) -> LiveParams:
        return {
            "filter_cutoff": 12000.0,
            "filter_res": 0.7,
            "drive": 0.0,
            "delay_time": 250.0,
            "echo_feedback": 0.0,
            "reverb_mix": 0.0,
            "output_level": 0.9,
            "fx_preset": None,
            "ts": time.time(),
        }

    def reset(self) -> None:
        self.current_index = 0
        self.last_change = 0.0
        self._params = self._neutral_params()

    def generate_params(self, t: float) -> Optional[LiveParams]:
        if t - self.last_change >= self.interval:
            note, preset = self.PRESET_SEQUENCE[self.current_index]
            self.current_index = (self.current_index + 1) % len(self.PRESET_SEQUENCE)
            self.last_change = t

            self._params = self._neutral_params()
            self._params["fx_preset"] = preset
            self._params["ts"] = time.time()
            return self._params

        self._params["ts"] = time.time()
        return self._params


class RandomWalkScenario(Scenario):
    """
    Caminata aleatoria acotada con seed fijo (reproducible).

    Parámetros y rangos:
    - filter_cutoff: 200-12000 (log)
    - filter_res: 0.5-12
    - drive: 0-1
    - delay_time: 50-800
    - echo_feedback: 0-0.8
    - reverb_mix: 0-1
    """

    PARAM_RANGES = {
        "filter_cutoff": (200.0, 12000.0),
        "filter_res": (0.5, 12.0),
        "drive": (0.0, 1.0),
        "delay_time": (50.0, 800.0),
        "echo_feedback": (0.0, 0.8),
        "reverb_mix": (0.0, 1.0),
    }

    def __init__(self, seed: int = 42, step_size: float = 0.05):
        self.seed = seed
        self.step_size = step_size
        self.rng = random.Random(seed)
        self._params = self._neutral_params()
        self._current_values = {
            "filter_cutoff": 12000.0,
            "filter_res": 0.7,
            "drive": 0.0,
            "delay_time": 250.0,
            "echo_feedback": 0.0,
            "reverb_mix": 0.0,
        }

    def _neutral_params(self) -> LiveParams:
        return {
            "filter_cutoff": 12000.0,
            "filter_res": 0.7,
            "drive": 0.0,
            "delay_time": 250.0,
            "echo_feedback": 0.0,
            "reverb_mix": 0.0,
            "output_level": 0.9,
            "fx_preset": None,
            "ts": time.time(),
        }

    def _log_random_step(self, current: float, min_val: float, max_val: float, step: float) -> float:
        """Paso aleatorio en escala logarítmica."""
        log_min = math.log(min_val)
        log_max = math.log(max_val)
        log_current = math.log(current)
        log_step = step * (log_max - log_min)
        log_next = log_current + self.rng.uniform(-log_step, log_step)
        log_next = max(log_min, min(log_max, log_next))
        return math.exp(log_next)

    def _linear_random_step(self, current: float, min_val: float, max_val: float, step: float) -> float:
        step_size = step * (max_val - min_val)
        next_val = current + self.rng.uniform(-step_size, step_size)
        return max(min_val, min(max_val, next_val))

    def reset(self) -> None:
        self.rng = random.Random(self.seed)
        self._params = self._neutral_params()
        self._current_values = {
            "filter_cutoff": 12000.0,
            "filter_res": 0.7,
            "drive": 0.0,
            "delay_time": 250.0,
            "echo_feedback": 0.0,
            "reverb_mix": 0.0,
        }

    def generate_params(self, t: float) -> Optional[LiveParams]:
        # Actualizar cada parámetro con random walk
        for param, (min_val, max_val) in self.PARAM_RANGES.items():
            current = self._current_values[param]
            if param == "filter_cutoff":
                next_val = self._log_random_step(current, min_val, max_val, self.step_size)
            else:
                next_val = self._linear_random_step(current, min_val, max_val, self.step_size)
            self._current_values[param] = next_val
            self._params[param] = next_val

        self._params["ts"] = time.time()
        return self._params


class IdleScenario(Scenario):
    """Solo HELLO + PING/PONG, sin PARAM_UPDATE."""

    def generate_params(self, t: float) -> Optional[LiveParams]:
        return None  # No enviar PARAM_UPDATE


class ChaosScenario(Scenario):
    """
    Payloads inválidos intencionales para testear resiliencia.

    Tipos de caos:
    1. Params fuera de rango
    2. Campos faltantes
    3. JSON malformado
    4. Tipos incorrectos
    """

    CHAOS_TYPES = [
        "out_of_range",
        "missing_fields",
        "malformed_json",
        "wrong_types",
    ]

    def __init__(self, seed: int = 42):
        self.rng = random.Random(seed)
        self.chaos_index = 0
        self._params = {
            "filter_cutoff": 12000.0,
            "filter_res": 0.7,
            "drive": 0.0,
            "delay_time": 250.0,
            "echo_feedback": 0.0,
            "reverb_mix": 0.0,
            "output_level": 0.9,
            "fx_preset": None,
            "ts": time.time(),
        }

    def reset(self) -> None:
        self.chaos_index = 0

    def generate_params(self, t: float) -> Optional[LiveParams]:
        chaos_type = self.CHAOS_TYPES[self.chaos_index % len(self.CHAOS_TYPES)]
        self.chaos_index += 1

        if chaos_type == "out_of_range":
            return {
                "filter_cutoff": 20000.0,  # Fuera de rango (max 12000)
                "filter_res": 20.0,         # Fuera de rango (max 12)
                "drive": 2.0,               # Fuera de rango (max 1)
                "delay_time": 2000.0,       # Fuera de rango (max 800)
                "echo_feedback": 1.5,       # Fuera de rango (max 0.8)
                "reverb_mix": 2.0,          # Fuera de rango (max 1)
                "output_level": 2.0,        # Fuera de rango (max 1)
                "fx_preset": "invalid_preset",
                "ts": time.time(),
            }

        elif chaos_type == "missing_fields":
            # Solo enviar filter_cutoff, omitir el resto
            return {
                "filter_cutoff": 6000.0,
                "ts": time.time(),
            }

        elif chaos_type == "wrong_types":
            return {
                "filter_cutoff": "6000",      # String en vez de number
                "filter_res": "high",         # String
                "drive": True,                # Boolean
                "delay_time": None,           # Null
                "ts": time.time(),
            }

        elif chaos_type == "malformed_json":
            # Esto se maneja a nivel de serialización, no aquí
            # Retornamos params válidos pero el bridge los serializará mal a propósito
            return {
                "filter_cutoff": 6000.0,
                "ts": time.time(),
            }

        return {
            "filter_cutoff": 6000.0,
            "ts": time.time(),
        }


# Factory para crear escenarios por nombre
def create_scenario(name: str, **kwargs) -> Scenario:
    scenarios = {
        "sweep": SweepScenario,
        "presets": PresetsScenario,
        "random_walk": RandomWalkScenario,
        "idle": IdleScenario,
        "chaos": ChaosScenario,
    }
    if name not in scenarios:
        raise ValueError(f"Escenario desconocido: {name}. Disponibles: {list(scenarios.keys())}")
    return scenarios[name](**kwargs)