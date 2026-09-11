# HumanMidi Removal Report

> **Date:** 2026-09-11
> **Branch:** `demo/vercel-railway-client`
> **Verdict:** HumanMidi active runtime = 0. No camera access from Studio.

---

## 1. Directorios eliminados

| Directorio | Descripción | Archivos |
|-----------|-------------|----------|
| `apps/humanmidi/` | App completa: visión (MediaPipe), hand tracking, gesture engine, MIDI sender, UI, tests, config | 29 archivos |

Estructura delimitada: `src/core/`, `src/gestures/`, `src/mappers/`, `src/ui/`, `src/config/`, `config/config.yaml`, `tests/`, `requirements.txt`, `run.py`, `src/__init__.py`.

---

## 2. Archivos eliminados

| Archivo | Propósito |
|---------|-----------|
| `docs/hackaton-specs/02_humanmidi_capa_performance.md` | Spec exclusiva de HumanMidi (capa de performance: gestos → MIDI) |
| `scripts/start/start-humanmidi.bat` | Script de arranque Windows exclusivo |
| `apps/studio/src/presentation/components/live/CameraOverlay.tsx` | Overlay de cámara: getUserMedia + MediaPipe landmarks. **Causa del request de cámara** |
| `apps/studio/src/presentation/components/live/GestureBadge.tsx` | Badge que mostraba qué gesto controla un parámetro |

---

## 3. Ediciones en archivos existentes

### 3.1 Studio — uso de camera/gesture eliminado

| Archivo | Cambio |
|---------|--------|
| `LiveView.tsx` | Eliminados: import CameraOverlay, `cameraError` state, handleCameraError, div del overlay de cámara, div de error. Columna 1 ahora es solo "Input" (fuente de audio) |
| `FxSlotPanel.tsx` | Eliminados: import GestureBadge, dos call sites de `<GestureBadge ...>` (slot principal + secundario) |

### 3.2 Scripts de arranque y verificación

| Archivo | Cambio |
|---------|--------|
| `scripts/start/start-one.ps1` | ValidateSet de `["audiomind", "bridge", "humanmidi", "studio"]` → `["audiomind", "bridge", "studio"]`. Entrada `humanmidi` eliminada del mapa de servicios |
| `scripts/start/start-all.ps1` | Eliminado `& "$PSScriptRoot\start-one.ps1" -Name "humanmidi"` |
| `scripts/verify/verify-all.ps1` | Eliminado `Wait-ForService "humanmidi" { Test-ProcessAlive "humanmidi" }` |
| `apps/bridge/src/main.py` | Docstring `--midi-port "HumanMidi"` → `"loopMIDI"` |
| `simulator/midi_injector.py` | Docstring: `HumanMidi → Puerto MIDI Virtual → Bridge` → `MIDI Source → Puerto MIDI Virtual → Bridge`. Comentario del CC map: `match Bridge/HumanMidi` → `match Bridge/Live Protocol` |

### 3.3 Documentación principal (docs activos)

| Archivo | Cambio |
|---------|--------|
| `AGENTS.md` | Línea "midiMastering = ... + HumanMidi..." → "WaveAI = mastering IA + Live Engine"; pipeline quitó Camera/MediaPipe; fila `apps/humanmidi/` eliminada del mapa; reglas `mediapipe==0.10.14` + entry point de HumanMidi eliminadas; verificación # HumanMidi eliminada; SOLID quitó "gestos" |
| `README.md` | "Une dos proyectos" → "solución unificada"; HumanMidi reemplazado por "Live Engine"; pipeline quitó Camera/MediaPipe; fila humanmidi eliminada del mapa; ejecución y tests HumanMidi eliminados; regla mediapipe eliminada |
| `docs/SETUP.md` | Stack quitó HumanMidi; Python 3.12 motivo actualizado; fila macOS arm64 eliminada (mediapipe); instalación venv quitó requirements de humanmidi + mediapipe (linea de filtro); esperado cambió `import rtmidi, websockets, mido`; T4 ahora es solo Simulator; pytest humanmidi eliminado; pitfalls 1-3 (mediapipe) eliminados; estado conocido: humanmidi "bloqueado" → "removido" |
| `docs/UX_MAP.md` | Diagrama mermaid: `CameraOverlay<br/>MediaPipe + gestos` → `Input<br/>fuente de audio` |
| `docs/USER_MANUAL.md` | Sección Live Engine: "Cámara → MediaPipe → gestos → bridge MIDI" → "Bridge MIDI" |
| `docs/INTEGRATION_REPORT.md` | Architectura/Tree: columna humanmidi eliminada, fila humanmidi eliminada del árbol, CameraOverlay/GestureBadge eliminados de la UI list. Blocks Summary: Block B marcado `❌ Removed (2026-09-11)`. Sección Block B reemplazada con nota de eliminación + archivo histórico. Next Steps: "MIDI controller + camera" → "MIDI controller". CameraOverlay eliminado de hardening + lint list. Commit humanmidi marcado `removed 2026-09-11` |

### 3.4 Specs históricos (con header de deprecación, contenido preservado)

| Archivo | Header añadido |
|---------|---------------|
| `docs/hackaton-specs/README.md` | "HumanMidi fue REMOVIDO del producto"; idea 1 tachada; archivo `02_humanmidi` eliminado del índice |
| `docs/hackaton-specs/01_vision_unificada.md` | "⚠️ 2026-09-11 · DOCUMENTO HISTÓRICO: HumanMidi removido" |
| `docs/hackaton-specs/05_live_engine_gestos_a_master.md` | "⚠️ 2026-09-11 · ACTUALIZADO: HumanMidi removido; Live Engine se conserva, efectos controlados por MIDI (externo o Simulator)" |
| `docs/hackaton-specs/06_roadmap_unificado.md` | "⚠️ 2026-09-11 · DOCUMENTO HISTÓRICO: HumanMidi removido" |
| `docs/hackaton-specs/07_estrategia_equipo_5devs.md` | "⚠️ 2026-09-11 · DOCUMENTO HISTÓRICO: HumanMidi (Dev 4) removido" |
| `docs/hackaton-specs/08_implementacion_llm.md` | "⚠️ 2026-09-11 · ACTUALIZADO: fases de visión/cámara/gestos no implementar; WaveAI + Live Engine + Bridge + Simulator vigentes" |
| `PLAN.md` | "⚠️ 2026-09-11: HumanMidi removido; Live Engine y Bridge mantienen" |
| `docs/WORKPLAN.md` | "⚠️ 2026-09-11: HumanMidi removido" |

---

## 4. E2E config

| Archivo | Cambio |
|---------|--------|
| `e2e/playwright.config.ts` | Eliminados: `permissions: ['camera']`, flags `--use-fake-ui-for-media-stream`, `--use-fake-device-for-media-stream`. Conservados: `--autoplay-policy=no-user-gesture-required`, `--allow-file-access-from-files`, `--mute-audio` |

---

## 5. Dependencies eliminadas

| Paquete | Motivo | Aparecía en |
|---------|--------|-------------|
| `mediapipe` (pin 0.10.14/0.10.33) | Hand tracking via MediaPipe | `apps/humanmidi/requirements.txt`, docs/SETUP.md, 08_implementacion_llm |
| `opencv-python` | Captura de cámara | `apps/humanmidi/requirements.txt` |

**Paquetes que se conservan** (no son exclusivos de HumanMidi):
- `python-rtmidi` — usado por `apps/bridge/` y `simulator/` (Live infra)
- `websockets` — usado por `apps/bridge/` (Live infra)
- `mido` — usado por `simulator/` (Live infra)
- `numpy` — usado por `apps/bridge/` y `apps/audiomind/` (DSP core)
- `PyYAML` — usado por `apps/bridge/` (Live config)

---

## 6. Referencias restantes (todas legítimas o históricas)

### 6.1 Protocolo Bridge/Live (propietario: Live Engine — MANTENER)

| Archivo | Línea | Campo |
|---------|-------|-------|
| `apps/bridge/src/ws_server.py` | 70 | `ws://` log string (server address) |
| `apps/bridge/src/main.py` | 54, 205 | `ws://` log + docstring |
| `simulator/mock_bridge.py` | 99, 136 | `ws://` log + `"gesture_mode": "studio"` (hello protocol) |
| `apps/studio/src/adapters/live/liveSocket.ts` | 11, 26, 41, 64, 190 | `gesture_mode: string` protocol field, `ws://localhost:8765` |
| `apps/studio/src/adapters/live/useLiveEngine.ts` | 62 | `wsUrl = 'ws://localhost:8765'` |
| `apps/bridge/src/latency.py` | 24, 34 | RTT WebSocket measurement (ping/pong) |

### 6.2 getUserMedia restantes (propietario: Voice agent — NO CÁMARA)

| Archivo | Línea | Uso |
|---------|-------|-----|
| `apps/studio/src/lib/voice/useVoiceInput.ts` | 76 | `navigator.mediaDevices.getUserMedia({ audio: ... })` — **micrófono** para WaveAI Agent Voice. **NO** cámara |

### 6.3 Workspace / Deps / CI

| Item | Estado |
|------|--------|
| `package.json` workspaces | Solo `apps/agent`, `apps/studio` — humanmidi nunca fue workspace npm |
| `apps/audiomind/pyproject.toml` / `uv.lock` | Sin mediapipe |
| `.github/workflows/studio-ci.yml` | Solo cubre `apps/studio` — sin humanmidi |
| `apps/humanmidi/requirements.txt` | Eliminado |

### 6.4 Docs históricos (con header de eliminación)

`PLAN.md`, `WORKPLAN.md`, `docs/hackaton-specs/` (01, 05, 06, 07, 08, README) — todos portan header `⚠️ 2026-09-11 · HISTÓRICO/ACTUALIZADO` indicando que HumanMidi fue removido, con referencias a este reporte.

`DEMO_FEASIBILITY.md` — documento de factibilidad que incluyó la recomendación de eliminar HumanMidi (mantenido como evidencia de decisión).

---

## 7. Verificación final

- **`apps/humanmidi/`**: eliminado (Test-Path = False)
- **`CameraOverlay.tsx`**: eliminado (Test-Path = False)
- **`GestureBadge.tsx`**: eliminado (Test-Path = False)
- **getUserMedia cámara**: 0 (useVoiceInput.ts = audio/mic, voice agent)
- **MediaPipe references en código fuente** (py/ts/tsx): 0
- **`mediapipe` en deps**: 0
- **Studio solicita cámara**: NO (CameraOverlay eliminado, Playwright config limpia, AudioContext solo se monta en Live Engine cuando pestaña activa)
- **Live Engine WebSockets**: MANTENIDOS (bridge WS :8765, protocolo, simulator mock)

---

## 8. Objetivo alcanzado

| Criterio | Estado |
|----------|--------|
| HumanMidi active runtime | 0 |
| `apps/humanmidi/` eliminado | ✅ |
| Camera request from Studio (por HumanMidi) | 0 |
| Gesture/vision runtime | 0 |
| MediaPipe dependencies | 0 |
| WebSockets legítimos (Live Engine) | Mantenidos |
| getUserMedia cámara | 0 (solo micrófono en Voice agent) |
