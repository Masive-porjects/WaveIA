# Knowledge / Business

## Propósito
Documentar el modelo de negocio, estrategia de mercado, métricas de producto y conocimiento de usuario como base para decisiones de Product Strategist Agent y liderazgo.

## Responsabilidad
- Definir TAM/SAM/SOM, ICP (Ideal Customer Profile), pricing, packaging
- Registrar métricas de negocio: activation, retention, monetization, NPS
- Documentar posicionamiento competitivo vs BandLab, LANDR, iZotope, Masterchannel
- Capturar feedback loops: qué piden usuarios, qué fricciones existen
- Servir como contexto para roadmap priorization y trade-offs técnicos

## Estructura de archivo
```
business/
├── market-analysis.md        # TAM, competidores, diferenciación
├── icp.md                    # Perfil usuario ideal: bedroom producer, indie artist, small studio
├── pricing.md                # Modelos: freemium, pro, studio, enterprise
├── metrics/
│   ├── acquisition.md        # CAC, canales, conversion funnel
│   ├── activation.md         # Time-to-first-master, preset adoption
│   ├── retention.md          # MAU, cohort retention, churn reasons
│   ├── monetization.md       # ARPU, LTV, upgrade paths
│   └── nps.md                # Survey methodology, benchmarks
├── competitive/
│   ├── bandlab.md            # Fortalezas/debilidades vs AudioMind
│   ├── landr.md
│   ├── izotope.md
│   ├── masterchannel.md
│   └── cloudbounce.md
├── user-feedback/
│   ├── feature-requests.md   # Categorizados por tema, votos, status
│   ├── pain-points.md        # Fricciones reales (onboarding, export, latency)
│   └── testimonials.md       # Citas para marketing/credibilidad
├── partnerships.md           # Distros, DAWs, hardware, education
└── go-to-market.md           # Launch phases, content strategy, community
```

## Ejemplos de contenido
- **icp.md**: "Primary: Productor independiente 18-35 años, home studio, 0-5 años experiencia, usa Ableton/FL/Logic, publica en DistroKid/TuneCore, presupuesto <$50/mes tools. Pain: 'No sé masterizar', 'LANDR suena genérico', 'iZotope muy caro/complejo'."
- **pricing.md**: "Free: 3 tracks/mes, watermark, 8 presets. Pro $9.99/mes: 100 tracks, sin watermark, stems download, vocal chain. Studio $29.99/mes: ilimitado, API access, team collab, priority queue."
- **competitive/bandlab.md**: "Fortaleza: free, social, SongStarter AI, mobile app. Debilidad: mastering básico, no stems, no vocal chain, no offline, vendor lock-in. Oportunidad: AudioMind = pro features + ownership + education."

## Futuras integraciones
- **Product Strategist Agent**: Lee business/ para proponer features con ROI estimado
- **Innovation Agent**: Filtra ideas técnicas mediante market-analysis.md y icp.md
- **Chief Audio Engineer**: Prioriza presets/DSP que resuelvan pain-points.md reales
- **RAG**: Responde "¿cuánto cuesta?" "¿qué incluye Pro?" con pricing.md
- **Analytics**: Valida metrics/ contra datos reales → actualiza business/