# Compliance Phase 1 — Streaming-Safe Delivery

BandLab/LANDR-style delivery: loudness targets aligned to streaming
platforms, guaranteed true-peak ceilings, sample-rate conversion, and
explicit PCM output — with a new **transparent** mode that only does
what the client explicitly asks for.

## Request parameters

All new parameters live on `MasteringParameters` (the JSON body of the
mastering endpoints) and default to backward-compatible values:

| Parameter | Default | Values |
|---|---|---|
| `processing_mode` | `"master"` | `"master"` (full adaptive chain), `"transparent"` (delivery-only) |
| `platform_target` | `null` | `"spotify"`, `"apple_music"`, `"youtube"`, `"tidal"`, `"custom"`, or `null` |
| `output_sr` | `"same_as_input"` | `"same_as_input"`, `"44100"`, `"48000"`, `"96000"` (int or str) |
| `output_bit_depth` | `24` | `16` (noise-shaped dither), `24`, `32` |
| `strict_mode` | `false` | `true` rejects hard-clipped / hot sources with HTTP 422 |

### Platform presets

`platform_target` fills in `target_lufs_db` and `limiter_ceiling_db`
through a model validator; `"custom"` (and `null`) leave the sent values
untouched.

| Platform | Target LUFS | Limiter ceiling (dBTP) |
|---|---|---|
| Spotify | -14.0 | -1.0 |
| Apple Music | -16.0 | -1.0 |
| YouTube | -14.0 | -1.0 |
| Tidal | -14.0 | -1.0 |
| custom | client values | client values |

> YouTube additionally accepts -13 LUFS for louder masters; to use it,
> pass `target_lufs_db: -13.0` explicitly instead of `platform_target`.

## Transparent mode engage rule

In `"transparent"` mode ONLY these stages run, and each ONLY when
explicitly requested:

- **SRC** — only when `output_sr` differs from the input rate.
- **Loudness + streaming-safe limiter tail** (codec-safe ceiling, soft
  clip, true-peak limit) — only when `target_lufs_db` is set, explicitly
  or via `platform_target`.
- **Dither** — only at 16-bit output (`output_bit_depth: 16`).

Nothing is ever derived automatically: a transparent request with no
target is a pure passthrough where samples are untouched beyond the PCM
quantization of the writer.

## Output writer

The engine writes every processed result — including transparent mode —
through an explicit-subtype PCM writer (`processing/io_write.py`),
default **24-bit** (`PCM_24`), with `PCM_16` / `PCM_32` for the other
depths. The writer maps the requested depth to the exact soundfile
subtype and fails loudly on anything else.

> **Neutral fast-path exception**: when the request equals the pristine
> `MasteringParameters()` defaults, the master-mode fast-path still
> writes a **32-bit float WAV** to stay byte-exact with the input (the
> bit-exactness contract). Real processing and transparent renders always
> go through the explicit PCM writer.

## Sample-rate conversion

Resampling uses **soxr VHQ** (`processing/resample.py`) — the actively
maintained `soxr` binding for libsoxr, not the legacy `pysoxr`. VHQ =
95% bandwidth, high-quality mode, kept lazy so the binding only loads in
the SRC branch. Output length follows libsoxr (`round(n * dst / src)`).

## True-peak handling

- `TP_OVERSAMPLE = 8` is the canonical oversampling factor, used by the
  limiter, the true-peak detector, and the loudness-meter `true_peak_db`
  / `Meter.true_peak` defaults — **8× everywhere**, matching the limiter.
- The limiter's final safety net (`truepeak.py`) clamps the oversampled
  signal at the **requested ceiling** (`10 ** (ceiling_db / 20)`), never
  at 0 dBFS — the streaming-safe route cannot deliver a sample above the
  target dBTP. For a 0 dB ceiling the behavior is identical to the old
  0 dBFS clip; for negative ceilings it enforces the ceiling.

## strict_mode

Before any DSP runs, a QC gate analyzes the input for hard clipping and
true peak `>= -0.3 dBTP`. With `strict_mode: true`, the engine raises
`InputQcError` and the API answers **HTTP 422** with a clear Spanish
detail, e.g.:

```
Entrada rechazada por strict_mode: clipping duro (3000 samples) y true peak >= -0.3 dBTP.
```

With `strict_mode: false` (default) the same input completes and the
QC findings are delivered as `warnings`.

## mastering_report

Every engine result maps onto a `mastering_report` JSON object
(nullable fields stay null when nothing was measured):

```json
{
  "input_sr": 44100,
  "output_sr": 44100,
  "output_bit_depth": 24,
  "lufs_i": -14.02,
  "true_peak_dbtp": -1.04,
  "lra": 8.5,
  "crest_factor_db": 11.2,
  "target_lufs": -14.0,
  "warnings": []
}
```

Fields: `input_sr`, `output_sr`, `output_bit_depth`, `lufs_i`
(integrated loudness of the delivered file), `true_peak_dbtp`,
`lra`, `crest_factor_db`, `target_lufs` (the ACTUAL target used;
`null` = none applied), `warnings` (Spanish, neutral Latin American).

## Examples

Stateless flow (single request, downloads `audio_url`):

```bash
curl -X POST http://localhost:8000/api/master \
  -H "Content-Type: application/json" \
  -d '{
    "audio_url": "https://example.com/track.wav",
    "settings": {
      "processing_mode": "transparent",
      "platform_target": "spotify",
      "output_sr": "48000",
      "output_bit_depth": 24,
      "strict_mode": true
    }
  }'
```

Session flow (upload first, then process):

```bash
# 1. Upload
curl -X POST http://localhost:8000/api/upload \
  -F "file=@track.wav"          # → {"session_id": "...", ...}

# 2. Process with delivery settings
curl -X POST http://localhost:8000/api/session/{session_id}/process \
  -H "Content-Type: application/json" \
  -d '{"processing_mode": "transparent", "platform_target": "youtube"}'
```

Both responses now include `mastering_report` (session: embedded in the
`SessionData` body; stateless: a top-level `mastering_report` key next
to `audio` and `metrics`). A strict-mode rejection returns 422 with the
Spanish `detail` shown above.

## Backward compatibility

- Every new parameter defaults to the pre-Phase-1 behavior
  (`processing_mode: "master"`, no platform defaults, `output_sr:
  "same_as_input"`, `output_bit_depth: 24`, `strict_mode: false`), so
  existing requests behave exactly as before.
- The neutral fast-path (pristine defaults) keeps its byte-exact float
  passthrough; the engine returns the same result keys it always did.
- The API responses only ADD `mastering_report` — no existing field was
  renamed or removed.
- Mono and stereo sources are unaffected; the QC gate only warns unless
  `strict_mode` is set.