# Memory Architecture Specification

## Propósito
Definir la arquitectura de memoria para los agentes de AudioMind. Este documento **solo documenta** — no implementa. La implementación real vendrá en fases futuras cuando se integren RAG, Vector DB y sistemas de memoria persistente.

## Responsabilidad
- Diferenciar claramente 6 tipos de memoria con propósitos, TTL, y accesos distintos
- Definir interfaces conceptuales (no código) para lectura/escritura por tipo
- Establecer políticas de retención, consolidación y olvido
- Servir como spec para futuros agentes de memoria e infraestructura

---

## 1. Short Term Memory (STM) — Memoria de Trabajo

**Propósito**: Contexto inmediato de la sesión/interacción actual. Lo que el agente "sabe ahora mismo".

**Características**:
- TTL: Sesión única (minutos a horas)
- Capacidad: ~50-100 items (ventana de contexto LLM)
- Acceso: Lectura/escritura ultra-rápida (in-memory)
- Persistencia: Ninguna (se pierde al reiniciar agente)

**Contenido típico**:
- Track actual siendo procesado (metadata, análisis, preset seleccionado)
- Parámetros de UI actuales (knob values, tab activo)
- Historial de conversación inmediato (últimos 10-20 turns)
- Estado de tarea en progreso (paso actual, sub-tasks completados)
- Cache de computaciones recientes (LUFS calculado, genre detectado)

**Agentes que escriben**: Todos (Chief, DSP, Research, Innovation, Product)
**Agentes que leen**: Todos (contexto compartido por sesión)

**Política de consolidación**: Al cerrar sesión, items relevantes → LTM (ver abajo). Resto se descarta.

---

## 2. Long Term Memory (LTM) — Memoria Episódica / Semántica Persistente

**Propósito**: Conocimiento duradero acumulado a lo largo del tiempo. Hechos, experiencias, decisiones, patrones aprendidos.

**Características**:
- TTL: Años (persistente en DB / vector store)
- Capacidad: Ilimitada (miles de documentos)
- Acceso: Búsqueda semántica (RAG) + filtros metadata
- Persistencia: PostgreSQL + Vector DB (Chroma/Pinecone/Milvus)

**Contenido típico**:
- **Episódica**: "El 2026-07-15, usuario X masterizó track Y con preset Brutal, resultado LUFS -13.8, usuario aceptó" (cada sesión de mastering = episodio)
- **Semántica**: "Preset Brutal óptimo para trap con crest factor >14dB" (generalización de episodios)
- **Decisiones**: "DEC-001: Ceiling dinámico basado en crest factor" (con evidencia EXP-003)
- **Patrones de usuario**: "Usuario prefiere Cristalino sobre Crudo para pop vocal"
- **Feedback**: "Usuario reportó 'suena comprimido' en track ID 442 → investigar"

**Estructura de registro**:
```json
{
  "id": "mem_abc123",
  "type": "episodic|semantic|decision|pattern|feedback",
  "timestamp": "2026-07-29T10:30:00Z",
  "agent": "chief_audio_engineer",
  "session_id": "sess_xyz",
  "content": {...},
  "embedding": [0.1, -0.3, ...],
  "tags": ["preset:fuego", "genre:trap", "lufs:-13.8"],
  "confidence": 0.92,
  "source": "user_acceptance|experiment|explicit_feedback|inference"
}
```

**Agentes que escriben**: Chief (decisiones), Research (hallazgos), Innovation (patrones), todos (episodios)
**Agentes que leen**: Todos via RAG query

**Política de consolidación**: 
- Episódica cruda → batch nightly → extraer semántica → almacenar semántica + mantener episódica sampleada
- Olvido: Episodios > 2 años sin acceso → archive frío (S3 Glacier)
- Conflictos: Nueva evidencia con confidence > 0.8 sobrescribe semántica antigua (versionado)

---

## 3. Semantic Memory — Conocimiento Declarativo Estructurado

**Propósito**: El "Knowledge Core" mismo — hechos, definiciones, reglas, especificaciones que son verdaderamente independientes de episodios.

**Características**:
- TTL: Permanente (versionado)
- Capacidad: Cientos de documentos estructurados
- Acceso: Búsqueda exacta + semántica, consultas estructuradas
- Persistencia: Git (Markdown) + Vector DB indexado

**Contenido**: **Exactamente lo que está en `knowledge/`**:
- `knowledge/presets/*.md` — Definiciones canónicas de presets
- `knowledge/plugins/*.md` — Specs de plugins DSP
- `knowledge/genres/*.md` — Perfiles técnicos de géneros
- `knowledge/mastering/*.md` — Pipeline, standards, target curves
- `knowledge/metrics/*.md` — Definiciones de métricas
- `knowledge/philosophy/*.md` — Principios, ética, design language
- `knowledge/roadmap/*.md` — Fases, ADRs, milestones
- `knowledge/business/*.md` — ICP, pricing, competitors, metrics
- `knowledge/experiments/*.md` — Registro de experimentos

**Diferencia clave con LTM**: 
- LTM = "Aprendí que..." (derivado de experiencia, probabilístico, versionado por evidencia)
- Semantic = "Está documentado que..." (fuente de verdad autoritativa, curada por humanos/agentes senior)

**Agentes que escriben**: Chief Audio Engineer (curador), DSP Designer (specs), Product Strategist (roadmap), Innovation (nuevos conceptos)
**Agentes que leen**: Todos (RAG primary source)

**Política de actualización**: 
- Solo via PR/approval (humano o Chief Agent con confidence > 0.95)
- Versionado semántico en Git
- Vector DB re-indexado on merge

---

## 4. Procedural Memory — Habilidades / How-To

**Propósito**: Saber *cómo* hacer cosas — procedimientos, algoritmos, workflows, recetas ejecutables.

**Características**:
- TTL: Permanente (actualizable)
- Formato: Pseudocódigo, decision trees, flowcharts, código real
- Acceso: Recuperación por intención ("¿cómo masterizo un trap?") → pasos ejecutables

**Contenido típico**:
- **Pipeline procedures**: "Mastering pipeline step-by-step" (referencia a mastering/pipeline.md + params)
- **DSP recipes**: "Cómo configurar compressor FET para 808 punch" → params concretos
- **Debugging playbooks**: "Si LUFS off > 1dB → check ceiling → check saturation → check limiter"
- **Agent workflows**: "Cómo Research Agent diseña experimento" → pasos, templates, checklists
- **Onboarding guides**: "Cómo un nuevo agente aprende AudioMind" → knowledge/ reading order

**Estructura**:
```markdown
# Procedure: Mastering Trap Track
Trigger: genre=detected_trap AND preset=auto
Steps:
  1. Analyze: crest_factor, LUFS, TP, sub_bass_energy
  2. If crest < 10: ceiling = -2dBTP (already_mastered_path)
  3. Preset: Brutal (params: sat_tube_drive=3, comp_fet_ratio=4:1, eq_low_shelf=+2@60Hz)
  4. Match EQ: target_curves/trap_target_curve.md
  5. Limit: true_peak=-1dBTP, oversample=4x
  6. Dither: Lipshitz 2nd order
  7. Validate: quality_gates.md
Fallback: If any step fails → Pulido preset + log
```

**Agentes que escriben**: DSP Designer (recetas), Chief (workflows), Research (metodologías)
**Agentes que leen**: Chief (ejecución), DSP (implementación), Innovation (mejora de procedimientos)

---

## 5. Research Memory — Conocimiento Exploratorio / Hipótesis

**Propósito**: Almacenar hallazgos de investigación, papers, experimentos en curso, hipótesis no validadas, y "cosas por investigar".

**Características**:
- TTL: Variable (hipótesis → validadas → LTM/Semantic; descartadas → archive)
- Formato: Estructurado (hipótesis, evidencia, confidence, status)
- Acceso: Query por tema, status, confidence

**Contenido típico**:
- Paper summaries: "ResNet50 en Mel-specs 92% accuracy en GTZAN (ref: arXiv:2301.xxxxx)"
- Hipótesis abiertas: "HIP-007: ¿Mejorar match EQ con curvas por artista vs género?"
- Experimentos en curso: "EXP-012 en progreso: saturation type A/B test"
- Tech radar: "Demucs v4.0 released — evaluar para stem isolation Module B"
- Failed paths: "Intentamos CNN en raw waveform — no converge (EXP-008)"

**Estructura**:
```json
{
  "id": "res_007",
  "type": "paper|hypothesis|experiment_in_progress|tech_radar|failed_path",
  "title": "Genre classification via raw waveform vs spectrogram",
  "status": "exploring|validated|rejected|archived",
  "confidence": 0.0-1.0,
  "evidence": ["link_to_paper", "link_to_exp"],
  "tags": ["ml", "genre", "cnn"],
  "created_by": "research_agent",
  "updated_at": "2026-07-29"
}
```

**Agentes que escriben**: Research Agent (principal), Innovation Agent (tech radar)
**Agentes que leen**: Innovation (ideas), DSP (técnicas nuevas), Product (feasibility)

---

## 6. Business Memory — Contexto de Negocio / Usuario

**Propósito**: Conocimiento sobre usuarios, mercado, métricas, feedback, y decisiones de negocio que informa decisiones de producto.

**Características**:
- TTL: Años (actualizado continuamente)
- Formato: Métricas series temporales + insights cualitativos + decisiones
- Acceso: Dashboards + query semántica

**Contenido típico**:
- **User insights**: "Usuarios free tier abandonan en preset selection (60% drop-off)"
- **Cohort metrics**: "Cohort Jul 2026: 40% retention week 1, 15% week 4"
- **Feature adoption**: "Vocal Sculptor: 5% de Pro users lo usan, pero 80% NPS"
- **Competitive intel**: "LANDR lanzó 'Stem Mastering' $49 add-on — Oct 2026"
- **Pricing experiments**: "A/B test $7.99 vs $9.99 Pro: +12% conversion, -3% ARPU"
- **Strategic decisions**: "DEC-BIZ-003: Freemium model over perpetual licenses (2026-07)"

**Estructura**:
```json
{
  "id": "biz_003",
  "type": "insight|metric|decision|competitive|feedback",
  "title": "Free tier drop-off at preset selection",
  "metric": "activation_rate",
  "value": "0.40",
  "trend": "stable",
  "segment": "free_users",
  "source": "posthog_funnel",
  "insight": "Users overwhelmed by 8 presets without guidance",
  "action": "Implement preset recommender (IDEA-001)",
  "tags": ["activation", "onboarding", "preset"],
  "recorded_by": "product_strategist_agent"
}
```

**Agentes que escriben**: Product Strategist (principal), Chief (user feedback), Innovation (market signals)
**Agentes que leen**: Product Strategist (roadmap), Innovation (ideas), Chief (explain value to user)

---

## Resumen: Matriz de Acceso por Agente

| Memoria \ Agente | Chief Audio Engineer | DSP Designer | Research | Innovation | Product Strategist |
|------------------|---------------------|--------------|----------|------------|-------------------|
| **STM**          | R/W (contexto sesión) | R/W | R/W | R/W | R/W |
| **LTM**          | R (episodios usuario) | R (patrones DSP) | R/W (hallazgos) | R/W (patrones) | R (feedback) |
| **Semantic**     | R (knowledge/*) | R/W (plugins, presets) | R (metrics, mastering) | R (philosophy, roadmap) | R (business, roadmap) |
| **Procedural**   | R/W (workflows) | R/W (recipes) | R (methodologies) | R (workflows) | R (processes) |
| **Research**     | R (validated) | R (techniques) | R/W (todo) | R (radar) | R (feasibility) |
| **Business**     | R (user context) | - | - | R (market) | R/W (todo) |

---

## Próximos Pasos de Implementación (Fase 5+)

1. **Infra**: PostgreSQL + pgvector / Chroma / Milvus para LTM + Semantic + Research + Business
2. **STM**: In-memory dict per session (Redis para multi-instance)
3. **APIs**: `memory.read(type, query)`, `memory.write(type, record)`, `memory.consolidate(session_id)`
4. **Agents**: Cada agente implementa `MemoryClient` con sus patrones de acceso
5. **Nightly jobs**: STM→LTM consolidation, LTM→Semantic extraction, embedding re-index
6. **Governance**: Chief Agent como curador de Semantic + Procedural; Research Agent dueño de Research

---

*Este documento es la especificación. La implementación real reside en futuros módulos `backend/src/audiomind/intelligence/memory/` con código, no Markdown.*