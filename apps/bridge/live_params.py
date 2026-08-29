"""
LiveParams -- Tipos generados automaticamente desde live_params.schema.json
NO EDITAR A MANO: ejecutar packages/contracts/scripts/gen_types.py
"""

from dataclasses import dataclass, field
from typing import Optional, Literal


@dataclass
class LiveParams:
    ts: float
    filter_cutoff: float = 12000
    filter_res: float = 0.7
    drive: float = 0
    delay_time: float = 250
    echo_feedback: float = 0
    reverb_mix: float = 0
    output_level: float = 0.9
    fx_preset: Optional[Literal["clean", "dub", "big_room", "radio"]] = field(default=None)

    @classmethod
    def defaults(cls) -> 'LiveParams':
        return cls(
            ts=0.0,
            filter_cutoff=12000,
            filter_res=0.7,
            drive=0,
            delay_time=250,
            echo_feedback=0,
            reverb_mix=0,
            output_level=0.9,
            fx_preset=None,
        )

    @classmethod
    def neutral(cls) -> 'LiveParams':
        '''Neutral = bypass bit-exacto / audio identico'''
        return cls(
            ts=0.0,
            filter_cutoff=12000,
            filter_res=0.7,
            drive=0,
            delay_time=250,
            echo_feedback=0,
            reverb_mix=0,
            output_level=0.9,
            fx_preset=None,
        )