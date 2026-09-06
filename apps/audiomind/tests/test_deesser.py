"""Objective tests for the dynamic de-esser (Phase B — B2).

Covers: bit-exact neutral bypass (``amount_db == 0`` and the engine gate
off), the below-threshold short-circuit (clean material passes through
bit-exactly even with the stage engaged), the sibilance-ratio detector, the
two-condition detection gate (audibility floor + transient spike over the
rolling reference — a permanently bright program is NOT dulled), the linear
cut-only gain computer, joint stereo detection, API robustness
(mono/empty/dtype/finite/deterministic), parameter validation, and engine
integration (neutral toggle bit-exact; engaged changes the master only when
sibilance is present).

Imports only numpy/scipy plus the pure-DSP ``deesser`` at module level —
never the pedalboard-backed engine — so the unit tests run on any machine
(mirrors ``test_adaptive_comp.py``); the engine integration tests import
``process_audio`` lazily.
"""
import sys

sys.path.insert(0, "src")

import numpy as np
import pytest
import soundfile as sf

from audiomind.processing.deesser import (
    DEESSER_BAND_HIGH_HZ,
    DEESSER_BAND_LOW_HZ,
    DEESSER_LEVEL_FLOOR_DB,
    DEESSER_RANGE_DB,
    DEESSER_THRESHOLD_DB,
    DEFAULT_AMOUNT_DB,
    Deesser,
    DeesserParams,
    deesser,
    deesser_gain,
    detection_gate,
)

SR = 44100


def _stereo(mono: np.ndarray) -> np.ndarray:
    return np.stack([mono, mono])


def _clean_program(dur_s: float = 1.2, sr: int = SR, seed: int = 0) -> np.ndarray:
    """Mono program OUTSIDE the 3-8 kHz sibilance band (250 Hz + 1 kHz + a
    little bed noise): the band stays near its noise floor, so the ratio
    detector never engages and an engaged de-esser is a bit-exact no-op."""
    n = int(sr * dur_s)
    t = np.arange(n) / sr
    rng = np.random.default_rng(seed)
    x = (
        0.05 * np.sin(2.0 * np.pi * 250.0 * t)
        + 0.05 * np.sin(2.0 * np.pi * 1000.0 * t)
        + 0.02 * rng.standard_normal(n)
    )
    return x.astype(np.float32)


def _sibilant_burst(
    dur_s: float = 1.2, burst_start_s: float = 0.5, burst_dur_s: float = 0.3,
    sib_amp: float = 0.5, sr: int = SR,
) -> np.ndarray:
    """Mono program with a 6 kHz ESS burst on top: the burst concentrates
    the frame energy into the sibilance band (ratio → ≈0 dB), so the
    detector engages ONLY while the burst is present."""
    x = _clean_program(dur_s=dur_s, sr=sr, seed=1)
    n = x.shape[0]
    t = np.arange(n) / sr
    lo, hi = int(burst_start_s * sr), int((burst_start_s + burst_dur_s) * sr)
    tb = t[lo:hi] - t[lo]
    x[lo:hi] = x[lo:hi] + sib_amp * np.sin(2.0 * np.pi * 6000.0 * tb)
    return x


def _engaged_params(amount_db: float = DEFAULT_AMOUNT_DB) -> DeesserParams:
    return DeesserParams(amount_db=amount_db)


# ── Neutral bypass ───────────────────────────────────────────────────


def test_neutral_default_is_bit_exact_bypass():
    rng = np.random.default_rng(0)
    x = (rng.standard_normal((2, int(SR * 0.5))) * 0.3).astype(np.float32)
    neutral = DeesserParams(amount_db=0.0)
    assert np.array_equal(deesser(x, SR), x)  # wrapper: neutral by default
    assert np.array_equal(deesser(x, SR, neutral), x)
    assert np.array_equal(Deesser(SR, neutral).process(x), x)


def test_neutral_with_knobs_amount_zero_is_bit_exact():
    # amount_db == 0 is the neutral switch: even with aggressive detector
    # and timing knobs the stage must remain a bit-exact no-op.
    rng = np.random.default_rng(1)
    x = (rng.standard_normal((2, int(SR * 0.5))) * 0.3).astype(np.float32)
    p = DeesserParams(
        amount_db=0.0,
        threshold_db=DEESSER_THRESHOLD_DB + 6.0,
        attack_ms=1.0,
        release_ms=200.0,
    )
    assert np.array_equal(Deesser(SR, p).process(x), x)


def test_is_neutral_semantics():
    assert DeesserParams(amount_db=0.0).is_neutral()
    assert not DeesserParams().is_neutral()  # typical configured amount ≠ neutral


# ── Gain computer (linear cut-only ramp) ─────────────────────────────


def test_gain_computer_exact_linear_ramp():
    thr = DEESSER_THRESHOLD_DB
    amount = DEFAULT_AMOUNT_DB
    sib = np.linspace(thr - 40.0, thr + DEESSER_RANGE_DB + 40.0, 2001)
    g = deesser_gain(sib, thr, amount)

    # Below threshold: exactly 0 dB (bit-exact no-op on clean material).
    below = sib < thr
    assert np.array_equal(g[below], np.zeros_like(g[below]))
    # Above threshold + range: exactly the full cut (clipped, no boost).
    above = sib > thr + DEESSER_RANGE_DB
    assert np.array_equal(g[above], np.full_like(g[above], -amount))
    # In between: the exact linear ramp -amount * (excess / range).
    ramp = (sib >= thr) & (sib <= thr + DEESSER_RANGE_DB)
    expected = -amount * (sib[ramp] - thr) / DEESSER_RANGE_DB
    assert np.allclose(g[ramp], expected, atol=1e-12)
    # Cuts only, never positive.
    assert np.all(g <= 1e-12)


def test_gain_computer_gate_mask_and_cuts_only():
    thr, amount = -4.0, 6.0
    sib = np.linspace(thr, thr + 20.0, 8)
    gate = np.array([0.0, 1.0, 0.0, 1.0, 0.0, 1.0, 0.0, 1.0])
    g = deesser_gain(sib, thr, amount, gate)
    assert np.array_equal(g[gate == 0.0], np.zeros_like(g[gate == 0.0]))
    assert np.all(g <= 1e-12)
    # With the gate fully open the mask is a no-op (identical to ungated).
    assert np.array_equal(
        deesser_gain(sib, thr, amount, np.ones_like(gate)),
        deesser_gain(sib, thr, amount),
    )


# ── Detection gate (audibility floor + transient spike) ──────────────


def test_detection_gate_empty_and_silent():
    assert detection_gate(np.zeros(0), SR).shape == (0,)
    silent = np.full(int(SR * 0.5), DEESSER_LEVEL_FLOOR_DB - 20.0)
    assert np.all(detection_gate(silent, SR) == 0.0)  # silence never pumps


def test_detection_gate_transient_spike_then_reference_closes():
    n = int(SR * 3.0)
    band_db = np.full(n, -80.0)
    band_db[int(SR * 1.0):] = -30.0  # audible plateau from 1 s (spike over ref)
    gate = detection_gate(band_db, SR)

    # Silence before the spike: below the -55 dBFS floor, gate closed.
    assert np.all(gate[: int(SR * 0.8)] == 0.0)
    # Early plateau: band way above its rolling reference → gate open.
    assert np.all(gate[int(SR * 1.2): int(SR * 2.0)] == 1.0)
    # Late plateau: the 500 ms reference caught up — a permanently bright
    # band is NOT sibilance (transient events only).
    assert np.all(gate[int(SR * 2.5):] == 0.0)


# ── Reduction only when sibilance exists ─────────────────────────────


def test_below_threshold_is_bit_exact_noop():
    # The core contract: an ENGAGED de-esser (amount > 0) on material whose
    # band never crosses the detector threshold is STILL a bit-exact no-op
    # (deesser_gain stays at exactly 0 dB → the stage short-circuits).
    x = _stereo(_clean_program())
    out = Deesser(SR, _engaged_params()).process(x)
    assert np.array_equal(out, x)


def test_sibilant_burst_reduced_clean_half_untouched():
    x = _stereo(_sibilant_burst())
    de = Deesser(SR, _engaged_params())
    out, diag = de.process_with_diagnostics(x)

    onset, end = int(0.5 * SR), int(0.8 * SR)
    gr_burst = float(np.mean(diag["gr_db"][onset:end]))
    assert gr_burst < -1.5, f"burst must be reduced, got GR {gr_burst:.2f} dB"
    # The clean half is untouched bit-exactly even though the stage engaged
    # elsewhere (g_lin == 1.0 exactly where GR == 0).
    assert np.array_equal(out[:, :onset], x[:, :onset])
    assert not np.array_equal(out, x)


def test_sibilance_detector_rises_during_burst():
    x = _stereo(_sibilant_burst())
    _, diag = Deesser(SR, _engaged_params()).process_with_diagnostics(x)
    onset, end = int(0.5 * SR), int(0.8 * SR)
    clean_mean = float(np.mean(diag["sibilance_db"][: int(0.4 * SR)]))
    burst_mean = float(np.mean(diag["sibilance_db"][onset:end]))
    assert burst_mean > clean_mean + 10.0, (
        f"detector must rise on sibilance (burst {burst_mean:.1f} dB > "
        f"clean {clean_mean:.1f} dB + 10)"
    )


def test_permanent_bright_program_is_not_dulled():
    # A band that sits PERMANENTLY at its own rolling reference (bright
    # pads, hats, sizzle) must NOT be dulled. The 500 ms reference climbs
    # WITH the onset (it starts above the band and only approaches it from
    # above, because the band's attack is far faster than the reference
    # tau), so the transient-spike gate never opens — the output stays
    # bit-identical to the input from the very first sample.
    x = _stereo(_tone_6k())
    de = Deesser(SR, _engaged_params())
    out, diag = de.process_with_diagnostics(x)
    assert np.array_equal(out, x)
    assert np.all(diag["gr_db"] == 0.0)  # reduction stays exactly 0 dB


def _tone_6k(dur_s: float = 2.5) -> np.ndarray:
    t = np.arange(int(SR * dur_s)) / SR
    return (0.5 * np.sin(2.0 * np.pi * 6000.0 * t)).astype(np.float32)


# ── Stereo: joint detection preserves the image ──────────────────────


def test_identical_channels_stay_identical():
    x = _stereo(_sibilant_burst())
    out = Deesser(SR, _engaged_params()).process(x)
    assert np.array_equal(out[0], out[1])  # identical channels stay identical


def test_joint_detector_engages_both_channels():
    # Sibilance in ONE channel only: the joint (L+R)/2 detector applies the
    # SAME gain trajectory to both channels, so the image is not torn.
    x = np.stack([_sibilant_burst(), _clean_program(seed=2)])
    de = Deesser(SR, _engaged_params())
    out, diag = de.process_with_diagnostics(x)

    onset, end = int(0.5 * SR), int(0.8 * SR)
    gr_burst = float(np.mean(diag["gr_db"][onset:end]))
    assert gr_burst < -1.0, f"joint detector must engage, got GR {gr_burst:.2f} dB"
    # Both channels were actually attenuated during the burst — even the
    # clean right channel, which carries the same joint gain trajectory.
    assert not np.array_equal(out[0][onset:end], x[0][onset:end])
    assert not np.array_equal(out[1][onset:end], x[1][onset:end])


# ── API robustness ───────────────────────────────────────────────────


def test_mono_shape_and_dtype_preserved():
    x = _sibilant_burst()  # float32 mono
    out = Deesser(SR, _engaged_params()).process(x)
    assert out.shape == x.shape
    assert out.dtype == x.dtype
    assert np.all(np.isfinite(out))


def test_stereo_shape_and_dtype_preserved():
    x = _stereo(_sibilant_burst())
    out = Deesser(SR, _engaged_params()).process(x)
    assert out.shape == x.shape
    assert out.dtype == x.dtype
    assert np.all(np.isfinite(out))


def test_empty_input():
    x = np.zeros((2, 0), dtype=np.float32)
    out = Deesser(SR, _engaged_params()).process(x)
    assert out.shape == x.shape


def test_outputs_are_finite():
    x = _stereo(_sibilant_burst())
    out = Deesser(SR, _engaged_params()).process(x)
    assert np.all(np.isfinite(out))


def test_deterministic():
    x = _stereo(_sibilant_burst())
    de = Deesser(SR, _engaged_params())
    assert np.array_equal(de.process(x), de.process(x))


# ── Parameter validation ─────────────────────────────────────────────


@pytest.mark.parametrize(
    "low,high",
    [
        (DEESSER_BAND_HIGH_HZ, DEESSER_BAND_LOW_HZ),  # low >= high
        (DEESSER_BAND_LOW_HZ, DEESSER_BAND_LOW_HZ),   # degenerate band
        (0.0, DEESSER_BAND_HIGH_HZ),                  # non-positive low
        (DEESSER_BAND_LOW_HZ, SR / 2.0),              # high >= nyquist
    ],
)
def test_invalid_band_edges_raise(low, high):
    with pytest.raises(ValueError):
        Deesser(SR, DeesserParams(band_low_hz=low, band_high_hz=high))


def test_valid_band_edges_and_anchor_defaults():
    de = Deesser(SR, DeesserParams())
    assert de.params.band_low_hz == DEESSER_BAND_LOW_HZ
    assert de.params.band_high_hz == DEESSER_BAND_HIGH_HZ
    assert de.params.amount_db == DEFAULT_AMOUNT_DB


def test_module_default_engaged_engine_default_neutral():
    """The ENGINE gate owns neutrality: MasteringParameters exposes
    deesser_enabled=False and deesser_amount_db=0.0 (neutral), while the
    module stage param defaults to the typical configured amount. The
    engine only calls the stage when BOTH the gate and a positive amount
    are set."""
    from audiomind.models.audio import MasteringParameters

    p = MasteringParameters()
    assert p.deesser_enabled is False
    assert p.deesser_amount_db == 0.0
    assert p.deesser_threshold_db == DEESSER_THRESHOLD_DB
    assert DeesserParams().amount_db == DEFAULT_AMOUNT_DB


# ── Engine integration (needs pedalboard) ────────────────────────────


def _write_wav(path, x: np.ndarray, sr: int = SR):
    sf.write(str(path), x.T, sr, subtype="FLOAT")


def _read_wav(path):
    arr, sr = sf.read(str(path), always_2d=True)
    return arr.T, sr


def _engine_program(sibilant: bool, dur_s: float = 1.2) -> np.ndarray:
    if sibilant:
        x = _sibilant_burst(dur_s=dur_s)
    else:
        x = _clean_program(dur_s=dur_s, seed=2)
    return _stereo(x)


def test_engine_global_neutrality_preserved(tmp_path):
    """MasteringParameters() with the new de-esser fields still at their
    neutral defaults must remain a bit-exact bypass (global fast-path)."""
    from audiomind.models.audio import MasteringParameters
    from audiomind.processing.engine import process_audio

    rng = np.random.default_rng(0)
    t = np.linspace(0, 0.5, int(SR * 0.5), endpoint=False)
    noise = rng.standard_normal(int(SR * 0.5))
    x = np.stack([
        0.4 * np.sin(2 * np.pi * 440 * t) + 0.1 * noise,
        0.4 * np.sin(2 * np.pi * 660 * t) + 0.1 * noise,
    ])
    in_path = tmp_path / "in.wav"
    out_path = tmp_path / "out.wav"
    _write_wav(in_path, x)

    process_audio(in_path, out_path, MasteringParameters())

    a, _ = _read_wav(in_path)
    b, _ = _read_wav(out_path)
    np.testing.assert_array_equal(a, b)


def test_engine_deesser_enabled_neutral_is_noop(tmp_path):
    """deesser_enabled=True with amount 0.0 must contribute NOTHING to the
    master: wildly different thresholds on the same neutral amount produce
    bit-identical masters (the stage is skipped via is_neutral)."""
    from audiomind.models.audio import MasteringParameters
    from audiomind.processing.engine import process_audio

    in_path = tmp_path / "in.wav"
    _write_wav(in_path, _engine_program(sibilant=True))
    base = MasteringParameters(target_lufs_db=-14.0)

    out_a = tmp_path / "out_a.wav"
    out_b = tmp_path / "out_b.wav"
    process_audio(in_path, out_a, base)
    process_audio(
        in_path, out_b,
        base.model_copy(
            update={"deesser_enabled": True, "deesser_threshold_db": -12.0}
        ),
    )

    a, _ = _read_wav(out_a)
    b, _ = _read_wav(out_b)
    np.testing.assert_array_equal(a, b)


def test_engine_deesser_below_threshold_is_bit_exact(tmp_path):
    """Engaged (amount > 0) but material below the detector threshold: the
    stage short-circuits and the master is bit-identical to the same chain
    with the de-esser off."""
    from audiomind.models.audio import MasteringParameters
    from audiomind.processing.engine import process_audio

    in_path = tmp_path / "in.wav"
    _write_wav(in_path, _engine_program(sibilant=False))  # no sibilance present
    base = MasteringParameters(target_lufs_db=-14.0)
    engaged = base.model_copy(
        update={"deesser_enabled": True, "deesser_amount_db": DEFAULT_AMOUNT_DB}
    )

    out_off = tmp_path / "out_off.wav"
    out_on = tmp_path / "out_on.wav"
    process_audio(in_path, out_off, base)
    process_audio(in_path, out_on, engaged)

    a, _ = _read_wav(out_off)
    b, _ = _read_wav(out_on)
    np.testing.assert_array_equal(a, b)


def test_engine_deesser_engaged_changes_master(tmp_path):
    """Engaged on a sibilant program: the master must differ from the same
    chain with the de-esser neutral."""
    from audiomind.models.audio import MasteringParameters
    from audiomind.processing.engine import process_audio

    in_path = tmp_path / "in.wav"
    _write_wav(in_path, _engine_program(sibilant=True))
    base = MasteringParameters(target_lufs_db=-14.0)
    engaged = base.model_copy(
        update={"deesser_enabled": True, "deesser_amount_db": DEFAULT_AMOUNT_DB}
    )

    out_off = tmp_path / "out_off.wav"
    out_on = tmp_path / "out_on.wav"
    m_off = process_audio(in_path, out_off, base)
    m_on = process_audio(in_path, out_on, engaged)

    a, _ = _read_wav(out_off)
    b, _ = _read_wav(out_on)
    assert not np.array_equal(a, b)
    assert np.isfinite(m_off["integrated_lufs"])
    assert np.isfinite(m_on["integrated_lufs"])
    assert np.isfinite(m_on["true_peak_db"])