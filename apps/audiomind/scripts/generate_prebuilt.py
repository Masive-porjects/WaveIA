"""Pre-generate mastered WAVs for the hackathon demo.

For each of the 8 backend Macro-Character presets (``PRESET_CHAINS``), run
the full DSP pipeline once and cache the result in ``settings.prebuilt_dir``
as ``{track_stem}_{preset_id}.wav``. The ``process_session`` endpoint then
serves these cached masters instantly (~1s) instead of re-running DSP
(~44s per 3-min track).

Preset DSP params come from ``audiomind.api.mastering._build_preset_params`` —
the SAME builder the live ``/process?preset_id=`` path uses — so a cached
prebuilt master matches a full live run. Outputs smaller than 1 KiB are
treated as broken artifacts (a mastered WAV is always larger) and deleted,
never counted as success.

Usage:
    python scripts/generate_prebuilt.py path/to/track.wav
        [--presets fuego,claridad] [--force]
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

from audiomind.api.mastering import _build_preset_params  # noqa: E402
from audiomind.config import settings  # noqa: E402
from audiomind.processing.engine import process_audio  # noqa: E402
from audiomind.processing.presets import PRESET_CHAINS  # noqa: E402

# A mastered WAV is always > 1 KiB; anything smaller is a broken artifact
# (e.g. a truncated write) and must never be left on disk or served.
_MIN_VALID_MASTER_BYTES = 1024


def _progress(label: str, pct: float) -> None:
    print(f"\r  {label} — {pct * 100:.0f}%", end="", flush=True)


def generate_for_track(
    track: Path, presets: list[str] | None = None, force: bool = False
) -> tuple[list[Path], list[str]]:
    """Generate pre-built masters for one track.

    Returns ``(written, failed)``: ``written`` lists every valid output
    path (freshly rendered or already-cached), ``failed`` lists every
    preset that ended WITHOUT a valid output (unknown id, DSP error, or
    broken artifact).
    """
    track = Path(track).resolve()
    if not track.exists():
        raise FileNotFoundError(f"Track not found: {track}")

    preset_ids = presets or list(PRESET_CHAINS)
    written: list[Path] = []
    failed: list[str] = []
    settings.prebuilt_dir.mkdir(parents=True, exist_ok=True)

    for preset_id in preset_ids:
        if preset_id not in PRESET_CHAINS:
            print(f"  SKIP {preset_id} — unknown preset")
            failed.append(preset_id)
            continue

        params = _build_preset_params(preset_id)
        out_path = settings.prebuilt_dir / f"{track.stem}_{preset_id}.wav"

        if (
            not force
            and out_path.exists()
            and out_path.stat().st_size >= _MIN_VALID_MASTER_BYTES
        ):
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
            failed.append(preset_id)
            continue

        size = out_path.stat().st_size if out_path.exists() else 0
        if size < _MIN_VALID_MASTER_BYTES:
            print(
                f"\n  FAIL {preset_id}: output {size} B < 1 KiB —"
                " broken artifact, removed"
            )
            out_path.unlink(missing_ok=True)
            failed.append(preset_id)
            continue

        print(
            f"\r  OK {out_path.name} — {out_path.stat().st_size / 1_000_000:.1f} MB"
        )
        written.append(out_path)

    return written, failed


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
    parser.add_argument(
        "--force",
        action="store_true",
        help="Regenerate existing outputs (default: skip valid cached files)",
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
    failed_total = 0
    for track in tracks:
        print(f"\n== {track.name} ==")
        _written, failed = generate_for_track(track, presets, force=args.force)
        failed_total += len(failed)

    if failed_total:
        print(f"\nFAILED: {failed_total} preset(s) produced no valid output.")
        return 1
    print(f"\nDone. Pre-built masters in {settings.prebuilt_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())