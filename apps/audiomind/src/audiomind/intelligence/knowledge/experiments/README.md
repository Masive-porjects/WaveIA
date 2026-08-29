# Knowledge / Experiments

## Propósito
Registro estructurado, reproducible y auditable de todos los experimentos de I+D en AudioMind: DSP, ML, UX, producto.

## Responsabilidad
- Estandarizar formato de experimentos (hipótesis, método, resultados, conclusiones)
- Garantizar trazabilidad: cada experimento tiene ID único, fecha, autor, links a código/data
- Separar experimentos de DSP (cadena, parámetros) de ML (modelo, data, metrics) y UX
- Evitar repetir experimentos fallidos; capitalizar aprendizajes
- Servir como dataset para Innovation Agent y Research Agent

## Estructura de archivo
```
experiments/
├── dsp/
│   ├── EXP-001_saturation-comparison.md
│   ├── EXP-002_limiter-algorithms.md
│   ├── EXP-003_ceiling-strategy.md
│   └── index.md
├── ml/
│   ├── EXP-010_genre-classifier-gtzan.md
│   ├── EXP-011_preset-recommender-xgboost.md
│   ├── EXP-012_audio-embeddings.md
│   └── index.md
├── ux/
│   ├── EXP-020_preset-card-design.md
│   ├── EXP-021_onboarding-flow.md
│   └── index.md
├── product/
│   ├── EXP-030_pricing-ab-test.md
│   ├── EXP-031_free-tier-limits.md
│   └── index.md
├── templates/
│   └── experiment.template.md        # (ref: templates/experiment.template.md)
└── index.md                          # Tabla maestra: ID, tipo, estado, resultado, next
```

## Formato obligatorio (ver templates/experiment.template.md)
Cada experimento **debe** contener:
- **ID**: EXP-XXX (secuencial, único)
- **Tipo**: dsp | ml | ux | product
- **Título**: Descriptivo (ej: "Comparación saturación tube vs tape vs soft-clip en 808")
- **Hipótesis**: "Si aplicamos X, entonces Y ocurrirá porque Z"
- **Objetivo**: Métrica primaria a mover (ej: "Reducir distorsión audible en sub-bass 30-60Hz en 3dB")
- **Diseño**: Control vs tratamiento, sample size, aleatorización, cegamiento
- **Cambios realizados**: Exactamente qué se modificó (código, config, params, UI)
- **Resultados**: Métricas cuantitativas + observaciones cualitativas
- **Métricas técnicas**: LUFS, TP, DR, Crest, PESQ/ViSQOL si aplica, latencia, CPU
- **Problemas encontrados**: Bugs, edge cases, limitaciones, sorpresas
- **Conclusiones**: ¿Hipótesis confirmada/rechazada? ¿Por qué?
- **Próximos pasos**: Iterar, desplegar, descartar, investigar X
- **Artefactos**: Links a PR, commit, dataset, modelo, screenshots, grabaciones audio

## Ejemplo: EXP-003_ceiling-strategy.md (resumen)
```
ID: EXP-003
Tipo: dsp
Título: Ceiling dinámico basado en crest factor vs ceiling fijo -1dBTP
Hipótesis: "Un ceiling adaptativo (-2dBTP para crest<10dB, -1dBTP para crest>15dB) reduce over-limiting en tracks ya masterizados sin penalizar dinámica en mixes crudos."
Objetivo: Reducir % tracks con DR<4 post-mastering de 22% a <5% manteniendo loudness target ±0.5 LUFS.
Diseño: A/B 500 tracks (250 control ceiling fijo, 250 tratamiento ceiling dinámico). Tracks stratificados por género y crest factor entrada.
Cambios: processing/engine.py lines 234-241 → función calculate_ceiling(crest_factor)
Resultados:
  - Control: 22% tracks DR<4, mean LUFS -14.1, mean DR 5.2
  - Tratamiento: 4% tracks DR<4, mean LUFS -14.0, mean DR 6.8
  - Sub-grupo "ya masterizados" (crest<10): DR 3.1→5.4, LUFS -13.8→-14.2
  - Sub-grupo "crudos" (crest>15): DR 6.8→7.1, LUFS -14.3→-14.1
Métricas técnicas: CPU +2%, latencia +0ms, true peak violations 0 en ambos.
Problemas: Tracks con crest 10-15dB (zona gris) mostraban inconsistencia → ajouté histeresis ±1dB.
Conclusión: Hipótesis CONFIRMADA. Ceiling dinámico + histeresis reduce over-limiting drásticamente.
Próximos pasos: Deploy a staging (PR #342), monitor 1k tracks reales, luego production.
Artefactos: PR #342, dataset experiments/data/exp003/, audio samples outputs/exp003/
```

## Futuras integraciones
- **Innovation Agent**: Lee experiments/ para detectar patrones, gaps, y proponer nuevos EXP-XXX
- **Research Agent**: Meta-análisis de experiments/ml/ para mejorar experiment design
- **DSP Designer**: Consulta experiments/dsp/ antes de proponer cambios a cadena
- **Product Strategist**: Usa experiments/product/ para validar pricing/packaging
- **RAG**: "¿Por qué ceiling dinámico?" → EXP-003 con evidencia cuantitativa
- **Audit Trail**: Cumplimiento regulatorio futuro (explicabilidad de decisiones técnicas)