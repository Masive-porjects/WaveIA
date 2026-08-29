# Experiment Template

> **Uso**: Copiar a `knowledge/experiments/<type>/EXP-XXX_descriptive-name.md`
> **ID**: Secuencial global (EXP-001, EXP-002...), único e inmutable
> **Tipo**: `dsp` | `ml` | `ux` | `product` (determina subcarpeta)

---

## ID *
`EXP-XXX` — Asignado secuencialmente al crear. No reutilizar.

---

## Tipo *
`dsp` | `ml` | `ux` | `product`

---

## Título *
Descriptivo, único, busca-able.
> Ej: "Comparación algoritmos limiter: brickwall vs true-peak vs ISP"

---

## Hipótesis *
> "Si aplicamos **X**, entonces **Y** ocurrirá porque **Z**."
> Formato: causa → efecto → mecanismo teórico.
>
> Ej: "Si usamos ceiling dinámico basado en crest factor (X), entonces reduciremos over-limiting en tracks ya masterizados (Y) porque el ceiling fijo -1dBTP aplasta material que ya tiene poco headroom (Z)."

---

## Objetivo *
Métrica primaria a mover. Una sola, cuantificable.
> Ej: "Reducir % tracks con DR<4 post-mastering de 22% a <5% manteniendo loudness target ±0.5 LUFS."

---

## Diseño Experimental *

### Grupos
| Grupo | N | Descripción | Tratamiento |
|-------|---|-------------|-------------|
| Control | 250 | Ceiling fijo -1dBTP | Baseline actual |
| Tratamiento | 250 | Ceiling dinámico (crest<10→-2, crest>15→-1, histeresis ±1) | Nueva lógica |

### Muestra
- **Tamaño**: 500 tracks (250 c/u)
- **Estratificación**: Género (8), crest factor (3 bins), LUFS entrada (3 bins)
- **Aleatorización**: Hash(track_id + exp_id) % 2
- **Cegamiento**: Analista no sabe grupo al medir métricas

### Métricas Primarias
| Métrica | Target | Método medición |
|---------|--------|-----------------|
| % tracks DR<4 | <5% | EBU DR post-mastering |
| LUFS error vs target | ±0.5 | pyloudnorm integrated |
| True peak violations | 0 | 4x oversample |

### Métricas Secundarias
| Métrica | Método |
|---------|--------|
| CPU overhead | % increase vs baseline |
| Latency added | ms |
| Sub-grupo "ya masterizado" (crest<10) DR | mean ± std |
| Sub-grupo "crudo" (crest>15) DR | mean ± std |

---

## Cambios Realizados *
Exactamente qué se modificó — trazable a código.
| Archivo | Líneas | Cambio | Commit/PR |
|---------|--------|--------|-----------|
| `processing/engine.py` | 234-241 | Nueva función `calculate_ceiling(crest_factor)` con histeresis | PR #342 |
| `processing/engine.py` | 594 | Llamada a `calculate_ceiling` en lugar de constante | PR #342 |
| `tests/test_ceiling.py` | — | Tests unitarios nuevos casos crest 8-18 | PR #342 |

---

## Resultados *

### Primarios
| Métrica | Control | Tratamiento | Delta | p-value | Significativo |
|---------|---------|-------------|-------|---------|---------------|
| % DR<4 | 22% | 4% | -81% | <0.001 | ✅ |
| LUFS error (dB) | 0.12 ± 0.31 | 0.08 ± 0.28 | -33% | 0.02 | ✅ |
| TP violations | 0 | 0 | 0 | — | ✅ |

### Por Sub-grupos
| Sub-grupo | Control DR | Tratamiento DR | Delta | n |
|-----------|------------|----------------|-------|---|
| Ya masterizado (crest<10) | 3.1 ± 1.2 | 5.4 ± 1.5 | +74% | 89 |
| Zona gris (crest 10-15) | 4.8 ± 1.1 | 5.9 ± 1.3 | +23% | 156 |
| Crudo (crest>15) | 6.8 ± 1.4 | 7.1 ± 1.3 | +4% | 255 |

### Técnicas
| Métrica | Control | Tratamiento | Delta |
|---------|---------|-------------|-------|
| CPU mean | 100% | 102% | +2% |
| Latency | 0ms | 0ms | 0% |
| Memory | 45MB | 46MB | +2% |

---

## LUFS / True Peak / Dynamic Range *
Valores medidos en corpus de validación (mín 50 tracks, géneros variados).
> **Corpus**: `experiments/data/exp003/validation_set/` (500 tracks, 8 géneros, stratificado)
> - LUFS Integrated: -14.0 ± 0.3 dB (target -14)
> - True Peak: -1.2 ± 0.4 dBTP (ceiling -1)
> - Dynamic Range (EBU): 6.8 ± 1.8 dB
> - Crest Factor out: 9.2 ± 2.1 dB

---

## Problemas Encontrados *
Honestidad radical — bugs, edge cases, sorpresas, limitaciones.
1. **Zona gris crest 10-15dB**: Inconsistencia en ceiling assignment → añadida histeresis ±1dB (ver PR #342 commit f3a2b1c)
2. **Tracks con crest 9.5dB (borde)**: Oscilación control/tratamiento entre renders → fix: redondear crest a int antes de decisión
3. **Windows CI**: Test `test_ceiling_hysteresis` flaky por float precision → tolerancia 1e-6 añadida
4. **Material extremo**: Noise tracks (crest ~3dB) → ceiling -2dBTP correcto pero LUFS -15.2 (debajo target) → documentar como known behavior

---

## Conclusiones *
**Hipótesis: CONFIRMADA / RECHAZADA / PARCIAL**
> **CONFIRMADA**. Ceiling dinámico + histeresis reduce over-limiting drásticamente (22%→4% DR<4) sin penalizar loudness ni tracks crudos. Overhead CPU/latencia negligible.

**Evidencia clave**:
- Sub-grupo "ya masterizado" DR 3.1→5.4 (+74%) — objetivo principal cumplido
- Zero true peak violations en ambos grupos
- LUFS accuracy mejora ligeramente (0.12→0.08 dB error)

---

## Próximos Pasos *
Acciones concretas con owner y timeline.
| Acción | Owner | Timeline | Referencia |
|--------|-------|----------|------------|
| Deploy a staging | DevOps | Week 1 | PR #342 merged |
| Monitor 1k tracks reales | Chief Audio Eng | Week 2-3 | Dashboard `exp003_monitor` |
| Si metrics stable → production | Chief Audio Eng | Week 4 | Release v1.3.0 |
| EXP-004: Test ceiling con ML already-mastered detector | Research Agent | Month 2 | IDEA-012 |

---

## Artefactos *
Links a evidencia reproducible.
- **PR**: #342
- **Dataset**: `experiments/data/exp003/` (input tracks, outputs control/tratamiento, metrics CSV)
- **Audio samples**: `outputs/exp003/` (10 pares control/tratamiento representativos)
- **Analysis notebook**: `experiments/notebooks/exp003_analysis.ipynb`
- **Dashboard**: `grafana/audiomind/exp003` (live durante staging)

---

## Versionado
| Versión | Fecha | Autor | Estado | Cambios |
|---------|-------|-------|--------|---------|
| 1.0.0 | 2026-07-29 | Research Agent | Completed | Creación inicial |
| 1.1.0 | 2026-07-30 | DSP Designer | Updated | Histeresis añadida post-review |