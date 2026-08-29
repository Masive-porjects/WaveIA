"""Pre-generate mastered WAVs for the hackathon demo.

For each of the 8 frontend Macro-Character presets, run the full DSP
pipeline once and cache the result in ``settings.prebuilt_dir`` as
``{track_stem}_{preset_id}.wav``. The ``process_session`` endpoint then
serves these cached masters instantly (~1s) instead of re-running DSP
(~44s per 3-min track).

The preset params below mirror ``frontend/src/components/ModulePanel.tsx``
exactly so a click on a preset card returns the same master as a full
live run.

Usage:
    python scripts/generate_prebuilt.py path/to/track.wav [--presets fuego,claridad]
    python scripts/generate_prebuilt.py --all path/to/tracks/
"""

import argparse
import sys
from pathlib import Path

# Ensure backend/ is on sys.path so audiomind.config resolves
_HERE = Path(__file__).resolve().parent
_BACKEND = _HERE.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

# Windows console may default to cp1252 — force UTF-8 for progress output
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except (AttributeError, ValueError):
    pass

from audiomind.config import settings  # noqa: E402
from audiomind.models.audio import MasteringParameters  # noqa: E402
from audiomind.processing.engine import process_audio  # noqa: E402


def _params(**overrides) -> MasteringParameters:
    """Base transparent master + per-preset overrides (mirrors ModulePanel)."""
    base = MasteringParameters()
    return base.model_copy(update=overrides)


# Preset id -> MasteringParameters, mirroring frontend ModulePanel.tsx
PRESET_PARAMS: dict[str, MasteringParameters] = {
    "universal": _params(),
    "fuego": _params(
        compression_ratio=5.0,
        transient_boost_db=3.0,
        saturation_drive_db=2.0,
        saturation_warmth_db=0.5,
        limiter_ceiling_db=-0.3,
        stereo_width=1.0,
        haas_delay_ms=0.0,
    ),
    "claridad": _params(
        clarity_wet=0.35,
        clarity_brightness_db=4.0,
        compression_ratio=2.0,
        transient_boost_db=2.0,
        stereo_width=1.3,
        haas_delay_ms=6.0,
    ),
    "cinta": _params(
        saturation_drive_db=3.0,
        saturation_warmth_db=4.0,
        compression_ratio=2.0,
        limiter_ceiling_db=-1.5,
        clarity_brightness_db=-0.5,
        transient_boost_db=0.5,
        stereo_width=1.0,
    ),
    "natural": _params(
        compression_ratio=1.5,
        limiter_ceiling_db=-2.0,
        clarity_wet=0.05,
        clarity_brightness_db=0.5,
        saturation_drive_db=0.3,
        saturation_warmth_db=0.5,
        transient_boost_db=0.5,
        stereo_width=1.0,
        haas_delay_ms=0.0,
    ),
    "espacial": _params(
        stereo_width=1.8,
        haas_delay_ms=15.0,
        clarity_brightness_db=2.0,
        clarity_wet=0.3,
        compression_ratio=2.0,
    ),
    "cinematico": _params(
        stereo_width=1.6,
        haas_delay_ms=12.0,
        clarity_brightness_db=2.5,
        clarity_wet=0.3,
        saturation_warmth_db=2.5,
        saturation_drive_db=2.0,
        compression_ratio=2.5,
        transient_boost_db=2.5,
    ),
    "empuje": _params(
        compression_ratio=8.0,
        limiter_ceiling_db=-0.1,
        transient_boost_db=4.0,
        saturation_drive_db=4.0,
        clarity_brightness_db=1.0,
        stereo_width=1.0,
        haas_delay_ms=0.0,
    ),
}


def _progress(label: str, pct: float) -> None:
    print(f"\r  {label} — {pct * 100:.0f}%", end="", flush=True)


def generate_for_track(track: Path, presets: list[str] | None = None) -> list[Path]:
    """Generate pre-built masters for one track. Returns written paths."""
    track = Path(track).resolve()
    if not track.exists():
        raise FileNotFoundError(f"Track not found: {track}")

    presets = presets or list(PRESET_PARAMS)
    written: list[Path] = []
    settings.prebuilt_dir.mkdir(parents=True, exist_ok=True)

    for preset_id in presets:
        params = PRESET_PARAMS.get(preset_id)
        if params is None:
            print(f"  SKIP {preset_id} — unknown preset")
            continue

        out_path = settings.prebuilt_dir / f"{track.stem}_{preset_id}.wav"
        if out_path.exists() and out_path.stat().st_size > 0:
            print(f"  OK {out_path.name} — cached, skipping")
            written.append(out_path)
            continue

        print(f"  > {preset_id}: {out_path.name}")
        try:
            process_audio(
                input_path=track,
                output_path=out_path,
                params=params,
                analysis_result=None,
                progress_cb=lambda p, label=preset_id: _progress(label, p),
            )
        except Exception as e:
            print(f"\n  FAIL {preset_id}: {e}")
            if out_path.exists():
                out_path.unlink()  # never leave a partial master behind
            continue
        print(f"\r  OK {out_path.name} — {out_path.stat().st_size / 1_000_000:.1f} MB")
        written.append(out_path)

    return written


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("tracks", nargs="+", help="Track WAV(s), or --all DIR")
    parser.add_argument(
        "--presets",
        default="",
        help="Comma-separated preset ids (default: all 8)",
    )
    parser.add_argument(
        "--all",
        metavar="DIR",
        help="Generate for every *.wav in DIR",
    )
    args = parser.parse_args()

    presets = [p.strip() for p in args.presets.split(",") if p.strip()] or None

    tracks: list[Path] = []
    if args.all:
        tracks = sorted(Path(args.all).glob("*.wav"))
    else:
        tracks = [Path(t) for t in args.tracks]

    if not tracks:
        print("No tracks to process.")
        return 1

    print(f"Pre-built dir: {settings.prebuilt_dir}")
    for track in tracks:
        print(f"\n== {track.name} ==")
        generate_for_track(track, presets)

    print(f"\nDone. Pre-built masters in {settings.prebuilt_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
