# 🎵 Hackaton midiMastering — Documentación de Mastering

> **WaveAI:** el estudio **masteriza** la canción (backend FastAPI) y el resultado se **toca en vivo** en el Live Engine Web Audio (knobs) del studio — todo en una misma interface.

Este índice reúne la documentación de arquitectura que sobrevive del hackaton. Los specs de visión/gestos y de control en tiempo real fueron **eliminados** en el cleanup: el Live Engine es standalone (knobs).

| Doc | Contenido |
|-----|-----------|
| [03_waveai_backend_mastering.md](03_waveai_backend_mastering.md) | Capa de producción: backend de mastering (FastAPI) |
| [04_waveai_sistema_diseno.md](04_waveai_sistema_diseno.md) | Sistema de diseño del studio (Next.js) |

---

## 🏗️ Mapa del ecosistema en una línea

```
[Track original] ──► [WaveAI: master offline (~44 s)] ──► [Master WAV]
                                                            │
                    [Studio Live Engine (knobs): Filtro → Drive → Delay/Echo → Reverb]
                                                            │
                                                    [Salida en vivo: master + FX en una sola interface]
```

**WaveAI** es la *fase offline*: convierte el mix en un master listo para plataformas (target LUFS por plataforma).
**Live Engine** es la *fase en vivo*: el master se reproduce y los knobs mueven las perillas de reverb, delay, echo, filtro y drive en tiempo real (Web Audio en el navegador).

---

## ⚡ Resumen rápido

### Fase offline — WaveAI (Next.js + FastAPI)
- **Pipeline:** `Upload (WAV/MP3 ≤50MB) → Análisis librosa → DSP chain proporcional → Master WAV/MP3`
- **Filosofía:** motor **proporcional, no preset-driven** — los presets definen carácter; los valores DSP se calculan por track
- **Detalle:** 13 etapas DSP (gain staging, match EQ, comp, multiband, dyn EQ, exciter, tape, spatial, clipper 16×, truepeak 8×, dither), sesiones en memoria, `ThreadPoolExecutor(4)`
- **Presets:** 8 macro (Universal, Fuego, Claridad, Cinta, Natural, Espacial, Cinemático, Empuje) con lookup prebuilt ~1.5 s

### Fase en vivo — Live Engine (Web Audio, standalone)
- **Live Engine (Web Audio API en el navegador):** el master WAV se reproduce con cadena de FX en tiempo real:
  - **Knob Filtro** (cutoff 200 Hz – 12 kHz)
  - **Knob Reverb** (mix 0–100 %)
  - **Knob Delay** (50–800 ms)
  - **Knob Echo feedback** (0–0.8)
  - **Knob Drive** (0–1)
  - **Presets** de FX (Clean, Dub, Big Room, Radio)
- **Control:** knobs (mouse/teclado) → `LiveParams` → nodos Web Audio (`setTargetAtTime`); el audio nunca viaja por la red
- **Interface única:** pestaña "Live" del studio con cadena de FX con Knob3D, meters de salida y grabación/descarga del resultado

---

## 🔗 Fuentes

- `MASTERING_ECOSYSTEM_SPEC.md` (WaveAI) — spec completa verificada contra código

*Fecha: 2026-08-20 · Documento generado para el hackaton midiMastering · Actualizado 2026-09-08 (post-cleanup).*