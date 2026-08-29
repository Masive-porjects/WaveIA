# Knowledge / Genres

## Propósito
Definir cada género musical objetivo como perfilado por AudioMind con sus características técnicas medibles, para guiar detección automática, recomendación de presets y diseño de cadenas DSP género-específicas.

## Responsabilidad
- Características acústicas/psicoacústicas por género (BPM, energía, balance tonal, dinámica, loudness)
- Mapeo género → preset(s) recomendados con confianza
- Recomendaciones DSP específicas (qué plugins, qué rangos de parámetros)
- Servir como ground truth para Genre Classifier ML y Preset Recommender

## Estructura de archivo
```
genres/
├── trap.md
├── hip-hop.md
├── reggaeton.md
├── house.md
├── techno.md
├── edm.md
├── pop.md
├── rock.md
├── indie.md
├── jazz.md
├── classical.md
├── ambient.md
├── lofi.md
├── rnb.md
├── latin.md
├── index.md                    # Tabla: género, BPM range, LUFS target, preset primario/secundario
└── templates/
    └── genre.template.md       # (referencia a templates/genre.template.md)
```

## Formato obligatorio (ver templates/genre.template.md)
Cada genre.md **debe** contener:
- **características**: Descripción cualitativa (ej: "Kick pesado, 808 sub-bass, hi-hats rápidos, vocal upfront")
- **rango_bpm**: [min, max, typical] (ej: [130, 150, 140])
- **energía**: Escala 1-10 + descripción (ej: "9 — Alta densidad espectral, transientes agresivos")
- **balance_tonal**: Perfil espectral (ej: "Sub-bass dominante 30-80Hz, scooped mids, brillantes 8-12kHz")
- **dinamica**: Crest factor típico, DR target (ej: "Crest factor 12-18dB, DR 5-7 — muy comprimido comercial")
- **loudness_promedio**: LUFS integrated típico comercial (ej: "-8 a -6 LUFS integrated, -1 dBTP")
- **recomendaciones_dsp**: Qué cadena funciona y por qué
- **presets_compatibles**: 
  - primario: preset ID + confianza (ej: {"preset": "fuego", "confidence": 0.92})
  - secundarios: lista con confianza (ej: [{"preset": "empuje", "confidence": 0.65}, {"preset": "claridad", "confidence": 0.4}])

## Ejemplo: trap.md (resumen)
```markdown
características: "Kick/808 fused, sub-bass 30-60Hz, rolling hi-hats 1/32-1/64, snare/clap on 3, vocal ad-libs, tempo half-time feel"
rango_bpm: [130, 150, 140]
energía: "9 — Densa, transientes nítidos, sustain largo en 808"
balance_tonal: "Sub-bass 30-80Hz (+6-10dB vs mid), low-mids scooped 200-500Hz, presence 3-5kHz, air 10kHz+"
dinamica: "Crest factor 14-18dB entrada, target out 8-10dB. DR comercial 5-7"
loudness_promedio: "-7 LUFS integrated, -0.5 dBTP true peak (Spotify loud)"
recomendaciones_dsp:
  - "Saturation tube/tape en low-end para armónicos 808 audibles en móvil"
  - "Compresor FET fast attack (0.5ms) en kick/808 bus para punch"
  - "EQ low-shelf +2dB @ 50Hz, high-shelf +1.5dB @ 10kHz"
  - "True peak limiter -1dBTP obligatorio (distorsión en sub-bass)"
  - "Match EQ curva objetivo: pink noise slope -3dB/oct + bass boost 30-80Hz"
presets_compatibles:
  primario: {preset: "fuego", confidence: 0.93}
  secundarios: [{preset: "empuje", confidence: 0.7}, {preset: "claridad", confidence: 0.35}]
```

## Futuras integraciones
- **Genre Classifier ML (CNN)**: Ground truth labels + feature targets (spectral centroid, MFCC, crest, LUFS)
- **Preset Recommender (XGBoost)**: Features = genre profile + audio analysis → target = preset óptimo
- **Match EQ**: Curvas objetivo por género (guardadas en mastering/target_curves/)
- **Chief Audio Engineer**: Valida que perfiles match realidad de mercado
- **RAG**: "Mastericé un trap a -14 LUFS y suena débil" → trap.md explica target -7 LUFS comercial