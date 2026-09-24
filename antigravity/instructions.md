# Especificación del Proyecto — WaveAI (Studio de Mastering IA & Audio DSP)

## 1. Visión General del Proyecto
**WaveAI** es una plataforma avanzada de masterización de audio asistida por IA y procesamiento DSP en tiempo real. Cuenta con:
- **Frontend**: Next.js 16 (App Router), React 19, TypeScript y Tailwind CSS.
- **Motor DSP**: Python (FastAPI, librosa, pedalboard, soundfile) con una cadena de procesamiento de 13 etapas y motor Web Audio API en el navegador.

---

## 2. Objetivos Inmediatos de Reorganización y Arquitectura

Antes de agregar nuevas funcionalidades de audio, se debe reestructurar el frontend y establecer las bases de datos y servicios conforme a los siguientes 6 pilares:

### Pilar 1: Eliminación Total de Convex
- Remover todas las dependencias, configuraciones y carpetas huérfanas de Convex (`apps/studio/convex/`, `@convex-dev/auth`, `convex` en `package.json`, `ConvexClientProvider.tsx`, etc.).
- Limpiar referencias en scripts de CI/CD y documentación histórica para eliminar código muerto y deuda técnica.

### Pilar 2: Arquitectura Limpia por Features y Refactorización de `page.tsx`
- **Diagnóstico**: El archivo actual `apps/studio/src/app/page.tsx` contiene más de 1.900 líneas que mezclan estado de audio, WebSocket, modales, drawers, navegación, llamadas a la API y renderizado.
- **Estructura por Features**: Reorganizar la aplicación bajo una arquitectura modular orientada al dominio dentro de `apps/studio/src/features/`:
  - `features/mastering/`: Cadena de mastering, presets (Pulido, Brutal, Vintage, etc.), reportes LUFS/dBTP, exportación.
  - `features/player/`: Reproductor A/B (Original vs Master), visualizador de forma de onda, sincronización de transporte y ganancia.
  - `features/audio-upload/`: Zona de arrastre (DropZone), validación de formato (WAV/MP3/FLAC), metadata y subida.
  - `features/remastering-history/`: Historial de versiones de audio ($v1, v2, v3$), comparación y notas de cambio.
  - `features/auth/`: Formularios de autenticación, sesión de usuario, protección de rutas y perfil.
  - `features/live-engine/`: Web Audio API, integración con el bridge MIDI y controles en tiempo real.
  - `features/stem-splitter/`: Separación de stems (vocals, drums, bass, other).
  - `features/vocal-chain/`: Cadena y efectos vocales.
  - `features/songstarter/`: Generador de beats y arranque musical.
- **Componentes Compartidos**: Primitivas UI reutilizables (knobs, faders, medidores, modales genéricos, botones, tabs) se ubicarán en `src/shared/components/` o `src/common/`.
- **`page.tsx` Delgada**: `page.tsx` debe actuar únicamente como un orquestador / composition root limpio que ensamble los módulos a través de sus respectivos providers o hooks contenedores.

### Pilar 3: Proceso Modular de Módulos (Feature Flags / Plugin Registry)
- Implementar un sistema de registro de módulos (`FeatureRegistry` / `FeatureFlagService`):
  - Permitir activar o desactivar dinámicamente cualquier herramienta (ej. Splitter, Vocal, Beats, Live Engine, Álbum, Historial) mediante configuración centralizada (`features.config.ts`).
  - Habilitar que nuevos módulos a futuro se integren simplemente registrándose en el `ModuleDock` o barra de herramientas sin alterar el código central.

### Pilar 4: Preservación de la Funcionalidad y Calidad de Audio Actual
- Todo el procesamiento existente (DSP de 13 etapas, modo transparente bit-exacto, player A/B, WebSocket con el bridge `:8765`, panel flotante de entrega y reporte de cumplimiento) debe seguir funcionando con idéntica precisión sonora y de interfaz.

### Pilar 5: Sistema Multiidioma Extensible (i18n)
- Soporte inicial nativo para **Español (ES)** (español latinoamericano neutro / colombiano sin voseo) e **Inglés (US)**.
- Arquitectura preparada para añadir nuevos idiomas (PT, FR, DE, etc.) mediante diccionarios modulares (`locales/es.json`, `locales/en.json`) y hooks de traducción tipados (`useTranslation`).

### Pilar 6: Autenticación, Carga y Persistencia de Historial con Supabase
- **Autenticación**:
  - Integración de Supabase Auth vía `@supabase/ssr` con cookies seguras para Next.js 16 App Router.
  - Pantallas de inicio de sesión y registro, recuperación de contraseña y middleware de protección de rutas.
- **Gestión de Carga de Audio**:
  - Subida directa a Supabase Storage mediante URLs prefirmadas / subidas reanudables, protegiendo la memoria de los servidores.
- **Historial de Versiones y Remasterización**:
  - Modelo relacional en PostgreSQL (`profiles`, `tracks`, `master_versions`).
  - Capacidad de consultar el historial completo de remasterizaciones de una pista, reproducir cualquier versión anterior y lanzar una nueva remasterización ($v2, v3$) preservando la pista original intacta.