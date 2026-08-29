# Idea Template

> **Uso**: Copiar a `ideas/IDEA-XXX_descriptive-name.md`
> **ID**: Secuencial global (IDEA-001, IDEA-002...), único e inmutable
> **Prefijo obligatorio**: `IDEA-XXX_` en filename

---

## Título *
`IDEA-XXX: <Título descriptivo único>`
> Ej: `IDEA-001: Auto-selección de preset por género detectado`

---

## Descripción *
Qué es en 2-3 frases. Entendible sin contexto previo.
> Tras análisis de audio, el sistema detecta género y características técnicas, y sugiere/pre-selecciona el preset óptimo con explicación legible ("Recomendamos Brutal: tu track tiene 808 sustain y energía alta").

---

## Problema *
Qué dolor resuelve. Incluir user quote o data si existe.
> "No sé qué preset elegir — son 8 y suenan parecido" (78% usuarios en onboarding survey Q3 2026)
> Drop-off 60% en preset selection screen (PostHog funnel)
> Time-to-first-master: 4.2 min (target <2 min)

---

## Beneficio *
Valor para usuario y/o negocio. Métrica si posible.
| Métrica | Actual | Target | Impacto |
|---------|--------|--------|---------|
| First-track success rate | 45% | 70% | +25pp activation |
| Time-to-first-master | 4.2 min | <2 min | -50% fricción |
| Preset exploration → selection | 3.2 clicks | 1 click | -69% cognitive load |
| Free-to-Pro conversion | 3.1% | 5.5% | +77% revenue |

---

## Costo *
Estimación realista.
| Recurso | Estimación | Notas |
|---------|------------|-------|
| Dev backend (ML serving) | 2 weeks | Genre classifier + preset recommender API |
| Dev frontend (UX) | 1 week | Recommendation card, confidence indicator, fallback |
| Data labeling | 3 weeks | 1000 tracks etiquetados género+preset óptimo |
| GPU training (cloud) | $200 | ResNet50 fine-tune + XGBoost |
| A/B test infra | 1 week | Experiment framework + analytics |
| **Total** | **~7 weeks / $200 + eng time** | |

---

## Complejidad *
`Baja` | `Media` | `Alta` + riesgos técnicos.
> **Media**
> - Riesgo: Genre classifier accuracy <80% en géneros ambiguos (lo-fi, experimental) → fallback heurístico obligatorio
> - Riesgo: Cold start — primeros usuarios sin data para recommender → heuristic baseline
> - Riesgo: Model serving latency <100ms p99 → ONNX Runtime + caching
> - Dependencia: EXP-003 genre-preset correlation debe validar signal

---

## Prioridad *
`P0` (crítico) | `P1` (alto) | `P2` (medio) | `P3` (bajo) | `P4` (nice-to-have)
> **P1** — High impact, differentiated vs LANDR/BandLab, unblocks activation metric

---

## Estado *
`Nueva` → `En evaluación` → `Aprobada` → `En roadmap` → `En desarrollo` → `Hecha` / `Descartada` / `Fusionada`
> **En evaluación**

---

## Inspiración *
Fuente original.
> - BandLab SongStarter genre detection + preset recommendation (competitor analysis)
> - User interviews Q3 2026: "Just tell me which one to use"
> - Internal hackathon 2026-06: prototype genre→preset mapping 73% accuracy

---

## Referencias *
Links trazables.
| Tipo | Referencia |
|------|------------|
| ML Strategy | `AUDIOMIND_AI_ML_STRATEGY.md#modelo-2` |
| Experiment | `EXP-003` (genre-preset correlation) |
| Competitor | `knowledge/business/competitive/bandlab.md` |
| Roadmap | `knowledge/roadmap/phase-5-ml-intelligence.md` |
| Idea related | `IDEA-004` (reference match EQ) |
| User data | PostHog funnel `onboarding_preset_selection` |

---

## Notas *
Contexto adicional, dependencias, open questions, riesgos no cubiertos arriba.
- **Dependencia crítica**: EXP-003 debe confirmar correlación fuerte genre→preset (confidence >0.7 en 6/8 géneros)
- **Fallback design**: Si genre confidence <0.6 → mostrar "Pulido" + "Explorar presets" (no auto-select)
- **Privacy**: No enviar audio a cloud para genre detection — todo on-device (WebAssembly) o backend privado
- **Explainability**: UI debe mostrar *por qué* (ej: "Detectado Trap: 808 sustain + hi-hats density → Brutal")
- **Ab testing**: 50% users ven recomendación, 50% no → medir activation, retention, NPS
- **Future**: Artist-specific preset (IDEA-004) necesita esto como base

---

## Versionado
| Versión | Fecha | Autor | Estado | Cambios |
|---------|-------|-------|--------|---------|
| 1.0.0 | 2026-07-29 | Innovation Agent | Nueva | Creación inicial |