# AGENTS.md — Guía para agentes de código

Este repo es **IA-first**: está diseñado para que agentes (Claude Code, Codex, OpenCode, Hermes, etc.) trabajen sin romper nada. Leé esto completo antes de escribir código.

## Qué es esto

**midiMastering** = WaveAI (mastering IA, Next.js + FastAPI) + un **Live Engine** Web Audio standalone (controlado por knobs) para tocar el master final con FX en tiempo real.

Pipeline: `Upload → WaveAI Mastering (audiomind) → Master WAV → Studio Live Engine (Web Audio) → Knobs/Meters/Audio`

## LEER PRIMERO (obligatorio antes de escribir código)

0. `docs/SETUP.md` — runbook de entorno verificado (venv, bun, Convex, stack local, pitfalls reales). Seguilo literal si el entorno no está levantado.
1. `docs/INTEGRATION_REPORT.md` — estado del bloque de integración.
2. Según el área: `docs/hackaton-specs/03_waveai_backend_mastering.md` (backend mastering), `04_waveai_sistema_diseno.md` (sistema de diseño).

## Mapa del repo

| Ruta | Stack | Rol |
|---|---|---|
| `apps/studio/` | Next.js 16 + React 19 + TS + Tailwind 4 | Mastering UI + pestaña Live (Web Audio) |
| `apps/audiomind/` | Python/FastAPI, librosa, pedalboard | DSP de mastering (análisis + cadena de 13 etapas) |
| `packages/contracts/` | JSON Schema + generador | `live_params.schema.json` = fuente de verdad |
| `e2e/` | Playwright | master → live |

## Reglas NO negociables

- **`packages/contracts/live_params.schema.json` es la fuente de verdad** del protocolo. Si cambia, regenerá tipos con `packages/contracts/scripts/gen_types.sh` (TS → `studio/src/lib/live/liveParams.gen.ts`). Nunca edites los tipos generados a mano.
- **Neutral = bypass**: en el backend, parámetro neutral = audio idéntico (bypass bit-exacto); en el Live Engine, defaults del schema = master idéntico al original. Preservalo en TODAS las rutas.
- **Todo cambio de parámetro Web Audio con `setTargetAtTime(value, ctx.currentTime, 0.02)` — NUNCA asignación directa** (anti-zipper).
- **Escalado logarítmico del filtro**: rango 200 Hz–12 kHz ≈ 6 octavas (la UI/knob escala logarítmicamente; lineal produce saltos).
- **Sesiones del backend en memoria** (dict + `SessionCache`) — se pierden al reiniciar el backend. `ProcessingStatus`: `uploaded → analyzing → processing → completed | error`.
- **Los knobs del Live Engine NO son `MasteringParameters`** — no reprocesar el track; son nodos Web Audio.
- **El limiter es 8× oversampling** (si tocás MasteringGuide escribí 8×, no 4×).
- **Microcopy en español rioplatense** (voseo): "Subí", "Ajustá", "Probá de nuevo".
- **SOLID**: SRP por módulo, Strategy para slots FX, DIP hacia los contratos.

## Comandos de verificación (corré esto antes de declarar algo terminado)

```bash
# Backend
cd apps/audiomind && pytest tests/ -q
uvicorn audiomind.main:app --port 8000   # → curl localhost:8000/health

# Studio
cd apps/studio && npm run build && npm run lint
npm run dev                               # http://localhost:3000

# Integral
npm run e2e                               # desde apps/studio
```

## Convenciones

- Commits semánticos (`feat:`, `fix:`, `test:`, `docs:`, `chore:`).
- Tests junto al código; no rompas la suite existente.
- Backend: pyproject con ruff + mypy strict (`apps/audiomind/pyproject.toml`).
- Los WAV/MP3 de prueba van a `uploads/`/`outputs/` (gitignored) o se generan con `apps/audiomind/scripts/generate_samples.py` y `e2e/fixtures/generate_fixture.py`.
