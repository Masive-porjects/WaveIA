"""Mid/Side spatial processing and reverb (Section 5.7).

Handles M/S encoding, per-preset spatial effects on the Side channel,
and phase correlation safety enforcement.
"""
import numpy as np
from pedalboard import Pedalboard, HighpassFilter, LowpassFilter, PeakFilter, Reverb


def mid_side_encode(audio: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Encode stereo L/R to Mid/Side matrix.

    Args:
        audio: Stereo audio array of shape (2, samples).

    Returns:
        Tuple of (mid, side) arrays, each of shape (samples,).
    """
    left = audio[0]
    right = audio[1]
    mid = (left + right) / np.sqrt(2)
    side = (left - right) / np.sqrt(2)
    return mid, side


def mid_side_decode(mid: np.ndarray, side: np.ndarray) -> np.ndarray:
    """Decode Mid/Side back to stereo L/R.

    Args:
        mid: Mid channel, shape (samples,).
        side: Side channel, shape (samples,).

    Returns:
        Stereo array of shape (2, samples).
    """
    left = (mid + side) / np.sqrt(2)
    right = (mid - side) / np.sqrt(2)
    return np.stack([left, right])


def apply_claridad_spatial(side: np.ndarray, sr: int) -> np.ndarray:
    """Claridad preset: parallel reverb on Side + high-freq shelf boost.

    1. HPF @ 500Hz + LPF @ 12kHz on Side before reverb
    2. Small room reverb (room_size=0.25, wet ~2%)
    3. Parallel mix: blend wet with dry
    4. Shelf boost +1dB at 8kHz on processed Side
    """
    side_1ch = side.reshape(1, -1).astype(np.float32)

    # Input filtering before reverb
    filter_board = Pedalboard([
        HighpassFilter(cutoff_frequency_hz=500),
        LowpassFilter(cutoff_frequency_hz=12000),
    ])
    filtered = filter_board(side_1ch, sr)

    # Reverb
    reverb_board = Pedalboard([
        Reverb(
            room_size=0.25,
            damping=0.5,
            wet_level=0.02,
            dry_level=0.98,
            width=0.8,
        )
    ])
    wet = reverb_board(filtered, sr)

    # Parallel mix: 98% dry + 2% wet (wet_level already at 0.02,
    # dry_level at 0.98 handles the blend, but we reinforce)
    mixed = 0.98 * side_1ch + 0.02 * wet

    # High-frequency shelf boost: +1dB at 8kHz
    boost_board = Pedalboard([
        PeakFilter(cutoff_frequency_hz=8000, gain_db=1.0, q=0.5),
    ])
    mixed = boost_board(mixed, sr)

    return mixed.flatten().astype(np.float64)


def apply_cinematico_spatial(side: np.ndarray, sr: int) -> np.ndarray:
    """Cinemático preset: phase decorrelation + large room reverb on Side.

    1. Micro-delay 10ms on Side, mix 50/50 with original
    2. HPF @ 400Hz on Side
    3. Large room reverb (room_size=0.6, wet ~2.5%, decay ~1.5s)
    """
    side_1ch = side.reshape(1, -1).astype(np.float32)

    # Phase decorrelation: 10ms micro-delay
    delay_samples = int(sr * 0.010)
    delayed = np.pad(side[:-delay_samples], (delay_samples, 0))
    decorrelated = 0.5 * side + 0.5 * delayed
    decorrelated_1ch = decorrelated.reshape(1, -1).astype(np.float32)

    # HPF before reverb
    filter_board = Pedalboard([
        HighpassFilter(cutoff_frequency_hz=400),
    ])
    filtered = filter_board(decorrelated_1ch, sr)

    # Large room reverb
    reverb_board = Pedalboard([
        Reverb(
            room_size=0.6,
            damping=0.3,
            wet_level=0.025,
            dry_level=0.975,
            width=0.9,
        )
    ])
    processed = reverb_board(filtered, sr)

    return processed.flatten().astype(np.float64)


def check_phase_correlation(audio: np.ndarray) -> float:
    """Measure stereo phase correlation between L and R channels.

    Returns a value between -1.0 (fully out of phase) and 1.0 (identical).
    """
    left = audio[0]
    right = audio[1]
    norm = np.linalg.norm(left) * np.linalg.norm(right) + 1e-10
    return float(np.dot(left, right) / norm)


def safety_enforce_correlation(audio: np.ndarray, sr: int) -> np.ndarray:
    """Reduce Side channel until phase correlation >= 0.2.

    Iteratively attenuates Side by 10% per pass (max 10 iterations).
    If attenuation alone cannot fix correlation (e.g. Mid ≈ 0),
    falls back to blending toward mono from the decoded Left channel.
    """
    mid, side = mid_side_encode(audio)
    side_gain = 1.0

    for _ in range(10):
        attenuated_side = side * side_gain
        reconstructed = mid_side_decode(mid, attenuated_side)
        corr = check_phase_correlation(reconstructed)
        if corr >= 0.2:
            return reconstructed
        side_gain *= 0.9

    # Edge case: Mid ≈ 0, Side attenuation alone can't fix correlation.
    # Blend the decoded output toward a mono copy of the Left channel.
    best = mid_side_decode(mid, side * side_gain)
    mono_left = np.stack([best[0], best[0]])
    for blend in np.arange(0.1, 1.05, 0.1):
        candidate = best * (1.0 - blend) + mono_left * blend
        corr = check_phase_correlation(candidate)
        if corr >= 0.2:
            return candidate

    return mono_left
