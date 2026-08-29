"""
Mono compatibility control for low frequencies.

Forces frequencies below a cutoff (default 120Hz) to mono center,
preventing phase cancellation on mono playback systems (clubs, AM/FM radio, phones).
"""

import numpy as np
from scipy.signal import butter, sosfilt


def enforce_mono_compatibility(
    audio: np.ndarray,
    sr: int,
    cutoff_hz: int = 120,
) -> np.ndarray:
    """
    Force low frequencies to mono center for compatibility with mono systems.

    Args:
        audio: Stereo audio array (2, samples)
        sr: Sample rate
        cutoff_hz: Frequency below which to sum to mono (default 120Hz)

    Returns:
        Processed audio with mono low frequencies
    """
    if audio.ndim != 2 or audio.shape[0] != 2:
        return audio  # Not stereo, return as-is

    # Design low-pass crossover filter (4th order Butterworth)
    sos = butter(4, cutoff_hz / (sr / 2), btype="low", output="sos")

    left = audio[0]
    right = audio[1]

    # Extract mono component of low frequencies
    mono_low = sosfilt(sos, (left + right) / 2)

    # Extract stereo component of high frequencies (original - low)
    high_left = left - sosfilt(sos, left)
    high_right = right - sosfilt(sos, right)

    # Reconstruct: mono lows + stereo highs
    output = np.array([
        mono_low + high_left,
        mono_low + high_right,
    ])

    return output
