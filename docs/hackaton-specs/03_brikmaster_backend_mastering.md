# 03 — Idea 2 · WaveAI: Backend de Mastering (Parte I de la spec)

> Fuente: `MASTERING_ECOSYSTEM_SPEC.md` — Parte I (ecosistema de mastering). Todo claim numérico es trazable al código citado.

## 1. Qué es

WaveAI es un estudio de mastering asistido por IA. El usuario sube WAV/MP3, el backend analiza (loudness, dinámica, espectro, tempo, género), mapea el resultado a parámetros de mastering por módulos, corre una **cadena DSP proporcional** y devuelve un master comparable en A/B, descargable en WAV o MP3.

**Decisión de diseño clave: el motor es proporcional, no preset-driven.** Los presets definen carácter y targets de loudness; los valores DSP reales (gains de EQ, thresholds de compresor, gain LUFS) se calculan por track según lo que el análisis dice que el input necesita. Implementado en `backend/src/audiomind/processing/engine.py` (`process_audio`).

## 2. Hechos de producto

| Propiedad | Valor |
|---|---|
| Formatos aceptados | `.wav`, `.mp3` (≤ 50 MB) |
| Target loudness default | −14 LUFS |
| Sample rate de trabajo | Nativo de la fuente (default config 44100 Hz) |
| Formatos de salida | WAV float (pedalboard) y MP3 320 kbps (ffmpeg) |
| Bit-depth | 16 (dither noise-shaped) o 24 (default) |
| Gate de licencia | Process y download requieren `require_license` |

## 3. Arquitectura de componentes

```
┌──────────────────────────── Browser (Next.js) ─────────────────────────────┐
│  page.tsx (orquestación)                                                   │
│   ├─ DropZone ──► api.uploadAudio (XHR, byte-progress)                     │
│   ├─ useProcessingProgress ──► polls GET /session/{id} cada 500 ms         │
│   ├─ ModulePanel (macro cards + Knob3D fine-tune)                          │
│   ├─ PlatformSelector (chips de target LUFS)                               │
│   ├─ Player (WaveSurfer A/B)   AnalysisPanel (meters + métricas)           │
│   └─ ProcessingOverlay (progreso)  ModuleSheet / PaintedModule (nav)       │
└──────────────┬─────────────────────────────────────────────────┬───────────┘
               │ HTTP (JSON / multipart / blobs)                  │
┌──────────────▼──────────────── FastAPI "AudioMind" ────────────▼───────────┐
│  main.py: CORS, routers /api (upload, mastering, license, splitter,        │
│  vocal, songstarter), GET /health                                          │
│  api/upload.py      POST /upload → guarda archivo, análisis en background  │
│  api/mastering.py   POST /session/{id}/process → ThreadPoolExecutor(4)     │
│  analysis/analyzer.py     métricas librosa + género rule-based + mastered  │
│  processing/engine.py     orquestador de la cadena proporcional            │
│  processing/*.py          etapas DSP (loudness, truepeak, clipper, MB...)  │
│  storage/cache.py         caché de sesión en memoria (Fase 1)              │
└────────────────────────────────────────────────────────────────────────────┘
```

## 4. Flujo de datos (happy path)

1. `POST /api/upload` guarda el archivo como `{uuid}{suffix}` en `backend/uploads/`, crea `SessionData` en memoria y retorna de inmediato mientras el análisis librosa corre off-loop.
2. El cliente hace polling de `GET /api/session/{id}` hasta que `analysis` esté poblado (intervalo 500 ms, presupuesto 90 s).
3. El género detectado se mapea a `MasteringParameters` iniciales en el cliente (`genreToParams`).
4. `POST /api/session/{id}/process` corre: reutilización de análisis → cadena DSP → WAV float en `backend/outputs/{id}_mastered.wav`, reportando progreso 0..1 por la sesión.
5. El cliente hace polling de progreso (500 ms), renderiza el player A/B (`/audio/original`, `/audio/mastered`) y ofrece `/download/wav` y `/download/mp3`.

**Estado:** enum `ProcessingStatus`: `uploaded → analyzing → processing → completed | error`. Sesiones en dict de módulo — process-local, se pierden al reiniciar. `SessionCache` singleton con la misma semántica Fase 1 (Redis planeado para Fase 2).

## 5. Ingestion (`api/upload.py`)

| Caso | Comportamiento |
|---|---|
| Sin nombre de archivo | 400 |
| Extensión ≠ .wav/.mp3 (case-insensitive) | 400 con mensaje de formatos |
| Tamaño > 50 MB | 413 con tamaño real |
| Almacenamiento | Archivo completo en memoria → `{upload_dir}/{session_id}{suffix}` |
| Sesión | `uuid4()`, status `UPLOADED`, original_path + original_filename |

**Análisis automático en background:** tras guardar, status → `ANALYZING` y `analyze_audio` corre vía `run_in_executor(None, ...)` — el event loop nunca se bloquea con librosa. La tarea vive en `_background_tasks` (strong refs evitan GC; `add_done_callback(discard)` limpia). Fallo intencionalmente tragado: el análisis es opcional al upload porque `/process` lo re-ejecuta si falta.

## 6. Análisis IA (`analysis/analyzer.py`)

Carga: `librosa.load(sr=None, mono=False)`; downmix mono para features espectrales; LUFS medido con el mismo meter BS.1770-4 que el engine (fuente única de verdad).

### Métricas → `AnalysisResult`
| Métrica | Método |
|---|---|
| `integrated_lufs` | BS.1770-4 (rounded 0.1) |
| `true_peak_db` | Peak en dominio de muestra (no oversampled en análisis; el meter oversampled va al master renderizado) |
| `dynamic_range_db` | Mean RMS (frame 2048, hop 512) del 10% más fuerte − 10% más suave |
| `spectral_centroid` | Mean de `librosa.feature.spectral_centroid` |
| `tempo_bpm` | `librosa.beat.beat_track` |
| `crest_factor_db` | `20·log10(peak/RMS)` del mono mix |
| `duration/sample_rate/channels` | Directos |

### Detección de género (rule-based, accuracy ≈ 40% documentada)
Ventanas de tempo, bass-energy ratio (STFT < 200 Hz / total), flatness espectral, zero-crossing rate, DR y centroid. Ejemplos: hip_hop (60–100 BPM, bass>0.35, centroid<3000 → 0.8), electronic (120–150, flatness>0.1, bass>0.4 → 0.85), reggaeton (85–105, bass>0.45 → 0.8), jazz (DR>12, centroid<4000 → 0.7), classical (DR>15, centroid<3500 → 0.75), acoustic (ZCR<0.05, centroid<3000, DR>10 → 0.7), pop (90–130, centroid>2500 → 0.6), rock (100–160, centroid>2000, DR>8 → 0.65). Ninguna regla → `"other"` confianza 0.3. Gana el score más alto.

### Detección "ya masterizado" (umbral ≥ 0.8, conservador)
Puntos acumulados: LUFS −14…−9 (+0.35), −16…−14 (+0.15); true peak < −0.3 dBFS (+0.25) / < −0.5 (+0.15); DR 4–10 (+0.20) / 10–12 (+0.10); centroid 2500–3500 (+0.10) / 2000–4000 (+0.05); crest ≤ 10 (+0.30) / ≤ 12 (+0.20) / ≤ 14 (+0.10).

Al detectarse: el engine preserva el 80% de potencia de procesamiento (`am_factor = 0.8`: intensidad Match-EQ, claridad shelf, ratio comp, drive saturación escalados) y añade 0.4 dB de headroom extra al limiter. UI: banner verde "Audio ya masterizado".

### Perfiles de target por género (Match EQ)
`TARGET_BANDS_HZ = [60, 150, 400, 1000, 2500, 6000, 10000, 15000]`. `GENRE_TARGET_PROFILES` define offsets relativos dB (vs ruido rosa) por banda, citados de análisis espectrales publicados (Zemcov 2019; surveys IBAC/LUFS). El perfil `other` es una smile curve suave basada en la pendiente industrial −4.5 dB/octava — el Match EQ **nunca** cae en perfil do-nothing.

## 7. Presets: dos capas que no se deben confundir

1. **Backend `PRESET_CHAINS`** (`processing/presets.py`) — datos de carácter/target de los 8 presets macro. Alimenta metadata (`list_presets`) y el workflow de master pre-construido (§10). **La cadena DSP viva NO lo lee** — `process_audio` se conduce enteramente por `MasteringParameters`.
2. **Frontend macro cards** (`ModulePanel.tsx`) — cada card envía valores concretos de `MasteringParameters` a `/process` al hacer click.

Ocho presets backend (resumen): Universal (equilibrado, −14 LUFS, ceiling −1.0), Fuego (impacto, −9, −0.3), Claridad (brillante, −12, −1.5), Cinta (analógico, −12, −1.0), Natural (transparente, −14, −2.0), Espacial (amplio, −12, −1.0, width 1.4), Cinemático (pesado, −8, −0.3), Empuje (agresivo, −8, −0.3).

> ⚠️ Divergencia conocida: varios `PRESET_INFO` del frontend difieren del backend (ej. cinta −11 vs −12 LUFS; empuje ratio 8.0 vs 6.0). Solo colorean el waveform y la card "Preset Objetivo" — **no afectan el audio**.

## 8. Cadena DSP (`process_audio`) — walkthrough

Checkpoints de progreso: 0.05, 0.18, 0.30, 0.45, 0.55, 0.60, 0.70, 0.82, 0.88, 0.95.

| # | Etapa | Detalle |
|---|---|---|
| 1 | Gain staging | Peak-normalize a −6 dBFS; silencio pasa con gain 0 dB |
| 2 | High-pass | Pedalboard 30 Hz fijo (correctivo) |
| 3 | Match EQ | `delta = (target − current) × 1.8` (×0.8 si ya masterizado); clamp ±2 dB; Q 0.8; skips < 0.3 dB |
| 4 | Clarity shelf | PeakFilter 8 kHz, Q 0.6, gain = brightness (×0.8 si mastered); skip en 0 |
| 5 | Warmth tilt | PeakFilter 10 kHz, Q 0.5, gain = warmth; skip en 0 |
| 6 | Compresión | Si `adaptive_comp_enabled`: compresor program-dependent post-board (§7a). Si no: `threshold = −16 dB − 1.5·punch`, ratio = `compression_ratio` (×0.8 si mastered), attack = max(3, 20−3·punch) ms, release 200 ms |
| 7 | Board render | Todos los pedales en una pasada |
| 7a | Compresor adaptativo (Sprint 8) | Threshold sigue RMS del programa (clamp −30…−4 dBFS), attack/release crest-adaptive, detector de envolvente peak 5 ms. Neutral (ratio 1.0) = bypass bit-exacto |
| 7b | Multiband (Sprint 4) | Crossovers LR4 (2 Butterworth en cascada, Q=1/√2), splits 150 Hz / 3 kHz, envolvente one-pole en (L+R)/2, soft knee, makeup automático. Neutral = bypass |
| 7c | Dynamic EQ (Sprint 5) | Solo cuts: `G(t) = min(0, −(E(t)−T)·(1−1/R))`; biquads RBJ SOS; comparte detector del multiband. Neutral = bypass |
| 7d | Excitador armónico (Sprint 6) | 4 bandas estilo Ozone: bass (even, H2≈0.42, 100 Hz), tube (even, 200 Hz), tape (odd tanh, 200 Hz), air (odd, 800 Hz); high-pass orden 4. `y = x + Σ amount·excited`. Neutral = bypass |
| — | Bloque espacial | Si `clarity_wet>0`, o width≠1.0, o Haas>0. M/S √2-normalizado: reverb en side (room 0.3+0.3·wet, wet ≤0.15), Haas en side (mix ≤0.5 = ms/80), width legacy. Check de correlación < 0 → `safety_enforce_correlation` |
| 7e | Imaging per-band (Sprint 9) | LR4 3-bandas constant-power; lows mono bajo `mono_below_hz`; safety floor −0.1 con side gain 0.7. Corre después del bloque espacial, antes de saturación. Neutral = bypass |
| 8 | Saturación | Si `tape_enabled`: modelo de cinta real con recursión histeresis `y[n] = tanh(drive·x + bias + k·y[n−1]·(1−|y[n−1]|))`, bias ≤0.2, HF roll-off level-dependent. Si no, si drive>0: tanh legacy (k = 5·drive) ×1.8 intensidad ×0.8 mastered |
| 9 | Mono compat | Lows < 120 Hz colapsados a mono (Butterworth orden 4). **Skipped** cuando Sprint-9 ya colapsó los lows — los dos collapses no son idempotentes |
| 10 | Loudness target | `target_lufs_db` explícito gana; si no: `−14 + (1 − ceiling/−0.3)·6`, clamp [−14, −8]. Corrección clamp −12…+6 dB; silence-safe |
| 11a–b | Codec pre-match | Crest medido; `compute_codec_safe_ceiling` puede bajar el ceiling; ceiling de usuario −0.4 dB extra si ya masterizado |
| 11b′ | Soft clipper (Sprint 3) | 16× oversampled, erf-knee, threshold = ceiling seguro − 1.5 dB; recorta picos transitorios antes del limiter; aliasing < −90 dBFS (20 kHz full-scale); material bajo threshold = bit-idéntico |
| 11c | True-peak limiter | 8× oversampled lookahead: stage 1 release program-dependent (crest), stage 2 lookahead 4 ms ≈30 ms release, safety net hard-clip 0 dBFS; `g[n] = min(1, c/max|x[n..n+L]|, g[n−1]·decay)`; bit-stable bajo ceiling. Oversampling polyphase Kaiser β 8.6 (≈80 dB stopband) |
| 12 | Safety normalize | Si algún sample > 1.0 → rescale a 0.99 |
| — | Dither | Bit 16: TPDF + noise shaping Lipshitz 2nd order (coefs 1.675, −0.725) → ruido > 15 kHz. Bit 24: sin shaping (piso ≈ −144 dBFS) |
| 13 | Validación DR | Warning si output/input DR < 0.8 (>20% de reducción) |
| Write | WAV float | `pedalboard.io.AudioFile`; luego se miden true peak y LUFS integrados del resultado (incl. flag `codec_pre_matching`) |

> ⚠️ El panel educativo de la app ("Cadena de Master") describe el limiter como "4x Oversampling"; la implementación es 8×. El texto precede al limiter actual y debería corregirse.

## 9. Modelo de ejecución

### Concurrencia
- `_dsp_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="dsp")` — DSP CPU-bound fuera del event loop para que el polling de progreso siga respondiendo.
- Análisis de upload: default executor (`run_in_executor(None, ...)`).
- `/process` await `run_in_executor(_dsp_executor, _run_processing)`; callbacks de progreso clamp [0,1] y mutan la sesión in-place.

### Presupuestos del cliente (`page.tsx`)
| Budget | Valor | Propósito |
|---|---|---|
| `ANALYSIS_TIMEOUT_MS` | 90 s (poll 500 ms) | Esperar análisis antes de auto-process; timeout → mensaje retry |
| `PROCESS_TIMEOUT_MS` | 600 s (10 min) | Watchdog AbortController en cada `/process` (WAV 50 MB con 8×/16× oversampling tardan minutos) |
| Polling de progreso | 500 ms, polls solapados se saltan | session.progress 0..1 → % |
| Cierre del overlay | Freeze en 100%, cierra tras 1200 ms | Deja que la respuesta POST (con `mastered_path`) resuelva |

Todo path de procesamiento (auto-process, reprocess manual, click de preset) aborta cualquier request en vuelo antes de empezar uno nuevo.

### Lookup de master pre-construido (§7.3)
Si `/process` recibe `preset_id` y existe `backend/prebuilt/{stem}_{preset_id}.wav` (size > 0), el server lo copia a la salida y retorna COMPLETED con progreso 1.0 — **no corre DSP**. ~1–2 s vs ~44 s de un render completo de 3 min. La key usa el stem del nombre original porque los archivos se renombran al session id. Esto es lo que hace que los clicks de preset se sientan instantáneos en demos.

## 10. Playback, verificación y export

- `GET /api/session/{id}/audio/original|mastered` → FileResponse WAV (fuente directa de WaveSurfer).
- `GET /api/session/{id}/raw`, `/raw-mastered` → JSON interleaved Float32 para visualizaciones Web Audio.
- **A/B player:** dos WaveSurfer apilados (bars 2/1/1, height 120, normalized). Colores original `#484855/#666677`; master del `PRESET_COLORS[presetId]`. Toggle segmentado con pill deslizante; minimizar colapsa 120↔24 px con `resize()` al expandir. Glow neón radial tras el waveform master (`rgba(wave,0.06)`). Note bursts: 12 notas al cargar ambos tracks o al completar master; durante playback una nota cada ~1.2 s (x aleatoria 5–90%, máx 24 concurrentes, removidas tras 1.5 s).
- **AnalysisPanel:** meters LED (LUFS −40…0 target −14; True Peak −12…+3 target −1; Crest 0…24 target 12), grid de métricas (DR, tempo con count-up GSAP 1.1 s, género, duración, sample rate, confianza de mastering), banner verde "ya masterizado", card "Preset Objetivo".
- **Export:** WAV directo (`{session_id}_mastered.wav`, download `brikmaster_{session_id}.wav`); MP3 vía `ffmpeg libmp3lame -b:a 320k` timeout 60 s, resolución del binario PATH → fallbacks Windows. Ambos con `X-License-Key`. Formatos fuera de `wav|mp3` → 400.

## 11. API Reference (ecosistema mastering)

Base: `NEXT_PUBLIC_API_URL` o `http://localhost:8000/api`.

| Método & path | Auth | Request | Response |
|---|---|---|---|
| `POST /api/upload` | — | multipart `file` (WAV/MP3 ≤ 50 MB) | SessionData; retorna ya, análisis en background |
| `POST /api/session/new` | — | JSON opcional | `{session_id}` |
| `GET /api/session/{id}` | — | — | SessionData (progress, status, analysis) |
| `POST /api/session/{id}/process` | license | MasteringParameters JSON; query `preset_id` opcional | SessionData completed; sirve prebuilt si coincide |
| `GET /api/session/{id}/audio/{original\|mastered}` | — | — | Stream WAV |
| `GET /api/session/{id}/raw`, `/raw-mastered` | — | — | JSON Float32 interleaved |
| `GET /api/session/{id}/download/{wav\|mp3}` | license | — | Download; MP3 transcodificado 320 kbps |
| `GET /api/license/status` · `POST /api/license/activate` | — | `{key}` | Handshake de licencia |
| `GET /health` | — | — | Liveness (sin prefijo /api) |

`MasteringParameters` (Pydantic): `clarity_wet` (0–1, .15), `clarity_brightness_db` (±6, +1.0), `compression_ratio` (1–10, 2.0), `limiter_ceiling_db` (−3…0, −1.0), `transient_boost_db`, `saturation_drive_db`, `saturation_warmth_db`, `stereo_width`, `haas_delay_ms`, `output_bit_depth` (16/24, 24), `target_lufs_db` opcional + grupos opt-in (`multiband_*`, `dyn_eq_*`, `exciter_band*`, `tape_*`, `adaptive_comp_*`, `stereo_imaging_*` con flags `*_enabled`) cuyos neutros son bypass bit-exactos.

## 12. Fuera de alcance de la spec

SongStarter/BrikEngine (beat gen), StemSplitter (Demucs), VocalChain, GenreGuide, roadmap de negocio/ML Fase 2 (CNN género, XGBoost recommender), deployment/CI/Docker/monitoring, internals del backend de licencias.
