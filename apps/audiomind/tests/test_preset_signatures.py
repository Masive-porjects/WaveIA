"""Preset audio signatures — audible character EQ + real stereo width.

Covers the preset-signature scope:

  1. ``MasteringParameters.eq_bands`` neutral default is ``[]`` (bit-exact
     bypass): pristine params stay byte-identical through the engine.
  2. ``_build_preset_params`` carries the declared character bands into the
     DSP parameters (fuego's 80 Hz low shelf), honors espacial's declared
     ``stereo_width: 1.4``, and renders cinematico with width 1.0 / no Haas
     once its accidental ``"spatial": "cinematico"`` flag is gone.
  3. Engine DSP: fuego's character EQ is AUDIBLE (measurable spectral delta
     in the 60-100 Hz bass region vs a neutral chain and vs the same chain
     without bands); espacial processing audibly increases side-channel
     energy vs the neutral natural preset.

Conventions mirror the rest of the suite: ``sys.path.insert(0, "src")``,
synthetic numpy WAVs into ``tmp_path``, soundfile round-trips and
``engine.process_audio`` integration coverage. Reuses the existing
``analyze_band_energies`` helper — no new DSP deps.
"""
import sys

sys.path.insert(0, "src")

import numpy as np
import soundfile as sf

from audiomind.analysis.analyzer import analyze_band_energies
from audiomind.api.mastering import _build_preset_params
from audiomind.models.audio import MasteringParameters
from audiomind.processing.engine import process_audio

SR = 44100


def _write_wav(path, samples, sr=SR, subtype="FLOAT") -> None:
    x = np.asarray(samples)
    blocks = x.T if x.ndim == 2 else x
    sf.write(str(path), blocks, sr, subtype=subtype)


def _bass_air_program(seconds: float = 2.0, seed: int = 11) -> np.ndarray:
    """Bass-and-air-rich stereo program (the "needs character" case).

    Raw-mix profile (≈ -15 LUFS, peak -9 dBFS): strong 80 Hz fundamental +
    9 kHz air content through a slowly moving envelope, so both the fuego
    low-shelf and the espacial width have real material to act on WITHOUT
    the loudness/limiter stages of an already-hot chain erasing the
    character (empirically calibrated: fuego's bass band then lands
    +3+ dB above neutral and +1+ dB above the same chain without bands).
    """
    rng = np.random.default_rng(seed)
    n = int(SR * seconds)
    t = np.linspace(0.0, seconds, n, endpoint=False)
    env = (
        0.38
        + 0.06 * np.sin(2 * np.pi * 0.4 * t)
        + 0.04 * np.sin(2 * np.pi * 0.27 * t + 0.5)
    )
    air = 0.02 * np.sin(2 * np.pi * 9000 * t) * env
    noise = 0.004 * rng.standard_normal(n)
    left = (
        0.25 * np.sin(2 * np.pi * 80 * t) * env
        + 0.10 * np.sin(2 * np.pi * 440 * t) * env
        + air
        + noise
    )
    right = (
        0.25 * np.sin(2 * np.pi * 80 * t + 0.05) * env
        + 0.10 * np.sin(2 * np.pi * 441 * t + 0.02) * env
        + air
        + noise
    )
    x = np.stack([left, right])
    x = x / np.max(np.abs(x)) * 10 ** (-9.0 / 20)  # peak ≈ -9 dBFS (raw mix)
    return x


def _read_audio(path) -> tuple[np.ndarray, int]:
    arr, sr = sf.read(str(path), always_2d=True)
    return arr.T, sr


def _band_energy_db(audio: np.ndarray, sr: int, center_hz: float) -> float:
    """RMS energy (dB) in the octave around ``center_hz`` (reused helper)."""
    mono = np.mean(audio, axis=0)
    return float(analyze_band_energies(mono, sr, [center_hz])[0])


def _side_energy_db(audio: np.ndarray) -> float:
    """RMS energy (dB) of the side channel (L - R) / 2."""
    if audio.shape[0] == 1:
        return -80.0
    side = (audio[0] - audio[1]) / 2.0
    return float(20.0 * np.log10(max(np.sqrt(np.mean(side**2)), 1e-10)))


# ── 1. Neutral default ────────────────────────────────────────────────


def test_eq_bands_neutral_default_is_empty():
    """The new field must default to [] so pristine masters stay bit-exact."""
    assert MasteringParameters().eq_bands == []


# ── 2. Preset param building ──────────────────────────────────────────


def test_build_preset_params_fuego_carries_bass_shelf():
    """fuego's declared 80 Hz low_shelf character band reaches the DSP."""
    params = _build_preset_params("fuego")
    assert any(
        b.get("type") == "low_shelf" and b.get("freq") == 80
        for b in params.eq_bands
    )


def test_build_preset_params_espacial_uses_declared_width():
    """espacial ships stereo_width 1.4 — the declared value must win over
    the legacy 1.2 hardcode."""
    assert _build_preset_params("espacial").stereo_width == 1.4


def test_build_preset_params_cinematico_has_no_spatial_character():
    """cinematico's accidental spatial flag is gone → width 1.0, no Haas."""
    params = _build_preset_params("cinematico")
    assert params.stereo_width == 1.0
    assert params.haas_delay_ms == 0.0


# ── 3. Engine DSP — character audible ─────────────────────────────────


def test_fuego_character_eq_is_audible_in_bass_region(tmp_path):
    """fuego's chain (with its 80 Hz low shelf) measurably lifts the
    60-100 Hz region vs a neutral chain, and vs the SAME fuego chain with
    the bands removed — proving the character EQ (not the rest of the
    chain) is what moves the bass."""
    in_path = tmp_path / "in.wav"
    out_neutral = tmp_path / "neutral.wav"
    out_fuego = tmp_path / "fuego.wav"
    out_fuego_no_bands = tmp_path / "fuego_no_bands.wav"
    _write_wav(in_path, _bass_air_program())

    fuego = _build_preset_params("fuego")
    fuego_no_bands = fuego.model_copy(update={"eq_bands": []})

    process_audio(in_path, out_neutral, MasteringParameters())
    process_audio(in_path, out_fuego, fuego)
    process_audio(in_path, out_fuego_no_bands, fuego_no_bands)

    neutral_arr, _ = _read_audio(out_neutral)
    fuego_arr, sr = _read_audio(out_fuego)
    fuego_no_bands_arr, _ = _read_audio(out_fuego_no_bands)

    neutral_db = _band_energy_db(neutral_arr, sr, 80)
    fuego_db = _band_energy_db(fuego_arr, sr, 80)
    fuego_no_bands_db = _band_energy_db(fuego_no_bands_arr, sr, 80)

    # Generous, non-flaky thresholds: loudness normalization alone can add
    # ~2 dB, so the EQ must lift the bass beyond that.
    assert fuego_db > neutral_db + 1.5, (
        f"fuego bass {fuego_db:.1f} dB vs neutral {neutral_db:.1f} dB"
    )
    assert fuego_db > fuego_no_bands_db + 1.0, (
        f"fuego bass {fuego_db:.1f} dB vs no-bands {fuego_no_bands_db:.1f} dB"
    )


def test_espacial_increases_side_channel_energy(tmp_path):
    """espacial (width 1.4 + Haas on side) audibly widens the image vs the
    neutral natural preset: more energy in the L - R channel."""
    in_path = tmp_path / "in.wav"
    out_natural = tmp_path / "natural.wav"
    out_espacial = tmp_path / "espacial.wav"
    _write_wav(in_path, _bass_air_program())

    process_audio(in_path, out_natural, _build_preset_params("natural"))
    process_audio(in_path, out_espacial, _build_preset_params("espacial"))

    natural_arr, _ = _read_audio(out_natural)
    espacial_arr, _ = _read_audio(out_espacial)

    natural_side = _side_energy_db(natural_arr)
    espacial_side = _side_energy_db(espacial_arr)

    assert espacial_side > natural_side + 0.5, (
        f"espacial side {espacial_side:.1f} dB vs natural {natural_side:.1f} dB"
    )