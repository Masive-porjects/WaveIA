# Ideas

## Propósito
Capturar, estructurar y priorizar ideas de features, mejoras, investigación y experimentos antes de que entren al roadmap formal.

## Responsabilidad
- Servir como "inbox" estructurado para cualquier insight (usuario, agente, dev, competidor)
- Estandarizar evaluación: problema, beneficio, costo, complejidad, prioridad
- Evitar pérdida de ideas valiosas y duplicación
- Alimentar Innovation Agent y Product Strategist Agent
- Trazabilidad: idea → experimento → roadmap → implementación

## Estructura de archivo
```
ideas/
├── IDEA-001_genre-preset-auto-select.md
├── IDEA-002_stem-remix-export.md
├── IDEA-003_ai-mix-assistant.md
├── IDEA-004_reference-match-eq.md
├── IDEA-005_collaborative-mastering.md
├── IDEA-006_preset-marketplace.md
├── IDEA-007_loudness-penalty-simulator.md
├── IDEA-008_batch-processing.md
├── index.md                    # Tabla: ID, título, estado, prioridad, owner, fecha
├── backlog.md                  # Ideas en backlog (prioridad baja/media sin owner)
├── archive/
│   ├── IDEA-009_deprecated.md  # Ideas descartadas con razón
│   └── IDEA-010_merged.md      # Ideas fusionadas en otra
└── templates/
    └── idea.template.md        # (referencia a templates/idea.template.md)
```

## Formato obligatorio (ver templates/idea.template.md)
Cada idea **debe** contener:
- **Título**: Descriptivo, único, prefijado `IDEA-XXX_`
- **Descripción**: Qué es en 2-3 frases
- **Problema**: Qué dolor resuelve (user quote si existe)
- **Beneficio**: Valor para usuario y/o negocio (métrica si posible)
- **Costo**: Estimación esfuerzo (dev weeks, infra $, mantenimiento)
- **Complejidad**: Baja/Media/Alta + riesgos técnicos
- **Prioridad**: P0 (crítico), P1 (alto), P2 (medio), P3 (bajo), P4 (nice-to-have)
- **Estado**: Nueva → En evaluación → Aprobada → En roadmap → En desarrollo → Hecha / Descartada / Fusionada
- **Inspiración**: Fuente (feedback usuario, competidor, paper, hackathon, agente)
- **Referencias**: Links a issues, PRs, docs, experiments, competitors
- **Notas**: Contexto adicional, dependencias, open questions

## Ejemplo: IDEA-001_genre-preset-auto-select.md
```markdown
Título: IDEA-001 Auto-selección de preset por género detectado
Descripción: Tras análisis de audio, sistema sugiere y pre-selecciona preset óptimo basado en género+características track
Problema: "No sé qué preset elegir — son 8 y suenan parecido" (78% usuarios en onboarding survey)
Beneficio: Reduce decision paralysis, mejora first-track success rate target +25%, aumenta activation
Costo: 2 dev weeks (ML genre detector + preset recommender XGBoost) + 1 week A/B test
Complejidad: Media — requiere dataset etiquetado, model serving, fallback heurístico
Prioridad: P1 (high impact, differentiated vs LANDR/BandLab)
Estado: En evaluación
Inspiración: BandLab SongStarter genre detection + user interviews Q3
Referencias: AUDIOMIND_AI_ML_STRATEGY.md#modelo-2, EXP-003, competitor-analysis/bandlab.md
Notas: Depende de EXP-003 genre-preset correlation. Fallback: reglas heurísticas si confidence < 0.6.
```

## Flujo de vida
```
Nueva idea → ideas/IDEA-XXX.md (estado: Nueva)
    → Innovation Agent review semanal → En evaluación
    → Si P0/P1 + feasible → Product Strategist aprueba → En roadmap (roadmap/phase-X.md)
    → Si P2/P3 → Backlog (backlog.md) o Archive
    → Si duplicada → Fusionada (archive/IDEA-XXX_merged.md + link en original)
    → Si inviable → Descartada (archive/IDEA-XXX_deprecated.md + razón)
```

## Futuras integraciones
- **Innovation Agent**: Escanea feedback, tickets, competitors, papers → crea ideas/ automáticamente
- **Product Strategist**: Prioriza ideas/ contra business/unit-economics.md e icp.md
- **Research Agent**: Convierte ideas P1/P2 en experiments/ (IDEA → EXP)
- **Chief Audio Engineer**: Valida ideas técnicas contra philosophy/ y presets/
- **RAG**: "¿Han pensado en X?" → busca ideas/ + index.md
- **Sprint Planning**: Input directo desde ideas/ estado "En roadmap"