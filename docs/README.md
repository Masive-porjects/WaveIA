# Índice central de documentación — Brikmaster (WaveAI)

Este archivo es la **fuente de la verdad** sobre la documentación del repo: qué documento existe, dónde está, para qué sirve y cuándo leerlo. Si buscas información del proyecto, empieza acá.

**Brikmaster** (antes WaveAI) es un estudio de mastering asistido por IA + un **Live Engine** Web Audio controlado en tiempo real.

```
Audio → AudioMind (FastAPI) → Master → Studio Live Engine (Web Audio) → Knobs/Meters/Audio
```

---

## Mapa de carpetas del repo

| Ruta | Stack | Rol |
|---|---|---|
| `apps/studio/` | Next.js 16 + React 19 + TS + Tailwind 4 | Mastering UI + pestaña Live (Web Audio) |
| `apps/bridge/` | Python, websockets, rtmidi | MIDI → `LiveParams` → WS :8765 |
| `apps/audiomind/` | Python/FastAPI, librosa, pedalboard | DSP de mastering (análisis + cadena de 13 etapas) |
| `packages/contracts/` | JSON Schema + generador | `live_params.schema.json` = fuente de verdad del protocolo |
| `simulator/` | Python | Emisor de `LiveParams` sintéticos (sweep/presets/random) |
| `e2e/` | Playwright | master → live |

---

## Índice de documentación

### `docs/reference/` — CANÓNICO (describe el producto real; reglas vigentes)

| Documento | Para qué sirve | Estado |
|---|---|---|
| [`COMPLIANCE_PHASE1.md`](reference/COMPLIANCE_PHASE1.md) | Contrato de entrega de la Fase 1: modo Transparente (neutral = bypass), `platform_target`, `output_sr`/`output_bit_depth`, `strict_mode` | **Canónico** |
| [`DSP_INDUSTRY_REVIEW.md`](reference/DSP_INDUSTRY_REVIEW.md) | Revisión de la cadena de mastering contra práctica profesional (fases A–D entregadas; P2 abiertos) | **Canónico** |
| [`DESIGN.md`](reference/DESIGN.md) | Diseño del UI del studio: componentes core, layout, responsive, microcopy, fuentes de verdad | **Canónico** |
| [`specs/README.md`](reference/specs/README.md) | Índice de las specs del hackaton (con nota histórica de HumanMidi en su header) | Índice |
| [`specs/01_vision_unificada.md`](reference/specs/01_vision_unificada.md) | Visión original del ecosistema unificado | Histórico (HumanMidi removido) |
| [`specs/03_waveai_backend_mastering.md`](reference/specs/03_waveai_backend_mastering.md) | Backend de mastering (FastAPI): análisis + cadena DSP proporcional | **Canónico** |
| [`specs/04_waveai_sistema_diseno.md`](reference/specs/04_waveai_sistema_diseno.md) | Sistema de diseño del studio (Next.js): tokens, componentes, microcopy | **Canónico** |
| [`specs/05_live_engine_gestos_a_master.md`](reference/specs/05_live_engine_gestos_a_master.md) | Arquitectura de audio del Live Engine (Web Audio) | **Canónico** como referencia de audio (gestos removidos; control MIDI) |
| [`specs/06_roadmap_unificado.md`](reference/specs/06_roadmap_unificado.md) | Roadmap conjunto del hackaton | Histórico |
| [`specs/07_estrategia_equipo_5devs.md`](reference/specs/07_estrategia_equipo_5devs.md) | Estrategia de equipo/roles del hackaton | Histórico (Dev 4 HumanMidi removido) |
| [`specs/08_implementacion_llm.md`](reference/specs/08_implementacion_llm.md) | Prompt de implementación con **TODOS los valores exactos** (presets, rangos, tokens, endpoints, fases, criterios de éxito, pitfalls) — **fuente de valores DSP** | **Canónico** |

### `docs/runbooks/` — CÓMO LEVANTAR / DESPLEGAR

| Documento | Para qué sirve | Estado |
|---|---|---|
| [`SETUP.md`](runbooks/SETUP.md) | Levantar el entorno local (venv, bun, Convex, stack, pitfalls reales) | **Vigente (verificado)** |
| [`DEPLOY_RUNBOOK.md`](runbooks/DEPLOY_RUNBOOK.md) | Deploy de la demo en Vercel + Railway | Preparado (no ejecutado) |
| [`DEMO_DEPLOYMENT_PLAN.md`](runbooks/DEMO_DEPLOYMENT_PLAN.md) | Plan de despliegue de la demo (arquitectura vinculante) | **LOCKED** (no negociable) |

### `docs/manual/` — PRODUCTO / UI

| Documento | Para qué sirve | Estado |
|---|---|---|
| [`USER_MANUAL.md`](manual/USER_MANUAL.md) | Manual de usuario: flujo completo del studio (carga, presets, entrega, Live Engine) | **Canónico** |
| [`UX_MAP.md`](manual/UX_MAP.md) | Mapa de UX del producto: navegación, estados y diagrama de flujo | **Canónico** |

### `docs/evidence/` — MEDICIONES / VALIDACIONES

| Documento | Para qué sirve | Estado |
|---|---|---|
| [`DEMO_RESOURCE_AUDIT.md`](evidence/DEMO_RESOURCE_AUDIT.md) | Auditoría de recursos para la demo (RAM, tiempos, límites) | Evidencia |
| [`DEMO_LOCAL_VALIDATION.md`](evidence/DEMO_LOCAL_VALIDATION.md) | Validación local de las métricas de la demo | Evidencia |
| [`DEMO_FEASIBILITY.md`](evidence/DEMO_FEASIBILITY.md) | Factibilidad de la demo (incluye el rastro de HumanMidi y la recomendación de remoción) | Evidencia |
| `evidence/*.json` | Mediciones crudas: `benchmark_staircase_report.json`, `validate_duration_report.json` | Evidencia |

### `docs/archive/` — HISTÓRICO (contexto, no operativo)

| Documento | Para qué sirve | Estado |
|---|---|---|
| [`INTEGRATION_REPORT.md`](archive/INTEGRATION_REPORT.md) | Estado del bloque de integración en su momento (Block B: HumanMidi removido) | Histórico |
| [`HANDOFF_BACKEND_CONVEX.md`](archive/HANDOFF_BACKEND_CONVEX.md) | Handoff del scaffold de Convex | Histórico |
| [`WORKPLAN.md`](archive/WORKPLAN.md) | Estado por área en el momento de la entrega | Histórico |
| [`HUMANMIDI_REMOVAL_REPORT.md`](archive/HUMANMIDI_REMOVAL_REPORT.md) | Reporte completo de la remoción de HumanMidi (2026-09-11) | Histórico |
| [`PLAN.md`](archive/PLAN.md) | Plan original del proyecto | Histórico |

---

## ¿Dónde busco X?

| Pregunta | Ir a |
|---|---|
| ¿Cómo levanto el entorno? | `docs/runbooks/SETUP.md` |
| ¿Cómo despliego la demo? | `docs/runbooks/DEPLOY_RUNBOOK.md` (plan: `DEMO_DEPLOYMENT_PLAN.md`, LOCKED) |
| ¿Valores exactos de presets, rangos y endpoints? | `docs/reference/specs/08_implementacion_llm.md` |
| ¿Cómo funciona el backend DSP? | `docs/reference/specs/03_waveai_backend_mastering.md` + `docs/reference/DSP_INDUSTRY_REVIEW.md` |
| ¿Cómo se ve y se comporta la UI? | `docs/reference/DESIGN.md` + `docs/reference/specs/04_waveai_sistema_diseno.md` |
| ¿Cómo funciona el Live Engine? | `docs/reference/specs/05_live_engine_gestos_a_master.md` |
| ¿Qué reglas son no negociables al escribir código? | `AGENTS.md` (raíz) |
| ¿Cambio el protocolo Live? | `packages/contracts/live_params.schema.json` (fuente de verdad); regenera tipos con `packages/contracts/scripts/gen_types.sh` |
| ¿Qué ve el usuario final? | `docs/manual/USER_MANUAL.md` + `docs/manual/UX_MAP.md` |
| ¿Métricas y validaciones de la demo? | `docs/evidence/` |
| ¿Qué pasó con HumanMidi? | `docs/archive/HUMANMIDI_REMOVAL_REPORT.md` |

---

## Convención

- **Canónico y vigente**: `docs/reference/`, `docs/runbooks/`, `docs/manual/` y `docs/evidence/` describen el producto real.
- **Histórico**: `docs/archive/` y las specs marcadas `HISTÓRICO` **no se editan** para reflejar el estado actual — se leen como contexto.
- Puntos de entrada del repo: `README.md` (presentación del producto) y `AGENTS.md` (guía para agentes de IA).