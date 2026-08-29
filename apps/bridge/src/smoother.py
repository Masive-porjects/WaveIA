"""
Smoother - EMA filtering, dead zone, and rate limiting.
Prevents jitter and throttles output to max 30-60 Hz.
"""
import time
from dataclasses import dataclass, field
from typing import Optional, Dict, Any

from .live_params import LiveParams


@dataclass
class SmootherState:
    """Per-parameter smoothing state."""
    value: float
    last_raw: float
    last_output: float
    last_output_time: float


class LiveParamsSmoother:
    """
    Applies smoothing to LiveParams updates.

    Features:
    - EMA (Exponential Moving Average) per parameter
    - Dead zone: ignores changes smaller than threshold
    - Rate limiting: max updates per second
    """

    def __init__(
        self,
        ema_alpha: float = 0.3,
        dead_zone: int = 2,
        max_rate_hz: int = 60,
    ):
        self.ema_alpha = ema_alpha
        self.dead_zone = dead_zone  # In CC units (0-127)
        self.min_interval = 1.0 / max_rate_hz

        # Per-parameter state (stored in CC space for dead zone)
        self._state: Dict[str, SmootherState] = {}

        # CC to parameter mapping and conversion functions
        self._cc_to_param = {
            74: ("filter_cutoff", self._cc_to_filter_cutoff),
            92: ("reverb_mix", self._cc_to_reverb_mix),
            71: ("delay_time", self._cc_to_delay_time),
            73: ("echo_feedback", self._cc_to_echo_feedback),
            16: ("drive", self._cc_to_drive),
        }

        # Neutral defaults (in CC space)
        self._neutral_cc = {
            "filter_cutoff": 127,   # 12000 Hz
            "reverb_mix": 0,        # 0.0
            "delay_time": 42,       # 250 ms
            "echo_feedback": 0,     # 0.0
            "drive": 0,             # 0.0
        }

    # ─── Conversion Functions (CC <-> Param) ────────────────────────

    def _cc_to_filter_cutoff(self, cc: int) -> float:
        return 200.0 * (60.0 ** (cc / 127.0))

    def _filter_cutoff_to_cc(self, hz: float) -> int:
        if hz <= 200:
            return 0
        if hz >= 12000:
            return 127
        return int(round(127 * math.log(hz / 200.0) / math.log(60.0)))

    def _cc_to_reverb_mix(self, cc: int) -> float:
        return cc / 127.0

    def _reverb_mix_to_cc(self, val: float) -> int:
        return int(round(max(0.0, min(1.0, val)) * 127))

    def _cc_to_delay_time(self, cc: int) -> float:
        return 50.0 + 750.0 * (cc / 127.0)

    def _delay_time_to_cc(self, ms: float) -> int:
        return int(round(max(0, min(127, (ms - 50) / 750 * 127))))

    def _cc_to_echo_feedback(self, cc: int) -> float:
        return 0.8 * cc / 127.0

    def _echo_feedback_to_cc(self, val: float) -> int:
        return int(round(max(0.0, min(0.8, val)) / 0.8 * 127))

    def _cc_to_drive(self, cc: int) -> float:
        return cc / 127.0

    def _drive_to_cc(self, val: float) -> int:
        return int(round(max(0.0, min(1.0, val)) * 127))

    # ─── Main Smoothing Logic ──────────────────────────────────────

    def smooth(self, params: LiveParams) -> LiveParams:
        """
        Apply smoothing to LiveParams.

        Returns smoothed params if any parameter changed significantly
        and rate limit allows, otherwise returns original params.
        """
        now = time.time()

        # Check rate limit
        if self._state:
            last_time = max(s.last_output_time for s in self._state.values())
            if now - last_time < self.min_interval:
                return params  # Rate limited

        # Track which params actually changed
        any_changed = False
        smoothed_values = {}

        # Process CC-mapped parameters
        for cc, (param_name, cc_to_param) in self._cc_to_param.items():
            # Get current raw value in CC space
            raw_cc = self._param_to_cc(param_name, getattr(params, param_name))

            # Initialize state if needed
            if param_name not in self._state:
                self._state[param_name] = SmootherState(
                    value=raw_cc,
                    last_raw=raw_cc,
                    last_output=raw_cc,
                    last_output_time=now,
                )

            state = self._state[param_name]

            # Dead zone check (in CC space)
            if abs(raw_cc - state.last_raw) <= self.dead_zone:
                # No significant change - keep previous output
                smoothed_cc = state.last_output
            else:
                # Apply EMA in CC space
                smoothed_cc = self.ema_alpha * raw_cc + (1 - self.ema_alpha) * state.last_output
                smoothed_cc = int(round(smoothed_cc))
                any_changed = True

                # Update state
                state.value = smoothed_cc
                state.last_raw = raw_cc
                state.last_output = smoothed_cc
                state.last_output_time = now

            # Convert back to param space
            smoothed_values[param_name] = cc_to_param(smoothed_cc)

        # Pass through non-smoothed params
        for p in ["filter_res", "output_level"]:
            smoothed_values[p] = getattr(params, p)

        # fx_preset passes through (discrete)
        smoothed_values["fx_preset"] = params.fx_preset

        # If nothing changed, return original to preserve timestamp
        if not any_changed:
            return params

        # Return new smoothed LiveParams
        return LiveParams(
            ts=now,
            **smoothed_values
        )

    def _param_to_cc(self, param_name: str, value: float) -> int:
        """Convert parameter value to CC space for smoothing."""
        if param_name == "filter_cutoff":
            return self._filter_cutoff_to_cc(value)
        elif param_name == "reverb_mix":
            return self._reverb_mix_to_cc(value)
        elif param_name == "delay_time":
            return self._delay_time_to_cc(value)
        elif param_name == "echo_feedback":
            return self._echo_feedback_to_cc(value)
        elif param_name == "drive":
            return self._drive_to_cc(value)
        return 0

    def reset(self) -> None:
        """Reset all smoothing state to neutral."""
        now = time.time()
        self._state.clear()
        for param_name, neutral_cc in self._neutral_cc.items():
            self._state[param_name] = SmootherState(
                value=neutral_cc,
                last_raw=neutral_cc,
                last_output=neutral_cc,
                last_output_time=now,
            )

    def force_update(self, params: LiveParams) -> LiveParams:
        """Force update bypassing rate limit and dead zone."""
        smoothed_values = {}
        now = time.time()

        for cc, (param_name, cc_to_param) in self._cc_to_param.items():
            raw_cc = self._param_to_cc(param_name, getattr(params, param_name))
            if param_name not in self._state:
                self._state[param_name] = SmootherState(
                    value=raw_cc, last_raw=raw_cc, last_output=raw_cc, last_output_time=now
                )
            state = self._state[param_name]
            state.value = raw_cc
            state.last_raw = raw_cc
            state.last_output = raw_cc
            state.last_output_time = now
            smoothed_values[param_name] = cc_to_param(raw_cc)

        for p in ["filter_res", "output_level"]:
            smoothed_values[p] = getattr(params, p)
        smoothed_values["fx_preset"] = params.fx_preset

        return LiveParams(ts=now, **smoothed_values)


# Import math at module level
import math