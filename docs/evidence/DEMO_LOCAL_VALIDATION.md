# DEMO_LOCAL_VALIDATION.md — Validación local del demo 4-min

> **Fecha:** 2026-09-11
> **Foco:** validación local completa del modo demo (`AUDIOMIND_DEMO_MAX_DURATION_SECONDS=240`) antes de decidir despliegue.
> Evidencia cruda versionada: `docs/evidence/benchmark_staircase_report.json`, `docs/evidence/validate_duration_report.json`. Los logs crudos (`apps/audiomind/_staircase_out.txt` y similares) no se versionan.

---

## 1. Entorno medido

| Métrica | Valor |
|---|---|
| OS | Windows (nt) |
| CPU | 8 cores |
| RAM total | 16.36 GB |
| RAM disponible al inicio | 8.6 GB |
| Env demo | `PRERENDER_MODE=on_demand`, `MAX_CONCURRENT_DSP=1`, `MAX_DURATION=240`, `MAX_FILE_SIZE_MB=100`, `SESSION_TTL_MINUTES=60` |
| Server | uvicorn real (FastAPI + single-flight demo_guard + pool DSP con `max_concurrent=1`) |

> Nota de medición: en Windows con Python gestionado por `uv`, el `python.exe` del venv es un **launcher** (~5 MB) que lanza el intérprete real como hijo. Toda medición de RSS/CPU de esta validación muestrea el **worker real** (hijo), no el launcher — tras resolver el pid por `children(recursive=True)`.

---

## 2. Gate de duración (HTTP real) — PASS

| Duración | Resultado HTTP | DSP post-análisis | Archivos huérfanos |
|---|---|---|---|
| 60 s | ✅ ACCEPT | 0 | 0 nuevos |
| 210 s | ✅ ACCEPT | 0 | 0 nuevos |
| 240 s | ✅ ACCEPT | 0 | 0 nuevos |
| 241 s | ❌ REJECT 422 `"Demo: carga hasta 240 segundos de audio."` | 0 | 0 |

- El rechazo de 241 s no ejecuta DSP ni deja archivos en disco.
- Metro DSP: primer fuego **+1 DSP** (1.85 s de pared), re-fuego por cache **+0 DSP** (0.02 s).

---

## 3. Benchmark staircase (45 → 240 s) — PASS completo

12 jobs DSP reales, todos exitosos, sin NO-GO del safety gate (umbral 60% de 16.36 GB = 9.8 GB; pico máximo observado 6.95 GB = 42.5%).

| Etapa | preset | Pico RSS (GB) | Wall (s) | CPU pico | Output (MB) |
|---|---|---|---|---|---|
| 45 s | fuego | 1.26 | 6.1 | 138% | 11.9 |
| 45 s | cinta | 1.31 | 5.8 | 106% | 11.9 |
| 45 s | natural | 1.26 | 5.9 | 125% | 11.9 |
| 60 s | fuego | 1.60 | 7.7 | 181% | 15.9 |
| 60 s | cinta | 1.79 | 7.8 | 169% | 15.9 |
| 60 s | natural | 1.61 | 14.9 | 156% | 15.9 |
| 210 s | fuego | 5.60 | 26.8 | 169% | 55.6 |
| 240 s | fuego | 6.71 | 33.2 | 147% | 63.5 |
| 240 s | cinta | 6.71 | 31.6 | 156% | 63.5 |
| 240 s | natural | 6.95 | 31.0 | 156% | 63.5 |
| 240 s | claridad | 6.73 | 32.3 | 162% | 63.5 |
| 240 s | espacial | 6.83 | 32.6 | 169% | 63.5 |

**Baseline del server:** 0.21 GB (215–223 MB) con librosa y la app cargadas; vuelve a 0.21 GB tras cada job (sin leak).

**Cache DSP:** perfecto — re-request del mismo preset = 0.00–0.02 s, delta DSP = 0 en los 4 puntos de chequeo (A, B, switch E→F).

**On-demand:** en TODAS las etapas el análisis post-upload dejó delta DSP = 0. Sin prerender automático.

**Escalado de tiempo** (8 cores locales): mastering ≈ 0.13 × duración del track (240 s → ~31-33 s).

**Escalado de RAM:** 45 s → 1.3 GB; 60 s → 1.6-1.8 GB; 210 s → 5.6 GB; 240 s → 6.7-7.0 GB. Crecimiento ≈ 0.026 GB/s sobre la línea base de análisis a partir de 60 s.

---

## 4. Integridad WAV de salida — PASS

16/16 WAV verificados con `wave`:

| Archivo | sr | ch | bits | duración |
|---|---|---|---|---|
| Fixtures (stair_45/60/210/240.wav) | 44100 | 2 | 16 | 45.00 / 60.00 / 210.00 / 240.00 s |
| 12 outputs `*_mastered.wav` | 44100 | 2 | 24 | exactos a la fuente |

Duración exacta (sin padding/drift) y muestreo correcto en todos los casos.

---

## 6. Integridad DSP: neutral = bypass bit-exacto — PASS

`POST /session/{id}/process` con `MasteringParameters()` por defecto (`{}`):

| Métrica | Valor |
|---|---|
| HTTP | 200 |
| Wall | **1.30 s** (vs ~6 s de un preset real) |
| DSP ejecutados | **delta 0** (el fast-path no consume presupuesto DSP) |
| Formato de salida | WAV float32 (fmt 3), 44.1 kHz estéreo, duración exacta |
| `output vs pedalboard-read(input)` | **0 / 3,969,000 muestras diferentes · maxdiff 0.0** |

El engine escribe "los samples leídos" tal cual (engine.py neutral fast-path, `sf.write(subtype="FLOAT")`). La salida es **byte-idéntica al audio en el dominio del engine** (pedalboard `AudioFile.read`).

> Nota metodológica: comparar contra `wave`/soundfile da un delta ≈1e-5 — es una diferencia de **convención de conversión int16→float32 entre lectores**, no del producto. El contrato se evaluó contra el read-path real del engine (pedalboard).

## 7. E2E demo flow (Playwright, browser real) — PASS

`e2e/tests/demo_flow.spec.ts` contra backend demo `:8000` + studio dev `:3000`:

- Upload track → preset `fuego` (on-demand, DSP real) → master servido con `preset_id=fuego` → descarga WAV (RIFF) → cambio a `cinta` (multi-preset): **1 passed (20.7 s)**.

Nota: `e2e/tests/live_params.spec.ts` y `master_to_live.spec.ts` fallan en **colección** — importan `e2e/helpers/simulator` (TS) que **nunca existió** en el árbol (solo hay `simulator.py`). Defecto pre-existente, ajeno a la remoción HumanMidi; requiere crear `e2e/helpers/simulator.ts` para cubrir esos specs.

## 8. Conclusión local

- **El demo 4-min funciona correctamente en esta máquina**: gates, cache, concurrencia, on-demand y salidas íntegras.
- La máquina local (16 GB) tiene holgura de sobra; el safety gate quedó en 42.5% del pico teórico.
- **Hallazgo clave:** el pico de RAM por job es alto (el input de 42 MB → 6.9 GB de working set ≈ ×165). Esto no afecta lo local, pero **determina el veredicto de despliegue** (ver `../runbooks/DEMO_DEPLOYMENT_PLAN.md`).