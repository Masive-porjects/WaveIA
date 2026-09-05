"""Explicit-subtype PCM output writer for mastered audio.

The pedalboard ``AudioFile`` writer downconverts float audio to 16-bit
PCM regardless of the requested bit depth (silent quality degradation).
This module writes WAV output through ``soundfile`` with an EXPLICIT
subtype so the delivered file honors the requested bit depth (default
24-bit, per ``MasteringParameters.output_bit_depth``).

Trade-off (Compliance Phase 1): the engine's neutral fast-path KEEPS
writing float WAV via soundfile (``subtype="FLOAT"``) because that path
must stay byte-identical for existing clients. Every real processed
output — including transparent mode — goes through :func:`write_output`
and carries the explicit PCM subtype.
"""

from pathlib import Path

import numpy as np
import soundfile as sf

#: soundfile subtype per requested bit depth.
SUBTYPE_BY_BIT_DEPTH: dict[int, str] = {
    16: "PCM_16",
    24: "PCM_24",
    32: "PCM_32",
}


def write_output(
    audio: np.ndarray,
    out_path: str | Path,
    sr: int,
    bit_depth: int = 24,
) -> None:
    """Write ``audio`` as an explicit-subtype PCM WAV.

    Args:
        audio: Float audio in ``[-1, 1]``, shape ``(channels, samples)``
            or ``(samples,)`` (mono).
        out_path: Destination WAV path.
        sr: Output sample rate.
        bit_depth: 16, 24 or 32 — mapped to the exact soundfile subtype.
            Anything else raises ``ValueError`` (fail loudly, never write
            a silently-wrong container).

    Raises:
        ValueError: If ``bit_depth`` is not 16, 24 or 32.
    """
    subtype = SUBTYPE_BY_BIT_DEPTH.get(bit_depth)
    if subtype is None:
        raise ValueError(
            f"Unsupported bit depth: {bit_depth} (expected 16, 24 or 32)"
        )
    blocks = audio.T if audio.ndim == 2 else audio
    sf.write(str(out_path), blocks, sr, subtype=subtype)