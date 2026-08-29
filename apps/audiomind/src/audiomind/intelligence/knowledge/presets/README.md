# Knowledge / Presets

## Propósito
Documentar cada preset de mastering como conocimiento estructurado: qué hace, por qué, cuándo usarlo, cadena DSP exacta, métricas esperadas y limitaciones.

## Responsabilidad
- Mantener la fuente de verdad de los 8 presets canónicos (Pulido, Brutal, Cristalino, Vintage, Crudo, Envolvente, Épico, Muro)
- Vincular cada preset a su género(s) objetivo, cadena de plugins, y parámetros
- Registrar evolución: versión, cambios, experimento que lo validó
- Servir como referencia para agentes y para generar documentación de usuario

## Estructura de archivo
```
presets/
├── universal.md
├── fuego.md
├── claridad.md
├── cinta.md
├── natural.md
├── espacial.md
├── cinematico.md
├── empuje.md
├── index.md                    # Tabla resumen: preset, género, cadena, LUFS target
└── templates/
    └── preset.template.md      # (referencia a templates/preset.template.md)
```

## Formato obligatorio (ver templates/preset.template.md)
Cada preset.md **debe** contener:
- **nombre**: ID canónico (ej: "fuego")
- **objetivo**: Una frase — qué logra (ej: "Añade punch y peso en graves para trap/hip-hop")
- **descripción**: Párrafo explicativo para usuario
- **problema que resuelve**: Qué falla en el mix original (ej: "Kick y 808 se pierden en master comercial")
- **cuándo usar**: Condiciones de entrada (género, BPM, crest factor, balance tonal)
- **cuándo NO usar**: Contraindicaciones (ej: "No usar en jazz acústico — aplana dinámica")
- **plugins utilizados**: Lista ordenada con parámetros clave
- **cadena DSP**: Diagrama textual o pseudo-código de la señal
- **ventajas**: Qué hace bien
- **limitaciones**: Qué no hace / riesgos
- **métricas esperadas**: LUFS target, True Peak max, DR target, crest factor out
- **géneros ideales**: Lista con badges (ej: ["Trap", "Hip Hop", "Drill"])
- **futuras mejoras**: Ideas para v2 (ej: "Auto-detect 808 fundamental freq")
- **referencias**: Enlaces a experimentos, papers, presets comerciales análogos

## Ejemplo: fuego.md (resumen)
```markdown
nombre: fuego
objetivo: "Impacto y peso en graves para música urbana electrónica"
problema que resuelve: "Kick/808 se pierden al normalizar a -14 LUFS"
cuándo usar: Trap, Hip Hop, Drill, Reggaeton — crest factor > 12dB, sub-bass energy alta
cuándo NO usar: Jazz, Classical, Acoustic, Ambient — destruye micro-dinámica
plugins: [Saturation (tube, drive=3dB), Compressor (FET, 4:1, fast attack), EQ (low shelf +2dB @ 60Hz), Limiter (true peak -1dBTP)]
cadena DSP: input → saturation → comp → EQ → limiter → output
métricas esperadas: LUFS -14±0.5, TP -1.0dBTP, DR 6-8, crest factor out 8-10dB
géneros ideales: ["Trap", "Hip Hop", "Drill", "Reggaeton"]
futuras mejoras: "Adaptive saturation based on sub-bass spectral centroid"
referencias: ["EXP-001", "EXP-003", "LandR 'Loud' preset analysis"]
```

## Futuras integraciones
- **Chief Audio Engineer Agent**: Lee presets/ para auditar consistencia y proponer nuevos
- **DSP Designer Agent**: Usa cadena DSP como spec para implementación/modificación
- **Product Strategist**: Analiza index.md para gaps de cobertura por género
- **RAG**: Responde "¿qué preset para drill?" → devuelve fuego.md con contexto
- **Genre Classifier ML**: Entrena con pares (track features → preset óptimo) desde experiments/