<div align="center">

<img src="apps/studio/public/brand/mascota.png" alt="WaveAI — el fantasma beige con la lágrima-nota" width="160">

# WaveAI

**Estudio de mastering asistido por IA + Live Engine controlado por gestos.**

<sub>El fantasma beige `#D6C9A9` es la mascota y el favicon de la app.</sub>

</div>

---

## Qué es

WaveAI es una sola interfaz de mastering IA:

1. **Studio de mastering IA** — subes un WAV/MP3, el backend analiza (loudness, espectro, tempo, género) y corre una cadena DSP de 13 etapas para entregar un master profesional con player **A/B** (original vs masterizado).
2. **Live Engine** — el master se carga en un motor Web Audio en el navegador con FX en tiempo real.

**La unión:** WaveAI masteriza primero (offline, una vez). El master se carga en un **Live Engine** (Web Audio API en el navegador) con FX en tiempo real (filtro → drive → delay/echo → reverb). Un **bridge** Python traduce MIDI (CC) a `LiveParams` por WebSocket. Todo en la pestaña **"Live"** del studio.

```
MIDI Source → Bridge (smoother) → WS :8765 → Studio Live Engine (Web Audio) → Knobs/Meters/Audio
```

## Mapa del repo

| Ruta | Stack | Rol |
|---|---|---|
| `apps/studio/` | Next.js 16 + React 19 + TS + Tailwind 4 | Mastering UI + pestaña Live (Web Audio) |
| `apps/audiomind/` | Python/FastAPI, librosa, pedalboard | DSP de mastering (análisis + cadena de 13 etapas) |
| `apps/bridge/` | Python, websockets, rtmidi | MIDI → `LiveParams` → WS :8765 |
| `packages/contracts/` | JSON Schema + generador | `live_params.schema.json` = fuente de verdad |
| `simulator/` | Python | Emisor de `LiveParams` sintéticos |
| `e2e/` | Playwright | master → live |
| `docs/` | Markdown | Especificaciones, setup, reportes de integración — índice central en [`docs/README.md`](docs/README.md) |

## Compliance Phase 1 (feature destacada)

Documentada en detalle en [`docs/reference/COMPLIANCE_PHASE1.md`](docs/reference/COMPLIANCE_PHASE1.md). Agrega al motor y a la UI:

- **Modo Transparente** (`processing_mode: "transparent"`): passthrough bit-exacto — si ningún parámetro cambia el audio, el master es idéntico al original (regla "neutral = bypass").
- **`platform_target`**: `spotify`, `apple_music`, `youtube`, `tidal`, `custom` — aplica defaults de loudness/ceiling (Spotify → −14 LUFS / −1.0 dBTP, Apple Music → −16 / −1.0, etc.) con espejo en la UI vía `PLATFORM_DEFAULTS`.
- **`output_sr` / `output_bit_depth`**: `same_as_input`, `44100`, `48000`, `96000` y bits (default 24). Round-trip 48k → 44.1k verificado.
- **`strict_mode`**: si el material viene dañado (clipping / true peak ≥ −0.3 dBTP) el backend rechaza con HTTP 422 y el frontend muestra el detalle (antes lo perdía).

### UI del studio

- **8 presets de carácter**: Pulido, Brutal, Cristalino, Vintage, Crudo, Envolvente, Épico, Muro — cada uno con género, descripción y tooltip; la cache de masters por preset hace instantáneo volver a uno ya escuchado (se limpia automáticamente al cambiar de track — fix `f25f7e8`).
- **Panel de entrega flotante**: FAB "Entrega" (abajo a la derecha) → modo/plataforma/SR/bits/QC estricto en un sheet que no ensucia el lienzo.
- **Reporte del motor flotante**: píldora compacta abajo a la izquierda con `LUFS · dBTP · SR · bits` que se expande a la tarjeta completa (`MasteringReportCard`).
- **Chip de track con género**: en la navbar muestra el **género detectado** (reggaetón, pop, rock…) en vez del UUID interno del archivo.
- **Marca WaveAI**: textos visibles (navbar, welcome gate, drawer, guía, compartir) — los assets `public/brand/WaveAI.svg` y `WaveAI.png` alimentan la tarjeta de compartir. El favicon es el fantasma beige con ojos (`src/app/icon.svg`).

## Cómo correr localmente

Sigue literal `docs/runbooks/SETUP.md` si el entorno no está levantado (venv, bun, stack local, pitfalls reales).

```bash
# Backend (DSP de mastering)
cd apps/audiomind && uvicorn audiomind.main:app --port 8000
# → http://localhost:8000/health = {"status":"ok","service":"AudioMind"}

# Frontend (studio)
cd apps/studio && bun install && bun run dev
# → http://localhost:3000

# Bridge (Live Engine)
cd apps/bridge && python -m src.main             # WS :8765
```

**Windows — un solo click** (`scripts/`): doble click en `scripts\start\start-all.bat` hace todo — si falta el entorno corre el setup primero (`.venv`, deps Python, `bun install`, build de `apps/agent`, `.env.local`) y luego levanta los 3 servicios en ventanas separadas con health checks incluidos. `scripts\stop\stop-all.bat` los detiene. Opciones: `scripts\setup\setup.bat` corre solo el setup; por defecto el Live Engine usa el simulator en WS :8765 (sin hardware MIDI); con `-Bridge` arranca el bridge real para un controlador MIDI.

**Docker** (sin instalar Python/bun en el host):

```bash
docker compose up --build   # studio :3000 + audiomind :8000 + simulator :8765
```

Detalles y decisiones (por qué el bridge no va en contenedor, volúmenes, build-args): `docs/runbooks/DOCKER.md`.

## Verificación

```bash
# Backend
cd apps/audiomind && pytest tests/ -q
uvicorn audiomind.main:app --port 8000           # → curl localhost:8000/health

# Bridge
cd apps/bridge && pytest tests/ -q

# Studio (lint + build)
cd apps/studio && npm run lint && npm run build

# Integral
python -m simulator.main --mode server --scenario sweep   # desde la raíz
npm run e2e                                               # desde apps/studio
```

> Nota lint: `eslint src` reporta 0 errores (34 warnings no-funcionales). Los 2 errores históricos (`page.tsx`, `useRole.ts`) fueron corregidos con el patrón de ajuste de estado durante render / lazy init.

## Reglas no negociables

- **`packages/contracts/live_params.schema.json` es la fuente de verdad** del protocolo — regenera tipos con `packages/contracts/scripts/gen_types.sh`, nunca edites los generados a mano.
- **Neutral = bypass**: parámetro neutral = audio idéntico (bit-exacto en backend, defaults del schema en Live Engine).
- **El audio NUNCA viaja por el socket** — solo `LiveParams` y estado; mensajes completos, el último estado gana.
- **`setTargetAtTime` siempre** (nunca asignación directa en Web Audio — anti-zipper).
- **Microcopy en español latino neutro/colombiano** (sin voseo): "Sube tu audio", "Ajusta", "Prueba de nuevo".
- **Commits semánticos** (`feat:`, `fix:`, `test:`, `docs:`, `chore:`), sin atribución AI.

## Advertencias operativas (importantes)

- **Sesiones en memoria** (dict + `SessionCache`): se pierden al reiniciar el backend, salvo el espejo best-effort a `uploads/sessions.json`. En Railway solo sobreviven si hay volume montado en `/app/uploads`.
- **`outputs/` NO está en el volume**: los masters generados (`{session_id}_mastered.wav`) se pierden en un redeploy aunque los uploads sobrevivan. Pendiente de decisión: historial/retención de sesiones.
- **Frontend** restaura 1 sola sesión desde `localStorage` (`waveai-session`); si el backend no la tiene → aviso "Tu sesión anterior expiró".

## Convenciones

- Commits semánticos; tests junto al código; no romper la suite existente.
- Backend: `pyproject` con ruff + mypy strict.
- WAV/MP3 de prueba van a `uploads/`/`outputs/` (gitignored) o se generan con `apps/audiomind/scripts/generate_samples.py` y `e2e/fixtures/generate_fixture.py`.