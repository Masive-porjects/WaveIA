# Knowledge / Plugins

## Propósito
Documentar cada plugin/processor DSP disponible en la cadena de mastering como conocimiento reutilizable: parámetros, impacto sonoro, interacciones y casos de uso.

## Responsabilidad
- Catálogo de todos los módulos DSP (Saturation, Compressor, EQ, Limiter, Stereo, Dither, etc.)
- Definir interfaz de parámetros normalizada (rangos, unidades, defaults)
- Documentar carácter sonoro y medible de cada plugin
- Registrar interacciones: orden en cadena, conflictos, sinergias
- Servir como spec para implementación (Pedalboard / Librosa fallback)

## Estructura de archivo
```
plugins/
├── saturation.md
├── compressor.md
├── eq.md
├── limiter.md
├── stereo.md
├── dither.md
├── match_eq.md
├── ceiling_limiter.md
├── index.md                    # Tabla: plugin, tipo, params clave, presets que lo usan
└── templates/
    └── plugin.template.md      # (referencia a templates/plugin.template.md)
```

## Formato obligatorio (ver templates/plugin.template.md)
Cada plugin.md **debe** contener:
- **propósito**: Qué hace en una frase (ej: "Saturación armónica tipo tubo para añadir calidez y compresión suave")
- **parámetros**: Tabla completa — nombre, tipo, rango, default, unidad, descripción
- **impacto sonoro**: Descripción cualitativa + medible (ej: "Añade armónicos pares/impares 2-6kHz, reduce crest factor 1-3dB")
- **ventajas**: Qué hace bien (ej: "Musical en material dinámico, no dura en transientes")
- **desventajas**: Qué hace mal / riesgos (ej: "En material ya saturado añade intermodulación fea")
- **ejemplos de uso**: Settings típicos por caso (ej: "Tube, drive=2dB, mix=30% → vocal warmth")
- **interacción con otros plugins**:
  - Antes de: Qué plugins se benefician de ir antes
  - Después de: Qué plugins se benefician de ir después
  - Conflictos: Combinaciones a evitar (ej: "Saturación + compresor FET fast attack → pumping audible")
  - Sinergias: Combos recomendados (ej: "Saturación tube + EQ low-shelf → 'analog glue'")

## Ejemplo: saturation.md (resumen)
```markdown
propósito: "Saturación armónica configurable (tube/tape/transistor) para color y compresión suave"
parámetros:
  - type: [tube, tape, transistor] — default: tube
  - drive_db: float [0, 12] — default: 3 — "Gain de entrada al saturador"
  - mix: float [0, 1] — default: 0.5 — "Dry/wet"
  - tone_hz: float [100, 8000] — default: 2000 — "Filtro post-saturación"
impacto sonoro: "Añade armónicos 2º-6º orden. Tube: pares dominantes (calidez). Tape: impares + compresión natural. Transistor: impares agresivos."
ventajas: "Musical, auto-limiting suave, añapego perceived loudness"
desventajas: "Puede ensuciar low-end si drive alto + material bass-heavy. No reemplaza compresor."
ejemplos de uso:
  - "Vocal warmth: tube, drive=2dB, mix=25%, tone=3000Hz"
  - "Drum glue: tape, drive=4dB, mix=40%, tone=1500Hz"
  - "Bass grit: transistor, drive=6dB, mix=20%, tone=800Hz"
interacción:
  - antes de: Compressor (saturación reduce picos → compresor trabaja menos)
  - después de: EQ correctivo (limpiar antes de colorear)
  - conflictos: Limiter inmediato después → intermodulación en techo
  - sinergias: Tube saturation + Pultec-style EQ low boost = "analog weight"
```

## Futuras integraciones
- **DSP Designer Agent**: Consulta plugins/ para diseñar cadenas nuevas
- **Chief Audio Engineer**: Valida que parámetros cubren casos de uso reales
- **ML Preset Recommender**: Features = plugin params settings por preset
- **RAG**: "¿Cómo conseguir calidez sin compresor?" → saturation.md + ejemplos
- **Experiment Designer**: Parametrización para EXP-XXX (ej: sweep drive_db 0-12dB)