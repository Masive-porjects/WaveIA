"""Objective tests for the Sprint 10 time-based effects (delay / echo / reverb).

Covers the opt-in contract of the three new mastering insert stages:
bit-exact NEUTRAL bypass (mix == 0.0 → the stage returns the input
untouched even when enabled), engaged stages change the audio, mono (1-D)
and stereo (channels, samples) handling, shape/dtype preservation, empty
inputs, parameter validation, determinism, the engine's mapping helpers,
and engine-level integration: pristine-default fast-path neutrality,
enabled-but-neutral stages contributing nothing to the master, engaged
stages changing the master, and mono+stereo end-to-end runs.
"""
import sys

sys.path.insert(0, "src")

import numpy as np
import pytest
import soundfile as sf

from audiomind.models.audio import MasteringParameters
from audiomind.processing.delay import (
    Delay,
    DelayParams,
    delay_is_neutral,
    delay_pass,
)
from audiomind.processing.echo import Echo, EchoParams, echo_is_neutral, echo_pass
from audiomind.processing.engine import (
    _delay_params_from_mastering,
    _echo_params_from_mastering,
    _reverb_params_from_mastering,
    process_audio,
)
from audiomind.processing.reverb import (
    Reverb,
    ReverbParams,
    reverb_is_neutral,
    reverb_pass,
)

SR = 44100


def _noise(n: int = SR // 2, seed: int = 0) -> np.ndarray:
    rng = np.random.default_rng(seed)
    return rng.standard_normal(n) * 0.25


# ── Neutral bypass (mix == 0.0 → bit-exact regardless of other knobs) ────


def test_delay_neutral_is_bit_exact():
    x = _noise().astype(np.float32)
    assert delay_is_neutral(DelayParams())
    assert DelayParams().is_neutral()
    # All-defaults wrapper: bit-exact no-op.
    assert np.array_equal(delay_pass(x, SR), x)
    # mix == 0 keeps the stage neutral EVEN with the timing knobs moved.
    assert np.array_equal(
        delay_pass(x, SR, DelayParams(time_ms=750.0, mix=0.0, feedback=0.8)), x
    )
    # Engine contract: delay_enabled=True with the default (zero) mix maps
    # to a neutral stage → the engine's own path leaves the signal untouched.
    from_engine = _delay_params_from_mastering(MasteringParameters(delay_enabled=True))
    assert from_engine.is_neutral()
    assert np.array_equal(delay_pass(x, SR, from_engine), x)


def test_echo_neutral_is_bit_exact():
    x = _noise().astype(np.float32)
    assert echo_is_neutral(EchoParams())
    assert EchoParams().is_neutral()
    assert np.array_equal(echo_pass(x, SR), x)
    # mix == 0 is neutral even with feedback at its ceiling.
    assert np.array_equal(
        echo_pass(x, SR, EchoParams(time_ms=1800.0, mix=0.0, feedback=0.9)), x
    )
    from_engine = _echo_params_from_mastering(MasteringParameters(echo_enabled=True))
    assert from_engine.is_neutral()
    assert np.array_equal(echo_pass(x, SR, from_engine), x)


def test_reverb_neutral_is_bit_exact():
    x = _noise().astype(np.float32)
    assert reverb_is_neutral(ReverbParams())
    assert ReverbParams().is_neutral()
    assert np.array_equal(reverb_pass(x, SR), x)
    # mix == 0 is neutral even with the room size at its maximum.
    assert np.array_equal(reverb_pass(x, SR, ReverbParams(mix=0.0, size=1.0)), x)
    from_engine = _reverb_params_from_mastering(
        MasteringParameters(reverb_enabled=True)
    )
    assert from_engine.is_neutral()
    assert np.array_equal(reverb_pass(x, SR, from_engine), x)


# ── Engaged stages change the audio ─────────────────────────────────────


def test_delay_engaged_changes_output():
    x = _noise()
    out = delay_pass(x, SR, DelayParams(time_ms=250.0, mix=0.5, feedback=0.3))
    assert not np.array_equal(out, x)
    assert out.shape == x.shape
    assert np.all(np.isfinite(out))


def test_echo_engaged_changes_output():
    x = _noise()
    out = echo_pass(x, SR, EchoParams(time_ms=400.0, mix=0.5, feedback=0.5))
    assert not np.array_equal(out, x)
    assert out.shape == x.shape
    assert np.all(np.isfinite(out))


def test_reverb_engaged_changes_output():
    x = _noise()
    out = reverb_pass(x, SR, ReverbParams(mix=0.5, size=0.8))
    assert not np.array_equal(out, x)
    assert out.shape == x.shape
    assert np.all(np.isfinite(out))


# ── Mono (1-D) and stereo (channels, samples) ──────────────────────────


def test_mono_and_stereo_all_modules():
    engaged = {
        "delay": (DelayParams(time_ms=250.0, mix=0.5, feedback=0.3), delay_pass),
        "echo": (EchoParams(time_ms=400.0, mix=0.5, feedback=0.5), echo_pass),
        "reverb": (ReverbParams(mix=0.5, size=0.8), reverb_pass),
    }
    for name, (params, fn) in engaged.items():
        mono = _noise()
        out_mono = fn(mono, SR, params)
        assert out_mono.shape == mono.shape, name
        assert out_mono.ndim == 1, name
        assert np.all(np.isfinite(out_mono)), name

        stereo = np.stack([mono, _noise(seed=1)])
        out_st = fn(stereo, SR, params)
        assert out_st.shape == stereo.shape, name
        assert out_st.ndim == 2, name
        assert np.all(np.isfinite(out_st)), name

        # Identical stereo channels must stay identical (per-channel lines
        # initialize identically), like the tape module.
        out_same = fn(np.stack([mono, mono]), SR, params)
        assert np.array_equal(out_same[0], out_same[1]), name


# ── API robustness ──────────────────────────────────────────────────────


def test_empty_inputs():
    assert delay_pass(np.zeros((2, 0)), SR).shape == (2, 0)
    assert echo_pass(np.zeros((2, 0)), SR).shape == (2, 0)
    assert reverb_pass(np.zeros((2, 0)), SR).shape == (2, 0)
    assert delay_pass(np.zeros(0), SR).shape == (0,)
    assert echo_pass(np.zeros(0), SR).shape == (0,)
    assert reverb_pass(np.zeros(0), SR).shape == (0,)


def test_shape_and_dtype_preserved():
    x = np.stack([_noise(), _noise(seed=1)]).astype(np.float32)
    x /= np.max(np.abs(x))
    engaged = {
        "delay": (DelayParams(time_ms=250.0, mix=0.5), delay_pass),
        "echo": (EchoParams(time_ms=400.0, mix=0.5), echo_pass),
        "reverb": (ReverbParams(mix=0.5, size=0.8), reverb_pass),
    }
    for name, (params, fn) in engaged.items():
        out = fn(x, SR, params)
        assert out.shape == x.shape, name
        assert out.dtype == x.dtype, name
        assert np.all(np.isfinite(out)), name


def test_invalid_params_raise():
    # Delay ranges: time_ms [20, 2000], mix [0, 1], feedback [0, 0.8].
    with pytest.raises(ValueError):
        Delay(SR, DelayParams(time_ms=10.0))
    with pytest.raises(ValueError):
        Delay(SR, DelayParams(time_ms=2500.0))
    with pytest.raises(ValueError):
        Delay(SR, DelayParams(mix=-0.1))
    with pytest.raises(ValueError):
        Delay(SR, DelayParams(mix=1.1))
    with pytest.raises(ValueError):
        Delay(SR, DelayParams(feedback=0.9))
    with pytest.raises(ValueError):
        Delay(SR, DelayParams(time_ms=float("nan")))
    with pytest.raises(ValueError):
        Delay(SR, DelayParams(time_ms=float("inf")))

    # Echo ranges: time_ms [50, 2000], mix [0, 1], feedback [0, 0.9].
    with pytest.raises(ValueError):
        Echo(SR, EchoParams(time_ms=40.0))
    with pytest.raises(ValueError):
        Echo(SR, EchoParams(time_ms=2500.0))
    with pytest.raises(ValueError):
        Echo(SR, EchoParams(mix=-0.1))
    with pytest.raises(ValueError):
        Echo(SR, EchoParams(mix=1.1))
    with pytest.raises(ValueError):
        Echo(SR, EchoParams(feedback=0.95))

    # Reverb ranges: mix [0, 1], size [0.1, 1.0].
    with pytest.raises(ValueError):
        Reverb(SR, ReverbParams(mix=-0.1))
    with pytest.raises(ValueError):
        Reverb(SR, ReverbParams(mix=1.1))
    with pytest.raises(ValueError):
        Reverb(SR, ReverbParams(size=0.05))
    with pytest.raises(ValueError):
        Reverb(SR, ReverbParams(size=1.5))
    with pytest.raises(ValueError):
        Reverb(SR, ReverbParams(size=float("nan")))


def test_deterministic_across_runs():
    x = _noise()
    assert np.array_equal(
        delay_pass(x, SR, DelayParams(mix=0.5, feedback=0.6)),
        delay_pass(x, SR, DelayParams(mix=0.5, feedback=0.6)),
    )
    assert np.array_equal(
        echo_pass(x, SR, EchoParams(mix=0.5, feedback=0.6)),
        echo_pass(x, SR, EchoParams(mix=0.5, feedback=0.6)),
    )
    assert np.array_equal(
        reverb_pass(x, SR, ReverbParams(mix=0.5, size=0.9)),
        reverb_pass(x, SR, ReverbParams(mix=0.5, size=0.9)),
    )


# ── Engine mapping helpers + model defaults ─────────────────────────────


def test_mapping_helpers_build_module_params():
    p = MasteringParameters(
        delay_enabled=True, delay_time_ms=250.0, delay_mix=0.35, delay_feedback=0.5,
    )
    dp = _delay_params_from_mastering(p)
    assert dp == DelayParams(time_ms=250.0, mix=0.35, feedback=0.5)
    assert not dp.is_neutral()

    ep = _echo_params_from_mastering(
        MasteringParameters(
            echo_enabled=True, echo_time_ms=400.0, echo_mix=0.6, echo_feedback=0.7,
        )
    )
    assert ep == EchoParams(time_ms=400.0, mix=0.6, feedback=0.7)
    assert not ep.is_neutral()

    rp = _reverb_params_from_mastering(
        MasteringParameters(reverb_enabled=True, reverb_mix=0.4, reverb_size=0.9)
    )
    assert rp == ReverbParams(mix=0.4, size=0.9)
    assert not rp.is_neutral()


def test_new_model_fields_are_neutral_defaults():
    p = MasteringParameters()
    assert p.delay_enabled is False
    assert p.delay_time_ms == 250.0
    assert p.delay_mix == 0.0
    assert p.delay_feedback == 0.0
    assert p.echo_enabled is False
    assert p.echo_time_ms == 400.0
    assert p.echo_mix == 0.0
    assert p.echo_feedback == 0.0
    assert p.reverb_enabled is False
    assert p.reverb_mix == 0.0
    assert p.reverb_size == 0.5


# ── Engine integration (bit-exact fast-path / neutral / engaged) ────────


def _write_stereo_wav(path, sr=44100, duration=0.5, seed=0):
    rng = np.random.default_rng(seed)
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)
    noise = rng.standard_normal(int(sr * duration))
    left = 0.4 * np.sin(2 * np.pi * 440 * t) + 0.1 * noise
    right = 0.4 * np.sin(2 * np.pi * 660 * t) + 0.1 * noise
    x = np.stack([left, right])
    # 32-bit float WAV — the neutral fast-path writes the same format, so
    # the roundtrip is lossless and the bypass can be asserted bit-exactly.
    sf.write(str(path), x.T, sr, subtype="FLOAT")
    return x


def _write_mono_wav(path, sr=44100, duration=0.5):
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)
    mono = 0.4 * np.sin(2 * np.pi * 440 * t)
    sf.write(str(path), mono, sr, subtype="FLOAT")
    return mono


def _read_wav(path):
    arr, sr = sf.read(str(path), always_2d=True)
    return arr.T, sr


def test_engine_global_neutrality_preserved(tmp_path):
    """MasteringParameters() with the new fields still at their neutral
    defaults must remain a bit-exact bypass (global fast-path intact)."""
    in_path = tmp_path / "in.wav"
    out_path = tmp_path / "out.wav"
    _write_stereo_wav(in_path)

    process_audio(in_path, out_path, MasteringParameters())

    in_arr, _ = _read_wav(in_path)
    out_arr, _ = _read_wav(out_path)
    np.testing.assert_array_equal(in_arr, out_arr)


def test_engine_enabled_neutral_stage_is_noop(tmp_path):
    """delay_enabled=True with mix 0.0 must contribute NOTHING to the
    master: wildly different time/feedback on the same neutral mix produce
    bit-identical masters (the stage is skipped via is_neutral)."""
    in_path = tmp_path / "in.wav"
    _write_stereo_wav(in_path)
    out_a = tmp_path / "out_a.wav"
    out_b = tmp_path / "out_b.wav"

    process_audio(in_path, out_a, MasteringParameters(delay_enabled=True))
    process_audio(
        in_path, out_b,
        MasteringParameters(
            delay_enabled=True, delay_time_ms=750.0, delay_feedback=0.8,
        ),
    )

    a_arr, _ = _read_wav(out_a)
    b_arr, _ = _read_wav(out_b)
    np.testing.assert_array_equal(a_arr, b_arr)


def test_engine_engaged_effects_change_master(tmp_path):
    """Each engaged stage (mix > 0) must change the master relative to the
    same chain with the stage in its neutral (mix 0) configuration."""
    in_path = tmp_path / "in.wav"
    _write_stereo_wav(in_path)
    base = tmp_path / "base.wav"
    process_audio(in_path, base, MasteringParameters(delay_enabled=True))
    base_arr, _ = _read_wav(base)

    cases = {
        "delay": MasteringParameters(
            delay_enabled=True, delay_time_ms=250.0, delay_mix=0.5,
        ),
        "echo": MasteringParameters(
            delay_enabled=True, echo_enabled=True,
            echo_time_ms=400.0, echo_mix=0.5, echo_feedback=0.4,
        ),
        "reverb": MasteringParameters(
            delay_enabled=True, reverb_enabled=True,
            reverb_mix=0.5, reverb_size=0.8,
        ),
    }
    for name, params in cases.items():
        out_path = tmp_path / f"{name}.wav"
        process_audio(in_path, out_path, params)
        out_arr, _ = _read_wav(out_path)
        assert not np.array_equal(base_arr, out_arr), f"{name} must change master"
        assert np.all(np.isfinite(out_arr)), name


def test_engine_all_three_mono_and_stereo(tmp_path):
    """All three stages engaged at once, on a stereo AND a mono master: the
    pipeline completes, the output is finite and keeps the channel count."""
    engaged = MasteringParameters(
        delay_enabled=True, delay_time_ms=250.0, delay_mix=0.5, delay_feedback=0.3,
        echo_enabled=True, echo_time_ms=400.0, echo_mix=0.5, echo_feedback=0.4,
        reverb_enabled=True, reverb_mix=0.5, reverb_size=0.8,
    )

    stereo_in = tmp_path / "in_st.wav"
    _write_stereo_wav(stereo_in)
    stereo_out = tmp_path / "out_st.wav"
    stereo_res = process_audio(stereo_in, stereo_out, engaged)
    st_arr, _ = _read_wav(stereo_out)
    assert st_arr.shape[1] > 0
    assert np.all(np.isfinite(st_arr))
    assert stereo_res["channels"] == 2

    mono_in = tmp_path / "in_mono.wav"
    _write_mono_wav(mono_in)
    mono_out = tmp_path / "out_mono.wav"
    mono_res = process_audio(mono_in, mono_out, engaged)
    mo_arr, _ = _read_wav(mono_out)
    assert mo_arr.shape[1] > 0
    assert np.all(np.isfinite(mo_arr))
    # Pre-existing engine behavior: the spatial block (clarity_wet default
    # 0.15 > 0) upmixes mono to stereo via mid_side_decode on the FULL
    # pipeline, so the channel count is not asserted here (mirrors
    # test_mono_does_not_crash_with_spatial_block_active).
    assert mono_res["channels"] >= 1