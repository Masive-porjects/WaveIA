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

## 3. Principios de Interfaz y Audio (No Negociables)
- **Regla "Neutral = Bypass"**: Si un control o parámetro está en neutral, el resultado de audio es bit-exacto respecto al original.
- **Sin Saltos de Ganancia (Anti-zipper)**: En Web Audio API, nunca asignar valores de ganancia o filtros directamente; usar siempre rampas suaves con `setTargetAtTime`.
- **Reproductor A/B Sincronizado**: El cambio entre audio original y masterizado debe ser instantáneo, sin desfasar la posición de reproducción (transporte sincronizado al milisegundo).
- **Microcopy**:
  - Español: Neutro latinoamericano (colombiano/latino sin voseo). Tono técnico, directo y amigable ("Sube tu audio", "Ajusta los parámetros", "Compara A/B").
  - Inglés: Profesional de industria ("Upload your track", "Adjust parameters", "Compare A/B").

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
   - Cada fase se trabaja en una rama nueva basada en `staging` (`feat/fase-...`).
   - Prohibido hacer push directo a `staging`; toda integración se hace exclusivamente vía Pull Requests (PRs).
   - La rama `main` **nunca se toca** a menos que se indique explícitamente lo contrario.