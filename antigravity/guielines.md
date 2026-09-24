# Guías de Diseño & Arquitectura — WaveAI Studio

## 1. Identidad Visual y Paleta de Colores
La estética de WaveAI evoca un estudio de producción musical profesional de alta gama, combinando interfaces de hardware analógico de precisión con dinamismo digital moderno (onda púrpura → cian sobre fondo ultra-dark).

### Tokens Principales (Tema Oscuro por Defecto)
- **Fondo Base (Studio Canvas)**: `#0a0a0c` / `#0b0b0c` (`--bg-primary`, `--bg-app`)
- **Fondo de Paneles y Racks**: `#121216` (`--bg-secondary`)
- **Fondo de Tarjetas y Módulos**: `#1a1a20` (`--bg-tertiary`)
- **Superficies Elevadas / Sheets**: `#22222a` (`--bg-elevated`)
- **Acento Primario (Studio Slate)**: `#627e84` / `#829ca1`
- **Onda Masterizada / Acento Activo**: `#00d4aa` (Cian de alta visibilidad para forma de onda masterizada)
- **Onda Original (Referencia)**: `#484855` (Gris frío de contraste neutro)
- **Bordes y Separadores**: `#2a2a2a` (Hover: `#3a3a3a`)
- **Medidores de Nivel (Meters & LEDs)**:
  - Seguro (Safe): `#34c759` (Verde analógico)
  - Precaución (Warn): `#ff9500` (Ámbar cálido)
  - Clipping / Alerta (Clip): `#ff3b30` / `#dc2626` (Rojo crítico)

---

## 2. Tipografía Oficial
- **Fuentes Principales**:
  - `Inter` (`wght 300, 400, 500, 600, 700`): Para toda la interfaz de usuario, etiquetas técnicas, tablas y controles.
  - `Instrument Serif`: Usada para titulares estilizados y detalles de marca.
  - Fuentes Monoespaciadas (`ui-monospace`, `Courier New` o similar): Para lecturas numéricas de precisión (LUFS, dBTP, BPM, Hz, Sample Rate).

---

## 3. Principios de Interfaz, Multiidioma y Estética (No Negociables)
- **Multiidioma Obligatorio (i18n)**:
  - **Toda nueva integración, vista o componente DEBE conectarse al sistema i18n** mediante el hook `useTranslation()`.
  - Los textos se deben registrar simultáneamente en `apps/studio/src/i18n/locales/es.json` y `en.json`.
  - **Prohibido el texto "hardcodeado"** en código TSX/JSX y **prohibido el spanglish** (consistencia absoluta: 100% español latino neutro en `es.json` y 100% inglés natural de industria en `en.json`).
  - Microcopy en español sin voseo ("Sube tu audio", "Ajusta los parámetros", "Compara A/B", "Elige", "Toca").
- **Estética Visual y Design System WaveIA**:
  - **Tokens de Color Obligatorios**: Emplear siempre las variables CSS del sistema (`var(--bg-base)`, `var(--surface-elevated)`, `var(--bg-glass-elevated)`, `var(--accent-primary)`, `var(--border-subtle)`). Prohibido usar estilos arbitrarios o colores planos genéricos que desentonen con la estética de hardware analógico de alta gama.
  - **Glassmorphism y Acabados de Estudio**: Fondos traslúcidos con `backdrop-blur-2xl`, sombras profundas con iluminación de borde superior (`inset 0 1px 0 rgba(255,255,255,0.08)`).
  - **Identidad de Marca WaveIA**: Integrar los elementos visuales distintivos (mascota fantasma interactiva `BigGhostWithNotes`, `FloatingGhosts`, notas musicales flotantes `FloatingNotes` y orbes de gradiente místico) en pantallas de acceso, landing y estados clave.
  - **Ergonomía y Cero Scroll Innecesario**: Pantallas de formulario y autenticación (`/login`, `/register`), modales y diálogos compactos deben diseñarse para ajustarse exactamente al viewport (`100vh`) sin generar barras de desplazamiento vertical en pantallas de laptop y escritorio.
  - **Micro-interacciones y Animaciones**: Uso de `framer-motion` para transiciones fluidas de estados, retroalimentación táctil/visual en tiempo real (indicadores de fortaleza de contraseña, hovers reactivos y loaders).
- **Regla "Neutral = Bypass"**: Si un control o parámetro está en neutral, el resultado de audio es bit-exacto respecto al original.
- **Sin Saltos de Ganancia (Anti-zipper)**: En Web Audio API, nunca asignar valores de ganancia o filtros directamente; usar siempre rampas suaves con `setTargetAtTime`.
- **Reproductor A/B Sincronizado**: El cambio entre audio original y masterizado debe ser instantáneo, sin desfasar la posición de reproducción (transporte sincronizado al milisegundo).

---

## 4. Prioridades de Organización de Código
1. **Arquitectura Limpia por Features**:
   - Cada funcionalidad reside en su propio directorio dentro de `src/features/<feature-name>/`:
     - `components/`: Componentes visuales específicos de esa feature.
     - `hooks/`: Lógica de estado y side effects de la feature.
     - `services/`: Peticiones a APIs o llamadas a Supabase específicas.
     - `types/`: Tipos de datos del dominio de la feature.
2. **Capa Compartida (`src/shared/` o `src/common/`)**:
   - Todo componente genérico (knobs, sliders, botones, modales base, spinners, utilidades de audio) debe vivir en la capa común y no depender de features específicas.
3. **Desacoplamiento y Modularidad**:
   - Cada feature debe poder ser encendida, apagada o reemplazada desde el registro central (`features.config.ts`) sin romper la compilación del resto de la aplicación.
4. **Sin Código Huérfano**:
   - No mantener librerías en desuso (eliminar Convex por completo).
   - Mantener TypeScript estricto con cero errores de compilación y evitar `any` en contratos de audio.
5. **Flujo de Git Estricto**:
   - Cada fase se trabaja en una rama nueva basada en `dev` (`feat/fase-...`).
   - Prohibido hacer push directo a `dev`; toda integración se hace exclusivamente vía Pull Requests (PRs).
   - La rama `main` **nunca se toca** a menos que se indique explícitamente lo contrario.
6. **Reporte Formal por Fase**:
   - Al culminar cada fase se debe generar y entregar un informe estructurado que detalle los cambios, archivos afectados, resultados de pruebas (`lint`/`build`/`tests`) y el estado del roadmap.
   - El historial de reportes se guardará en `antigravity/reports/report-fase-X.md`.