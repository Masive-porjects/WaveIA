# 🎛️ midiMastering

**Mastering asistido por IA + Live Engine controlado por gestos.**

Unión de dos proyectos:
1. **BrikMaster** — estudio de mastering IA (Next.js + FastAPI): subís WAV/MP3 → el backend analiza (loudness, espectro, tempo, género) → corre una cadena DSP proporcional → master WAV/MP3 con player A/B.
2. **HumanMidi** — app Python que convierte gestos de la mano (MediaPipe) en MIDI en tiempo real.

**La unión:** BrikMaster masteriza primero (offline, una vez). El master se carga en un **Live Engine** (Web Audio API en el navegador) con cadena de FX en tiempo real (filtro → drive → delay/echo → reverb). Un **bridge** Python escucha el puerto MIDI virtual de HumanMidi y traduce los gestos (CC) a `LiveParams` que envía por WebSocket al navegador. Todo en una misma interfaz (pestaña "Live" del studio).

```
Camera → MediaPipe Hands → Gesture → MIDI CC → Bridge (smoother) → WS :8765 → Studio Live Engine (Web Audio) → Knobs / Meters / Audio
```

## Estructura del monorepo

```
midiMastering/
├── apps/
│   ├── studio/          # Next.js (App Router + TS + Tailwind) — mastering UI + pestaña Live
│   ├── humanmidi/       # Python — visión + gestos → MIDI (entry: run.py)
│   ├── bridge/          # Python — MIDI → LiveParams → WebSocket :8765
│   └── audiomind/       # Python/FastAPI — backend DSP de mastering (AudioMind)
├── packages/
│   └── contracts/       # live_params.schema.json (fuente de verdad) + generador de tipos
├── simulator/           # emisor de LiveParams sintéticos (desarrollo/demo sin cámara)
├── e2e/                 # Playwright — master → live
└── docs/
    ├── INTEGRATION_REPORT.md    # reporte del bloque de integración
    └── hackaton-specs/          # specs 01–08 (diseño, backend, live engine, implementación)
```

## Quickstart

### 1. Backend mastering (apps/audiomind) — puerto 8000

```bash
cd apps/audiomind
python3.12 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
uvicorn audiomind.main:app --port 8000
# verify: curl localhost:8000/health
```

### 2. Studio (apps/studio) — puerto 3000

```bash
cd apps/studio
npm install
npm run dev        # http://localhost:3000 — subir WAV → masterizar → pestaña Live
```

### 3. Bridge (apps/bridge) — WS :8765

```bash
cd apps/bridge
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python main.py     # escucha MIDI + WS :8765
```

### 4. Simulador (sin cámara, para la demo)

```bash
python -m simulator.main --mode server --scenario presets   # desde la raíz
```

### 5. HumanMidi (apps/humanmidi) — requiere webcam + puerto MIDI virtual

```bash
cd apps/humanmidi
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python run.py --list-midi
python run.py --mode studio      # gestos → CC 74/92/71/73/16 + palmadas → fx_preset
```

## Tests

```bash
cd apps/audiomind && pytest tests/ -q        # DSP + API
cd apps/bridge   && pytest tests/ -q         # bridge
cd apps/humanmidi && pytest tests/ -v        # gestos → MIDI
npm run e2e                                   # playwright (desde apps/studio)
```

## Docs

- `docs/hackaton-specs/08_implementacion_llm.md` — el prompt de implementación completo (fases, valores DSP exactos, criterios de éxito, pitfalls). **LEERLO ANTES DE TOCAR CÓDIGO.**
- `docs/hackaton-specs/01..07` — visión unificada, HumanMidi, backend mastering, sistema de diseño, live engine, roadmap, estrategia de equipo.
- `docs/INTEGRATION_REPORT.md` — estado del bloque de integración (BrikMaster × midiMastering).

> AGENTS.md en la raíz tiene las reglas no negociables para agentes de código. Respetalas.
