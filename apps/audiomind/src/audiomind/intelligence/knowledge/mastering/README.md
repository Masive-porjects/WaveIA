# Knowledge / Mastering

## Propósito
Documentar el conocimiento técnico profundo del proceso de mastering: pipeline, estándares, target curves, mejores prácticas y decisiones de ingeniería que definen el "sonido AudioMind".

## Responsabilidad
- Especificar el pipeline de mastering canónico (orden, plugins, parámetros por etapa)
- Documentar target curves por género (Match EQ references)
- Definir estándares de entrega: LUFS, True Peak, sample rate, bit depth, dithering
- Registrar decisiones de ingeniería: por qué este ceiling, por qué este attack time
- Servir como referencia técnica para DSP Designer, Chief Audio Engineer, y validación ML

## Estructura de archivo
```
mastering/
├── pipeline.md               # Pipeline canónico: etapas, orden, parámetros base
├── standards.md              # Entrega: -14 LUFS streaming, -9 LUFS club, -1dBTP, 44.1/48k, 24bit, dither
├── target_curves/
│   ├── trap_target_curve.md  # Freq response target para match EQ
│   ├── edm_target_curve.md
│   ├── rock_target_curve.md
│   ├── pop_target_curve.md
│   ├── acoustic_target_curve.md
│   └── index.md              # Tabla resumen
├── ceiling_strategy.md       # Crest factor analysis → dynamic ceiling (-2dBTP para over-compressed)
├── dithering.md              # Lipshitz 2nd order noise shaping: cuándo, parámetros, validación
├── true_peak.md              # Oversampling 4x, lookahead, ceiling safety margin
├── already_mastered_detection.md  # Heurística + ML: crest factor + LUFS + TP → skip/lighten
├── quality_gates.md          # Checks obligatorios pre-export: LUFS ±0.5, TP ≤ -1, no clips, phase
├── reference_tracks.md       # Tracks de referencia calibrados por género (path, LUFS, genre, notes)
└── decisions/
    ├── DEC-001_limiter-ceiling.md
    ├── DEC-002_saturation-before-comp.md
    ├── DEC-003_match-eq-pink-noise-slope.md
    └── index.md
```

## Contenido clave por archivo
- **pipeline.md**: "1. Analyze (LUFS, TP, crest, genre) → 2. Safety (ceiling adjust if over-compressed) → 3. Corrective EQ (resonancias, mud) → 4. Character (preset chain: sat/comp/EQ/stereo) → 5. Match EQ (genre target curve) → 6. Final Limiter (true peak -1dBTP) → 7. Dither (Lipshitz 2nd) → 8. Validate (quality gates)"
- **standards.md**: "Streaming: -14 LUFS ±0.5, -1 dBTP, 44.1kHz/24bit. Club: -9 LUFS ±0.5, -0.5 dBTP, 48kHz/24bit. CD: -9 LUFS, -0.3 dBTP, 44.1kHz/16bit + dither. Archival: -18 LUFS, -3 dBTP, 96kHz/32bit float."
- **decisions/DEC-001_limiter-ceiling.md**: "Decisión: Ceiling dinámico basado en crest factor. Si crest_in < 10dB → ceiling = -2dBTP (ya comprimido). Si crest_in > 15dB → ceiling = -1dBTP. Razón: Evita over-limiting material ya masterizado. Validado en EXP-002."

## Futuras integraciones
- **DSP Designer Agent**: Implementa pipeline.md literal; consulta decisions/ para justificar params
- **Chief Audio Engineer**: Audita pipeline.md vs práctica actual; propone DEC-XXX nuevos
- **ML Preset Recommender**: Features incluyen adherence to pipeline stages
- **Match EQ Module**: Carga target_curves/*.md como referencia
- **Quality Assurance**: Tests automatizados contra quality_gates.md
- **RAG**: "¿Por qué -14 LUFS?" → standards.md + streaming normalization spec