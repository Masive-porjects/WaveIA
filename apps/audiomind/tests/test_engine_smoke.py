"""Smoke test for the dynamic proportional mastering pipeline."""
import sys
sys.path.insert(0, "src")

import numpy as np
from audiomind.processing.engine import (
    gain_stage, analyze_band_energy, calculate_proportional_gain,
    _build_dynamic_eq_fallback, build_proportional_compressor, target_lufs,
    process_audio, _adjust_for_already_mastered,
)
from audiomind.processing.presets import get_preset, list_presets
from audiomind.models.audio import MasteringParameters, AnalysisResult


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
