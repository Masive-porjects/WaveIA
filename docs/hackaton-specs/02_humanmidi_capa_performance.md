# 02 — Idea 1 · HumanMidi: Capa de Performance (Gestos → MIDI)

> Fuente: `README.md`, `ARCHITECTURE.md`, `PROJECT_SUMMARY.md`

## 1. Qué es

HumanMidi es una aplicación Python que convierte gestos de las manos en MIDI en tiempo real. La cámara capta las manos, MediaPipe las rastrea (21 landmarks), y un puerto MIDI virtual convierte los gestos en notas y controladores que cualquier DAW recibe (FL Studio, Ableton, Logic, GarageBand).

## 2. Pipeline de datos

```
[Cámara] → [CameraHandler] → [HandDetector (MediaPipe)] → [GestureDetector (Strategy)]
                                                                    │
                                                                    ▼
[DAW] ← [MidiSender (RtMidi)] ← [GestureMapper] ← [GestureEvent]
```

| Paso | Módulo | Responsabilidad (SRP) |
|------|--------|----------------------|
| 1. Captura | `src/core/camera_handler.py` | `read_frame()` → numpy.ndarray BGR |
| 2. Detección | `src/core/hand_detector.py` | `detect(frame)` → List[HandLandmarks], dedos extendidos |
| 3. Reconocimiento | `src/gestures/*.py` | `detect(landmarks)` → GestureEvent |
| 4. Mapeo | `src/mappers/gesture_mapper.py` | Evento → mensaje MIDI (Note On/Off, CC, Pitch Bend) |
| 5. Envío | `src/core/midi_sender.py` | Puerto virtual → DAW |

**Orquestación:** `HumanMidiApp` (`src/main.py`) es un *Facade* que coordina cámara, detector, gesto activo, mapper y visualizer. **Entry point obligatorio:** `run.py` (añade la raíz al `sys.path`; `src/main.py` directo falla por resolución de imports).

## 3. Modos de gesto (Strategy Pattern)

Todos implementan `BaseGesture` (abstracto, interfaz mínima ISP) → extensible sin tocar código existente (OCP).

### 🥁 Drums — palmadas → batería (4 zonas por posición X)
| Zona | Drum | Nota GM |
|------|------|---------|
| 0 Izquierda | Kick | 36 |
| 1 Centro-izq | Snare | 38 |
| 2 Centro-der | Hi-Hat cerrado | 42 |
| 3 Derecha | Crash | 49 |

Velocity = velocidad del movimiento (20–127). Cooldown de 10 frames entre hits (anti doble disparo).

### 🎹 Piano — dedos extendidos → notas; altura de mano → octava (2–6)
| Dedo | Nota | Offset |
|------|------|--------|
| Pulgar | C | +0 |
| Índice | D | +2 |
| Medio | E | +4 |
| Anular | F | +5 |
| Meñique | G | +7 |

Estado independiente por mano + **anti-notas-colgadas**: si la mano sale del frame, se envían todos los Note Off.

### 🎛️ CC Thumbs ⭐ (recomendado) — pulgares independientes → CC
- 👍 Pulgar izquierdo → CC 92 → Delay Send (magenta) — arriba 127, abajo 0
- 👍 Pulgar derecho → CC 74 → Filter Cutoff (cyan) — arriba 127, abajo 0
- Ambos CC en el mismo frame, uno por mano presente; suavizado + dead zone (anti-jitter); rango completo 0–127 fácil de barrer.

### 🎛️ CC Controller (legacy) — una mano, 3 parámetros
| Gesto | Parámetro |
|-------|-----------|
| Altura del índice | Filter/Brightness (CC 74) |
| Mano abierta/cerrada | Modulation (CC 1) |
| Posición X | Pitch Bend |

## 4. Principios SOLID aplicados

1. **SRP** — cada clase tiene una razón de cambio (cámara, detección, gesto, mapeo, envío).
2. **OCP** — nuevo gesto = nueva clase `class MyGesture(BaseGesture)`, sin tocar lo existente.
3. **LSP** — cualquier detector sustituye a otro vía `BaseGesture`.
4. **ISP** — `BaseGesture` define interfaz mínima; no obliga a métodos innecesarios.
5. **DIP** — `GestureMapper` depende de la abstracción `MidiSender`, no de la concreción.

Patrones adicionales: **Strategy** (gestos intercambiables), **Facade** (`HumanMidiApp`), **Factory implícito** (`Settings` construye configs).

## 5. Configuración

`config/config.yaml` con **deep-merge** sobre defaults (`src/config/defaults.py`) — solo declaras lo que cambias. Soporta YAML y JSON.

| Sección | Qué ajusta |
|---------|-----------|
| `midi` | Puerto virtual, canal (0–15), velocity |
| `camera` | Device ID, resolución, FPS |
| `hand_detector` | Model complexity (0 rápido / 1 preciso), confianzas, máx. manos |
| `gestures.drums` | Notas GM, nº zonas, umbral trigger |
| `gestures.piano` | Octava base, velocity, rango |
| `gestures.cc_controller` | Suavizado, umbral de cambio, mappings CC |
| `ui` | Landmarks, bbox, zonas, FPS, colores |

## 6. Estructura del proyecto

```
run.py                     # Entry point (añade raíz al sys.path)
quick_start.py             # Launcher interactivo (menú de modos)
config/config.yaml         # Configuración principal
src/
├── main.py                # Orquestación (HumanMidiApp — Facade)
├── core/                  # camera_handler, hand_detector, midi_sender
├── gestures/              # base_gesture, drums, piano, cc_thumbs, cc_controller
├── mappers/               # gesture_mapper, zone_mapper
├── ui/                    # visualizer, console
└── config/                # settings, defaults
tests/                     # test_midi_sender, test_hand_detector, test_gestures
```

## 7. MIDI virtual por plataforma

- **macOS:** Configuración Audio MIDI → IAC Driver → nombrarlo "HumanMidi"
- **Windows:** loopMIDI → puerto virtual "HumanMidi"
- El nombre se configura en `config.yaml → midi.virtual_port_name` y debe coincidir con el DAW.

## 8. Notas críticas (pitfalls)

- **MediaPipe fijado a `0.10.14`.** 0.10.9 no tiene wheels para Python 3.12+; 0.10.21+ depreca `mp.solutions.hands` (eliminado en 0.10.35). No subir de versión sin adaptar el código.
- **Siempre `run.py`, nunca `src/main.py`** directo (imports).
- **26 tests:** `pytest tests/ -v`.

## 9. Testing y rendimiento

- Tests unitarios por módulo core; cobertura 100% en core (según PROJECT_SUMMARY).
- Optimizaciones: `model_complexity=0` para rapidez, frame skipping, envío MIDI asíncrono, GPU (futuro).
