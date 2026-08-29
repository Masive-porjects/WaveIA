# Knowledge / Philosophy

## Propósito
Articular la visión, valores y principios de diseño que definen a AudioMind como producto y como sistema técnico.

## Responsabilidad
- Declarar la misión: "Empoderar a artistas independientes con mastering de nivel profesional sin gatekeeping"
- Definir principios innegociables: transparencia sonora, control del usuario, no destructividad, educación integrada
- Establecer postura ética: no DRM, no vendor lock-in, datos del usuario = del usuario
- Definir la estética técnica: skeuomorfismo industrial, física fluida, cyber-dark
- Servir como brújula para decisiones de producto, arquitectura y roadmap

## Estructura de archivo
```
philosophy/
├── mission.md              # Declaración de misión y visión 10 años
├── principles.md           # 7 principios innegociables
├── ethics.md               # Postura sobre datos, IA, accesibilidad
├── design-language.md      # Cyber-dark, skeuomorfismo, GSAP physics
├── product-strategy.md     # Diferenciación vs BandLab, LANDR, iZotope
├── education-first.md      # Guías, GenreGuide, MasteringGuide como features
└── anti-goals.md           # Qué NO haremos (auto-mastering ciego, suscripción forzada)
```

## Ejemplos de contenido
- **principles.md**: "1. Transparencia sobre coloración. 2. Usuario decide, sistema sugiere. 3. Track original intocable. 4. Métricas honestas, no marketing. 5. Offline-first, cloud-opcional. 6. Código abierto donde sea posible. 7. Accesibilidad = prioridad, no afterthought."
- **anti-goals.md**: "NO: 'One-click magic' que destruye dinámica. NO: Modelo de suscripción sin free tier real. NO: Entrenar modelos con audio de usuarios sin consentimiento explícito."

## Futuras integraciones
- **Product Strategist Agent**: Valida cada feature contra principles.md y anti-goals.md
- **Chief Audio Engineer**: Usa mission.md para explicar decisiones al usuario
- **Innovation Agent**: Filtra ideas mediante ethics.md y design-language.md
- **RAG**: Responde "¿por qué AudioMind hace X así?" con philosophy/