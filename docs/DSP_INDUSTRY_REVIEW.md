# DSP Industry Review — Mastering Chain vs Professional Practice

> Status: 2026-09-05. Phase A and Phase B landed; Phase C/D and P2 items remain open.
> Companion: `docs/COMPLIANCE_PHASE1.md` (delivery contract), `docs/INTEGRATION_REPORT.md` (integration state).

## Purpose

Map the Brikmaster mastering chain (`apps/audiomind/src/audiomind/processing/engine.py`)
against 17 pieces of advice commonly given by professional mastering engineers,
identify concrete gaps with code evidence, and drive them into shipped phases.

**Honest framing:** an autonomous product does not replace fresh ears. The winning
strategy is *neutral by default + process with intention + exhaustive QC + reject (422)
when a source cannot be saved* — the LANDR/emastered model. This review checks how
close the engine gets.

---

## What the chain already does well (evidence)

| # | Professional advice | Position | Evidence |
|---|---|---|---|
| 1 | Loudness is a delivery target, not a process goal | ✅ complies | LUFS measured/validated after the chain; `target_lufs_db` only sets the final alignment stage |
| 2 | Leave headroom before the bus | ✅ complies | `gain_stage` to −6 dBFS at the chain head (engine L139-155) |
| 3 | Double protection against inter-sample peaks | ✅ complies | Soft-clipper (16×, erf knee) → true-peak limiter (body + 4 ms lookahead, 8× Kaiser) |
| 4 | Reverb only on the side (mono-safe) | ✅ complies* | Reverb lives in the M/S block on the side channel; *(see P0-2 for final QC gap, now fixed)* |
| 5 | Pro-grade dither / oversampling hygiene | ✅ complies | TPDF dither + Lipshitz 2nd-order noise shaping at 16-bit; libsoxr VHQ resample before DSP |
| 6 | EQ toward a genre reference | ✅ complies | Match EQ against `TARGET_BANDS_HZ` [60,150,400,1000,2500,6000,10000,15000], delta×1.8, ±2 dB, skip <0.5 dB |
| 7 | Mono-compatibility floor | ✅ complies | L/R collapse below 120 Hz to mono center |
| 8 | Don't over-process a track that is already there | ⚠️ partial → **FIXED (Phase A)** | Chain was always-on; now `smart_gate.py` skips corrective tone-shaping when input analysis already meets targets |
| 9 | Tame sibilance on the master bus | ❌ was missing → **FIXED (Phase B)** | Legacy static de-esser only in `/vocal`; now dynamic de-esser 3-8 kHz in `process_audio` |
| 10 | Clean the sub-bass in the stereo decorrelation | ❌ was missing → **FIXED (Phase B)** | no side HPF <100 Hz; now `apply_side_hpf` in M/S block |
| 11 | Check the FINAL master for phase/correlation | ⚠️ partial → **FIXED (Phase A)** | Correlation was mid-chain only; now measured on final master + validation issue |
| 12 | Check dynamic range collapse | ❌ was missing → **FIXED (Phase A)** | DR validation was a silent `pass`; now real check (absolute floor + collapse ratio) |
| 13 | Decide per-track, not per-preset-blindly | ❌ was missing → **FIXED (Phase A)** | smart gate is analysis-driven, conservative with engaged signatures |
| 14 | Compare against an external reference while mastering | ❌ open (P1 Phase C) | `/reference/{preset_id}` re-renders the same track (neutral Crudo), never an external file |
| 15 | Master an album/EP toward a relative target | ❌ open (P1 Phase D) | No batch mode with a common relative target |
| 16 | Integrity/QC gate that can reject bad sources | ✅ complies | `strict_mode` → HTTP 422 with parsed detail for hard-clipped / hot sources |
| 17 | Keep the tonal character the artist chose | ⚠️ partial | preset characters are preserved; smart gate uses conservative tier when a signature is engaged (see design note) |

---

## P0 gaps (were blocking quality) — status

| # | Gap | Root | Status |
|---|---|---|---|
| P0-1 | Smart gating "less is more" — chain always-on; neutral fast-path only with default params, not by analysis | No per-track decision | ✅ **FIXED** `feature/dsp-phase-a`: `smart_gate.py`, wired in `process_audio`; gated modules = match EQ / clarity shelf / warmth tilt / fixed compressor; NEVER delivery-critical stages |
| P0-2 | QC correlation/phase of the FINAL master | correlation/phase only inside spatial/imaging, mid-chain | ✅ **FIXED** Phase A: `measure_stereo_correlation` (windowed 4096/hop 1024) on final output; validation issue `< 0.35` (warning only) |
| P0-3 | Sibilance 3-8 kHz — static de-esser only in `/vocal`, outside `process_audio` | legacy voice-path design | ✅ **FIXED** Phase B: `deesser.py` dynamic detector (band/broadband ratio, audibility floor −55 dBFS, transient spike over 500 ms rolling reference); placed BEFORE tonal chain |
| P0-4 | Side HPF <100 Hz M/S does not exist | only L/R collapse <120 Hz to mono | ✅ **FIXED** Phase B: `apply_side_hpf` (4th-order butter, 24 dB/oct), `side_hpf_enabled` default off; complementary to mono collapse |
| P0-5 | DR validation is a `pass` no-op | stub left from chain build | ✅ **FIXED** Phase A: real DR check — output LRA < 3.0 LU (EBU 3342 floor) OR < 0.5× input DR → warning |

## P1 gaps — open

| # | Gap | Plan |
|---|---|---|
| P1-1 | External reference mode: `/reference/{preset_id}` re-renders the same track; there is no way to compare against a real master reference file | Phase C — endpoint + comparative analysis (spectral diff, loudness/brightness profile) |
| P1-2 | Album/EP mode: no batch mastering toward a common relative target | Phase D — batch API + relative LUFS/DR negotiation |

## P2 — dead code (low priority)

Confirmed still present (2026-09-05):
- `build_proportional_compressor` (engine L371) — nominal path replaced by adaptive compressor.
- `_build_dynamic_eq_fallback` (engine L332) + `analyze_band_energy` (engine L162) — fallback/legacy helpers.
- Suggested: remove after C/D or when a real consumer exists; keep only if tests rely on them.

---

## Implementation notes (decisions worth preserving)

### Smart gate design (Phase A)
- Conjunction of the three Layer-2 validation constants: `|input LUFS − target| ≤ 1.5 dB`, `crest ≥ 6.0 dB`, `true peak ≤ ceiling + 0.1 dB`.
- `tier=full`: no signature engaged → gate match EQ, clarity shelf, warmth tilt, fixed compressor.
- `tier=conservative`: a character knob is engaged (`saturation`, `clarity`, `spatial`, `compression`, module on-flags) → gate ONLY match EQ (+ compressor when compression knobs are pristine). Signature modules are **never** gated.
- Report payload: `smart_gate: {applied, tier, gated_modules, evidence}`.

### De-esser design (Phase B)
- Band 3-8 kHz (anchors: analysis presence 6 kHz, vocal de-esser 5-8 kHz / 7.2 kHz).
- Detector: `band_env − total_env` ratio envelopes (15 ms attack / 150 ms release, from `multiband.detect_envelope`).
- Detection gate: band audible > −55 dBFS **and** spike > 3 dB over a 500 ms rolling reference — a permanently-bright program is NOT dulled (tested `test_permanent_bright_program_is_not_dulled`).
- Topology: parallel attenuation `y = x + (g_lin−1)·x_band` — exact 0 contribution below threshold (bit-exact); joint `(L+R)/2` detector preserves stereo image.
- Neutral: `deesser_amount_db == 0` or `deesser_enabled == False` → bit-exact no-op.

### Side HPF design (Phase B)
- Corner default 100 Hz, 4th-order Butterworth, side channel only (mid never touched).
- Anchor: below the 120 Hz mono collapse, above the 30 Hz master HPF — complementary by construction.
- `side_hpf_enabled` default `False` → bit-exact bypass.

### QC thresholds (Phase A)
- `STEREO_CORRELATION_MINIMUM = 0.35` (correlation meter "red zone" ~0.3-0.4, Ozone/ITU-style mono-compat guidance).
- `DR_COLLAPSE_RATIO = 0.5`, `DR_MINIMUM_LU = 3.0` (EBU 3342 percentile floor). Both warning-only.

---

## Shipped phases

| Phase | Scope | Branch | Tests |
|---|---|---|---|
| A | smart gating + final correlation QC + real DR validation | `feature/dsp-phase-a` | `tests/test_phase_a.py` (11) |
| B | side HPF <100 Hz + dynamic de-esser 3-8 kHz | `feature/dsp-phase-b` | `tests/test_deesser.py` (25) + `tests/test_spatial.py` (+7) |

Suite after both: **270 passed** (`cd apps/audiomind && python -m pytest tests/ -q`).

## Remaining

- Merge/review `feature/dsp-phase-a` and `feature/dsp-phase-b` into `main`.
- Phase C (external reference), Phase D (album/EP batch), P2 cleanup.
- End-to-end smoke with a real track once servers are running.