"""Smoke test for the dynamic proportional mastering pipeline."""
import sys
sys.path.insert(0, "src")

import numpy as np
import soundfile as sf
from audiomind.processing.engine import (
    gain_stage, analyze_band_energy, calculate_proportional_gain,
    _build_dynamic_eq_fallback, build_proportional_compressor, target_lufs,
    process_audio, _adjust_for_already_mastered,
)
from audiomind.processing.presets import get_preset, list_presets
from audiomind.models.audio import MasteringParameters, AnalysisResult
from audiomind.processing.spatial import mid_side_encode


def test_gain_stage():
    audio = np.random.randn(2, 44100) * 0.1
    normed, gain_db = gain_stage(audio)
    peak = np.max(np.abs(normed))
    peak_db = 20 * np.log10(peak)
    assert abs(peak_db - (-6.0)) < 0.1, f"Expected -6 dBFS, got {peak_db:.1f}"
    print(f"  gain_stage OK: peak at {peak_db:.1f} dBFS")


def test_gain_stage_silent():
    audio = np.zeros((2, 44100))
    normed, gain_db = gain_stage(audio)
    assert gain_db == 0.0
    print("  gain_stage silent OK")


def test_analyze_band_energy():
    sr = 44100
    t = np.linspace(0, 1, sr, endpoint=False)
    # Pure 1kHz sine — should show high energy at 1k, low elsewhere
    audio = np.array([np.sin(2 * np.pi * 1000 * t), np.sin(2 * np.pi * 1000 * t)])
    e_mid = analyze_band_energy(audio, sr, 1000)
    e_low = analyze_band_energy(audio, sr, 80)
    e_high = analyze_band_energy(audio, sr, 12000)
    assert e_mid > e_low, f"1k energy ({e_mid:.2f}) should exceed 80Hz ({e_low:.2f})"
    assert e_mid > e_high, f"1k energy ({e_mid:.2f}) should exceed 12k ({e_high:.2f})"
    print(f"  band_energy OK: 80Hz={e_low:.2f} 1kHz={e_mid:.2f} 12kHz={e_high:.2f}")


def test_calculate_proportional_gain():
    # Weak band → should get most of the target
    g_weak = calculate_proportional_gain(6.0, 0.1)
    # Strong band → should get little
    g_strong = calculate_proportional_gain(6.0, 0.9)
    assert g_weak > g_strong, f"Weak ({g_weak:.1f}) should > strong ({g_strong:.1f})"
    assert g_weak <= 6.0, "Should not exceed target"
    assert g_strong >= 0.15 * 6.0, "Should have minimum scaling"
    print(f"  proportional_gain OK: weak={g_weak:.1f}dB strong={g_strong:.1f}dB")


def test_build_dynamic_eq():
    sr = 44100
    audio = np.random.randn(2, sr) * 0.3
    preset = get_preset("empuje")
    plugins = _build_dynamic_eq_fallback(audio, sr, preset["eq_bands"])
    assert len(plugins) > 0, "Should create EQ plugins"
    for p in plugins:
        assert abs(p.gain_db) <= abs(preset["eq_bands"][0]["max_gain_db"]) + 0.1
    print(f"  dynamic_eq OK: {len(plugins)} filters")


def test_build_proportional_compressor():
    sr = 44100
    audio = np.random.randn(2, sr) * 0.3
    preset = get_preset("empuje")
    plugins = build_proportional_compressor(audio, sr, preset)
    assert len(plugins) == 1
    c = plugins[0]
    assert c.ratio == 6.0
    assert -30 <= c.threshold_db <= -4
    print(f"  proportional_compressor OK: threshold={c.threshold_db:.1f} ratio={c.ratio}")


def test_target_lufs():
    sr = 44100
    audio = np.random.randn(2, sr) * 0.1
    result = target_lufs(audio, sr, -14.0)
    assert result.shape == audio.shape
    print("  target_lufs OK")


def test_already_mastered_adjustment():
    preset = get_preset("empuje")
    ar = AnalysisResult(
        integrated_lufs=-8.0, true_peak_db=-0.5, dynamic_range_db=6.0,
        spectral_centroid=3000, tempo_bpm=120, duration_seconds=180,
        sample_rate=44100, channels=2, is_already_mastered=True,
    )
    adj = _adjust_for_already_mastered(preset, ar)
    assert adj["compressor"]["ratio"] == preset["compressor"]["ratio"] * 0.8
    assert adj["saturation"]["drive_max"] == preset["saturation"]["drive_max"] * 0.8
    for band in adj["eq_bands"]:
        orig = next(b for b in preset["eq_bands"] if b["freq"] == band["freq"])
        assert abs(band["max_gain_db"] - orig["max_gain_db"] * 0.8) < 0.01
    print("  already_mastered adjustment OK")


def test_already_mastered_noop():
    preset = get_preset("empuje")
    adj = _adjust_for_already_mastered(preset, None)
    assert adj == preset
    print("  already_mastered noop OK")


def test_presets_structure():
    presets = list_presets()
    assert len(presets) == 8
    for p in presets:
        assert "name" in p
        assert "display_name" in p
        assert "style" in p
        assert "description" in p
        assert "target_genres" in p
    # Verify internal structure
    full = get_preset("universal")
    assert "eq_bands" in full
    assert "compressor" in full
    assert "ratio" in full["compressor"]
    assert "target_lufs" in full
    assert "limiter_ceiling_db" in full
    print("  presets structure OK")


def _write_stereo_wav(path, sr=44100, duration=0.5, seed=0):
    rng = np.random.default_rng(seed)
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)
    noise = rng.standard_normal(int(sr * duration))
    left = 0.4 * np.sin(2 * np.pi * 440 * t) + 0.1 * noise
    right = 0.4 * np.sin(2 * np.pi * 660 * t) + 0.1 * noise
    x = np.stack([left, right])
    # 32-bit float WAV — the neutral fast-path writes the same format, so the
    # roundtrip is lossless and the bypass can be asserted bit-exactly.
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


def test_neutral_defaults_are_bit_exact_bypass(tmp_path):
    """MasteringParameters() with all default values must be a bit-exact bypass:
    the delivered master is byte-identical (sample-identical) to the input."""
    in_path = tmp_path / "in.wav"
    out_path = tmp_path / "out.wav"
    _write_stereo_wav(in_path)

    result = process_audio(in_path, out_path, MasteringParameters())

    in_arr, in_sr = _read_wav(in_path)
    out_arr, out_sr = _read_wav(out_path)
    assert in_sr == out_sr
    assert in_arr.shape == out_arr.shape
    msg = "neutral defaults must be bit-exact"
    np.testing.assert_array_equal(in_arr, out_arr, err_msg=msg)

    # The delivered audio is byte-identical: hash of the sample data matches.
    # (We hash the PCM sample bytes, not the raw container — libsndfile may
    # emit different WAV header bytes depending on process state, but the audio
    # samples themselves are proven identical above and by these hashes.)
    import hashlib
    h_in = hashlib.sha256(np.ascontiguousarray(in_arr).tobytes()).hexdigest()
    h_out = hashlib.sha256(np.ascontiguousarray(out_arr).tobytes()).hexdigest()
    assert h_in == h_out

    # Response keeps the normal shape/keys.
    for key in ("output_path", "sample_rate", "channels", "duration_seconds",
                "true_peak_db", "integrated_lufs", "crest_factor_db",
                "limiter_ceiling_db", "output_bit_depth", "codec_pre_matching"):
        assert key in result


def test_neutral_mono_defaults_are_bit_exact_bypass(tmp_path):
    """Same bit-exact bypass for a MONO input with default params."""
    in_path = tmp_path / "in_mono.wav"
    out_path = tmp_path / "out_mono.wav"
    _write_mono_wav(in_path)

    result = process_audio(in_path, out_path, MasteringParameters())

    in_arr, in_sr = _read_wav(in_path)
    out_arr, out_sr = _read_wav(out_path)
    assert in_sr == out_sr
    assert in_arr.shape == out_arr.shape
    np.testing.assert_array_equal(in_arr, out_arr)
    assert result["channels"] == 1


def test_mono_does_not_crash_with_spatial_block_active(tmp_path):
    """A mono WAV with the Claridad spatial block active (clarity_wet > 0) must
    complete without IndexError and produce a valid master."""
    in_path = tmp_path / "in_mono.wav"
    out_path = tmp_path / "out_mono.wav"
    _write_mono_wav(in_path)

    result = process_audio(
        in_path, out_path, MasteringParameters(clarity_wet=0.5)
    )

    out_arr, out_sr = _read_wav(out_path)
    assert out_sr > 0
    assert out_arr.shape[0] > 0
    assert np.all(np.isfinite(out_arr))
    assert np.isfinite(result["true_peak_db"])
    assert np.isfinite(result["integrated_lufs"])


def test_mid_side_encode_handles_mono():
    """mid_side_encode must accept mono (1, samples) — upmix so side == 0."""
    t = np.linspace(0, 0.5, 22050, endpoint=False)
    mono = 0.4 * np.sin(2 * np.pi * 440 * t)
    mid, side = mid_side_encode(mono.reshape(1, -1))
    np.testing.assert_allclose(mid, mono * np.sqrt(2), atol=1e-10)
    np.testing.assert_allclose(side, 0.0, atol=1e-12)
    assert mid.shape == mono.shape


if __name__ == "__main__":
    print("=== Smoke Tests ===")
    test_gain_stage()
    test_gain_stage_silent()
    test_analyze_band_energy()
    test_calculate_proportional_gain()
    test_build_dynamic_eq()
    test_build_proportional_compressor()
    test_target_lufs()
    test_already_mastered_adjustment()
    test_already_mastered_noop()
    test_presets_structure()
    print("\nAll checks passed!")
