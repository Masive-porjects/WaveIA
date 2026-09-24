# Plan de Implementación por Fases — WaveAI

Este documento establece la hoja de ruta técnica paso a paso para la reorganización y evolución de **WaveAI**. Cada fase tiene objetivos concretos, entregables verificables y criterios de aceptación para garantizar que no se rompa ninguna funcionalidad existente de audio o interfaz.

---

## 🌿 Flujo Obligatorio de Git & Ramas (Reglas Estrictas)

1. **Base de Trabajo**:
   - Cada fase se iniciará creando una **rama nueva basada en `dev`** (ejemplo: `feat/fase-0-limpieza-convex`, `feat/fase-1-features-i18n`, etc.).
2. **Sin Push Directo**:
   - Está **estrictamente prohibido hacer push directo a la rama `dev`**.
   - Toda integración a `dev` se realizará **exclusivamente a través de Pull Requests (PRs)** verificados.
3. **Rama `main` Intocable**:
   - La rama `main` **NUNCA se toca** ni se le hace push ni merge, a menos que el usuario lo especifique de manera explícita por escrito.
4. **Ciclo por Fase**:
   - `git checkout dev` → `git pull origin dev` → `git checkout -b feat/fase-X-...`
   - Implementación + Pruebas locales (`lint`, `build`, `pytest`).
   - Commit semántico → Push de la rama feature → Creación del PR hacia `dev`.

---

## 🗺️ Visión General de las Fases

| Fase | Título | Enfoque Principal |
| :--- | :--- | :--- |
| **Fase 0** | **Limpieza de Convex** | Eliminar código muerto y dependencias no utilizadas |
| **Fase 1** | **Infraestructura Base: Feature Flags & i18n** | Modularidad de módulos (toggle) y multiidioma ES/US |
| **Fase 2** | **Arquitectura Limpia por Features & Refactor de `page.tsx`** | Descomponer las 1.936 líneas en módulos aislados |
| **Fase 3** | **Autenticación de Usuarios con Supabase** | Login, registro, sesiones seguras SSR y protección de rutas |
| **Fase 4** | **Gestión de Carga de Audio en Storage** | Subida directa a Supabase Storage con URLs prefirmadas |
| **Fase 5** | **Historial de Mezclas y Remasterización** | Versiones ($v1, v2, v3$), comparación A/B y nuevo mastering |
| **Fase 6** | **Integración del Worker DSP Python (AudioMind)** | Procesamiento desacoplado con reporte de métricas en BD |
| **Fase 7** | **Validación Integral y Cierre** | Verificación sonora, linter, builds y pruebas de regresión |

---

## 📋 Detalle de Cada Fase

### 🧹 FASE 0: Limpieza de Convex (Código Muerto)
**Objetivo**: Eliminar completamente la integración previa incompleta de Convex para limpiar el bundle y evitar dependencias cruzadas.

- **Tareas**:
  1. Eliminar la carpeta `apps/studio/convex/` en su totalidad.
  2. Eliminar `apps/studio/src/app/ConvexClientProvider.tsx`.
  3. Desinstalar dependencias en `apps/studio/package.json`:
     - `convex`
     - `@convex-dev/auth`
  4. Remover el wrapper de Convex en `apps/studio/src/app/layout.tsx`.
  5. Limpiar referencias en `apps/studio/src/middleware.ts` y scripts de setup (`scripts/setup/`).
- **Criterio de Aceptación**: `bun run build` o `npm run build` en `apps/studio` compila exitosamente sin ninguna referencia a Convex.

---

### 🎛️ FASE 1: Infraestructura Base (Feature Flags & Multiidioma)
**Objetivo**: Crear los cimientos para encender/apagar módulos y dar soporte a Español e Inglés desde el inicio.

- **1.1 Sistema de Feature Flags (Modularidad)**:
  - Crear `apps/studio/src/shared/config/features.config.ts` definiendo las herramientas activables:
    ```ts
    export const FEATURE_FLAGS = {
      mastering: { id: "mastering", enabled: true, labelKey: "tabs.mastering" },
      history: { id: "history", enabled: true, labelKey: "tabs.history" },
      splitter: { id: "splitter", enabled: true, labelKey: "tabs.splitter" },
      vocalChain: { id: "vocalChain", enabled: true, labelKey: "tabs.vocal" },
      songstarter: { id: "songstarter", enabled: true, labelKey: "tabs.songstarter" },
      liveEngine: { id: "liveEngine", enabled: true, labelKey: "tabs.live" },
      genres: { id: "genres", enabled: true, labelKey: "tabs.genres" },
      album: { id: "album", enabled: true, labelKey: "tabs.album" },
    };
    ```
  - Crear hook `useFeatures()` para consultar el estado de cada módulo.
  - Conectar el dock de navegación (`ModuleDock`) para que renderice dinámicamente solo las herramientas con `enabled: true`.

- **1.2 Sistema de Multiidioma (i18n)**:
  - Crear directorio `apps/studio/src/i18n/`:
    - `locales/es.json` (Español neutro / latino).
    - `locales/en.json` (Inglés de industria).
    - `I18nProvider.tsx` y hook `useTranslation()`.
  - Crear selector de idioma `LanguageSwitcher` integrado en la barra superior / menú.
- **Criterio de Aceptación**: Se puede apagar cualquier pestaña desde la configuración sin romper la UI, y la app cambia de idioma al instante.

---

### 🏗️ FASE 2: Arquitectura Limpia por Features & Refactorización de `page.tsx`
**Objetivo**: Descomponer el archivo monolítico `apps/studio/src/app/page.tsx` (1.936 líneas) en dominios limpios y reutilizables.

- **Estructura de Features a Crear en `apps/studio/src/features/`**:
  1. `audio-upload/`:
     - Componentes: `DropZoneContainer`, validaciones de formato (WAV/MP3/FLAC) y tamaño.
     - Hook: `useAudioUpload`.
  2. `player/`:
     - Componentes: `AudioPlayerBar`, `WaveformView`, `ABComparisonToggle`, `LoudnessMeters`.
     - Hook: `useAudioTransport` (sincronización bit-exacta A/B y suavizado anti-zipper).
  3. `mastering/`:
     - Componentes: `PresetGrid`, `FloatingDeliverySheet`, `ReportCardModal`, controles de carácter.
     - Hook: `useMasteringWorkflow`.
  4. `live-engine/`:
     - Componentes: visualizador del Web Audio API, knobs de FX (filtro, drive, reverb, delay).
     - Hook: conexión con WebSocket `:8765` y puente MIDI.
  5. `stem-splitter/`, `vocal-chain/`, `songstarter/`:
     - Migración de los paneles actuales a sus respectivos módulos aislados.
- **Refactorización de `page.tsx`**:
  - `page.tsx` se convierte en un **Composition Root** limpio (<150 líneas) que solo ensambla los contenedores principales y providers.
- **Criterio de Aceptación**: Toda la experiencia actual (subir audio, masterizar, comparar A/B, cambiar presets, Live Engine) funciona idéntica a la actual, pero con el código 100% modularizado.

---

### 🔐 FASE 3: Módulo de Autenticación con Supabase
**Objetivo**: Añadir cuentas de usuario para proteger el acceso y permitir que cada productor musical guarde sus proyectos.

- **Tareas**:
  1. Instalar `@supabase/ssr` y `@supabase/supabase-js` en `apps/studio`.
  2. Configurar utilidades oficiales de Supabase:
     - `src/lib/supabase/client.ts` (Navegador).
     - `src/lib/supabase/server.ts` (Server Actions / Server Components).
     - `src/lib/supabase/middleware.ts` (Refresco de sesión con cookies).
  3. Crear vistas en `apps/studio/src/app/(auth)/`:
     - `/login`: Formulario de acceso (Email/Contraseña + Magic Link/OAuth).
     - `/register`: Registro de nuevos usuarios.
  4. Crear componente `UserMenu` en la barra de navegación para mostrar perfil, estado de sesión y botón de cierre.
- **Criterio de Aceptación**: El usuario puede registrarse, iniciar sesión, cerrar sesión y sus credenciales se validan contra Supabase.

---

### 📦 FASE 4: Gestión de Carga de Audio (Supabase Storage)
**Objetivo**: Almacenar archivos WAV pesados de forma directa y segura en la nube sin saturar la memoria RAM del servidor.

- **Tareas**:
  1. Crear buckets de almacenamiento en Supabase:
     - `audio-originals` (archivos subidos sin procesar).
     - `audio-masters` (archivos procesados por el motor DSP).
  2. Configurar políticas de seguridad RLS en el Storage:
     - Cada usuario solo puede leer y subir archivos a su propia carpeta (`auth.uid()`).
  3. Implementar generación de **URLs prefirmadas**:
     - El cliente solicita permiso de subida y sube el archivo binario directamente al bucket de Supabase.
  4. Registrar la pista en la tabla `tracks` de la base de datos con su metadata (título, duración, sample rate, género detectado).
- **Criterio de Aceptación**: Subir un WAV de 50MB no incrementa la memoria del servidor de Next.js ni de Python; el archivo queda alojado y protegido en Supabase Storage.

---

### 📜 FASE 5: Historial de Mezclas y Remasterización
**Objetivo**: Permitir a los usuarios consultar sus pistas previas, ver el historial de versiones ($v1, v2, v3$) y remasterizar sin resubir el audio original.

- **Tareas**:
  1. Diseñar el esquema de base de datos relacional:
     - `profiles`: Datos de usuario y preferencias.
     - `tracks`: Pistas originales (`title`, `original_audio_path`, `bpm`, `genre`).
     - `master_versions`: Cada render de mastering (`version_number`, `preset_id`, `platform_target`, `integrated_lufs`, `true_peak_dbtp`, `mastered_audio_path`, `status`).
  2. Crear la vista `apps/studio/src/app/(dashboard)/history/page.tsx`:
     - Listado de proyectos con buscador y filtros por fecha/género.
     - Vista de detalle de pista con timeline de versiones ($v1, v2, v3$).
  3. Implementar flujo de **Remasterización**:
     - Desde una pista existente, el usuario puede seleccionar un nuevo preset o ajustar la plataforma objetivo (`platform_target`) y generar una versión posterior ($v2$) usando el audio original ya guardado.
     - Comparador A/B entre versiones ($v1$ vs $v2$).
- **Criterio de Aceptación**: El usuario puede entrar a su historial, escuchar versiones antiguas y lanzar una nueva versión sin tener que volver a subir el archivo.

---

### 🐍 FASE 6: Integración del Worker DSP en Python (AudioMind)
**Objetivo**: Desacoplar el motor DSP en Python para que consuma trabajos desde la base de datos/API en lugar de depender de sesiones volátiles en memoria.

- **Tareas**:
  1. Configurar cliente Supabase en Python (`supabase-py`) con la clave de servicio (`service_role`) en `apps/audiomind`.
  2. Implementar endpoint stateless `/api/jobs/master`:
     - Recibe `{ track_id, version_id, input_audio_url, preset_id, platform_target }`.
     - Descarga el audio desde el Storage.
     - Ejecuta la cadena DSP de 13 etapas de AudioMind (respetando modo transparente y presets).
     - Sube el masterizado al bucket `audio-masters`.
     - Actualiza la fila en `master_versions` con `status: 'completed'` y las métricas medidas.
- **Criterio de Aceptación**: El procesamiento se ejecuta de punta a punta: Frontend solicita $\rightarrow$ Python procesa $\rightarrow$ Supabase guarda $\rightarrow$ Frontend actualiza vía suscripción en tiempo real.

---

### ✅ FASE 7: Verificación Integral, Pruebas y Cierre
**Objetivo**: Garantizar estabilidad, fidelidad sonora y rendimiento óptimo.

- **Checklist de Verificación**:
  - [ ] `bun run lint` / `npm run lint` en `apps/studio` con 0 errores.
  - [ ] `bun run build` / `npm run build` genera el bundle de producción sin fallos.
  - [ ] Pruebas unitarias de Python en `apps/audiomind` (`pytest tests/ -q`) pasando al 100%.
  - [ ] Prueba sonora del modo transparente (bit-exact passthrough).
  - [ ] Prueba de cambio de idioma en toda la interfaz sin desajustes visuales.
  - [ ] Prueba de desconexión / reconexión de sesión.
