"""
AudioMind Intelligence — Knowledge Core

Este módulo constituye el cerebro de conocimiento de AudioMind.
Es completamente independiente del procesamiento DSP y no contiene
ninguna lógica de IA, embeddings, RAG, ni bases vectoriales.

Arquitectura:
- knowledge/     : Dominios de conocimiento estructurado (presets, plugins, géneros, etc.)
- ideas/         : Captura y evolución de ideas de producto/ingeniería
- memory/        : Documentación de arquitectura de memoria futura (no implementada)
- templates/     : Plantillas Markdown estandarizadas para cada tipo de conocimiento
- schemas/       : Modelos Pydantic que definen la estructura de datos de conocimiento

Uso futuro:
- Chief AudioMind:
  - Los agentes (Chief Audio Engineer, DSP Designer, Research, Innovation, Product Strategist)
    leerán/escribirán en knowledge/ usando los schemas
  - RAG se conectará a knowledge/ como fuente de verdad
  - Vector DB indexará contenido de knowledge/ + ideas/ + experiments/
  - Memory system implementará memory/ spec
"""