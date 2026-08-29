# Knowledge / Roadmap

## Propósito
Mantener el plan de evolución técnica y de producto de AudioMind como conocimiento estructurado y consultable.

## Responsabilidad
- Documentar hitos, dependencias y criterios de done por fase
- Registrar decisiones arquitectónicas (ADR) que afectan el roadmap
- Mapear capacidades actuales vs. objetivo por módulo (A/B/C/D)
- Servir como fuente de verdad para planificación de agentes y humanos

## Estructura de archivo
```
roadmap/
├── phase-1-mvp.md              # Mastering + License + Frontend (actual)
├── phase-2-stem-isolation.md   # Módulo B: Demucs/Spleeter + 4 faders
├── phase-3-vocal-sculptor.md   # Módulo C: Pedalboard vocal chain
├── phase-4-beat-engine.md      # Módulo D: SongStarter algorítmico
├── phase-5-ml-intelligence.md  # Genre detector + Preset recommender + RAG
├── phase-6-platform.md         # Multi-user, colab, marketplace, API
├── adr/
│   ├── 001-dsp-engine-pedalboard.md
│   ├── 002-license-key-header.md
│   ├── 003-web-audio-realtime.md
│   └── 004-postgres-over-sqlite.md
└── milestones.md               # Fechas objetivo, métricas de éxito
```

## Ejemplos de contenido
- **phase-2-stem-isolation.md**: "Objetivo: Separar stereo mix → 4 stems (vocals, drums, bass, other). Backend: Demucs v4 HTDemucs (4 stems). Frontend: 4 faders verticales con M/S, WaveSurfer por stem. Done: < 60s procesamiento 4min track, SNR > 40dB vs original."
- **adr/001-dsp-engine-pedalboard.md**: "Decisión: Pedalboard (Spotify) como motor DSP principal. Razón: Rust backend, calidad profesional, chain serial nativo. Trade-off: Windows build complexity. Mitigación: Librosa fallback chain."

## Futuras integraciones
- **Product Strategist Agent**: Lee roadmap/ para proponer siguiente slice
- **Innovation Agent**: Cross-reference roadmap/ con ideas/ y experiments/
- **Chief Audio Engineer**: Valida que roadmap técnico sirve a philosophy/
- **RAG**: Responde "¿cuándo tendrán stem separation?" con datos reales