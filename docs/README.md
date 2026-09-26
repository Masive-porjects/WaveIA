# Índice central de documentación — WaveAI

Este archivo es la **fuente de la verdad** sobre la documentación del repo: qué documento existe, dónde está, para qué sirve y cuándo leerlo. Si buscas información del proyecto, empieza acá.

**WaveAI** es un estudio de mastering asistido por IA + un **Live Engine** Web Audio controlado en tiempo real.

```
Audio → AudioMind (FastAPI) → Master → Studio Live Engine (Web Audio) → Knobs/Meters/Audio
```

---

## Mapa de carpetas del repo

| Ruta | Stack | Rol |
|---|---|---|
| `apps/studio/` | Next.js 16 + React 19 + TS + Tailwind 4 | Mastering UI + pestaña Live (Web Audio) |
| `apps/audiomind/` | Python/FastAPI, librosa, pedalboard | DSP de mastering (análisis + cadena de 13 etapas) + Mix Engine |
| `packages/contracts/` | JSON Schema + generador | `live_params.schema.json` = fuente de verdad del protocolo |
| `e2e/` | Playwright | master → live |

> ⚠️ `apps/bridge/` (MIDI → WS :8765) y `simulator/` (Python) fueron **removidos** del repo — el Live Engine es standalone, sin WebSocket ni MIDI. Detalle en [`ESTADO_PROYECTO.md`](ESTADO_PROYECTO.md) §5.

---

## Índice de documentación

### Estado del proyecto (relevamiento read-only, verificado)

| Documento | Para qué sirve | Estado |
|---|---|---|
| [`ESTADO_PROYECTO.md`](ESTADO_PROYECTO.md) | Relevamiento completo: tres motores, frontend, agent, entorno, ramas git, suites verificadas y pendientes del usuario | **Vigente** (2026-09-21; aún vigente en lo estructural. Para el estado al día de Mix Engine/Stem Balance ver `odd/tasks/mix-stem-balance.md` y los commits de develop) |

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
| [`DOCKER.md`](runbooks/DOCKER.md) | Stack local con Docker Compose (sin instalar Python/bun en el host) | **Vigente** |
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

### `docs/reports/` — REPORTES DE FASE (avances formales)

| Documento | Para qué sirve | Estado |
|---|---|---|
| [`implementation-plan.md`](implementation-plan.md) | Roadmap y plan de implementación macro por fases | **Vigente** |
| [`reports/report-fase-0.md`](reports/report-fase-0.md) | Informe de Fase 0: Erradicación de Convex y gobierno técnico | Entregado |
| [`reports/report-fase-1.md`](reports/report-fase-1.md) | Informe de Fase 1: Arquitectura limpia por features y modularidad | Entregado |
| [`reports/report-fase-2.md`](reports/report-fase-2.md) | Informe de Fase 2: Navegación desacoplada y Composition Root | Entregado |
| [`reports/report-fase-3.md`](reports/report-fase-3.md) | Informe de Fase 3: Sistema multiidioma i18n extensible | Entregado |
| [`reports/report-fase-4.md`](reports/report-fase-4.md) | Informe de Fase 4: Autenticación con Supabase Auth y RBAC | Entregado |
| [`reports/report-fase-5.md`](reports/report-fase-5.md) | Informe de Fase 5: Persistencia 1:N, drafts y consolidación de masters | Entregado |

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
| ¿Plan de implementación y fases? | `docs/implementation-plan.md` |
| ¿Reportes técnicos de fases de desarrollo? | `docs/reports/` |
| ¿Lineamientos normativos para agentes de IA? | `.agents/rules/` y `AGENTS.md` (raíz) |
| ¿Valores exactos de presets, rangos y endpoints? | `docs/reference/specs/08_implementacion_llm.md` |
| ¿Cómo funciona el backend DSP? | `docs/reference/specs/03_waveai_backend_mastering.md` + `docs/reference/DSP_INDUSTRY_REVIEW.md` |
| ¿Cómo se ve y se comporta la UI? | `docs/reference/DESIGN.md` + `docs/reference/specs/04_waveai_sistema_diseno.md` |
| ¿Cómo funciona el Live Engine? | `docs/reference/specs/05_live_engine_gestos_a_master.md` |
| ¿Qué reglas son no negociables al escribir código? | `AGENTS.md` (raíz) y `.agents/rules/` |
| ¿Cambio el protocolo Live? | `packages/contracts/live_params.schema.json` (fuente de verdad); regenera tipos con `packages/contracts/scripts/gen_types.sh` |
| ¿Qué ve el usuario final? | `docs/manual/USER_MANUAL.md` + `docs/manual/UX_MAP.md` |
| ¿Métricas y validaciones de la demo? | `docs/evidence/` |
| ¿Qué pasó con HumanMidi? | `docs/archive/HUMANMIDI_REMOVAL_REPORT.md` |

---

## Convención

- **Canónico y vigente**: `docs/reference/`, `docs/runbooks/`, `docs/manual/` y `docs/evidence/` describen el producto real.
- **Histórico**: `docs/archive/` y las specs marcadas `HISTÓRICO` **no se editan** para reflejar el estado actual — se leen como contexto.
- Puntos de entrada del repo: `README.md` (presentación del producto) y `AGENTS.md` (guía para agentes de IA).