# Best Practices — WaveAI Studio (Next.js 16 + Web Audio + Python DSP + Supabase)

Guía oficial de buenas prácticas, patrones de diseño y estándares de ingeniería para **WaveAI**.

---

## 🏗️ 1. Arquitectura y Estructura por Features

### Principio de Responsabilidad Única y Dominio
Organiza el código del cliente en `apps/studio/src/features/` agrupando por dominio funcional, no por tipo de archivo técnico.

```text
src/
├── features/
│   ├── auth/                     # Autenticación y perfil con Supabase
│   │   ├── components/           # LoginForm, RegisterForm, UserMenu
│   │   ├── hooks/                # useAuth, useProfile
│   │   ├── services/             # authService.ts
│   │   └── types/                # auth.types.ts
│   │
│   ├── audio-upload/             # Carga y validación de archivos de audio
│   │   ├── components/           # DropZone, FormatValidator, UploadProgress
│   │   ├── hooks/                # useAudioUpload
│   │   └── services/             # uploadService.ts (Storage & Presigned URLs)
│   │
│   ├── mastering/                # Flujo y parámetros del DSP de mastering
│   │   ├── components/           # PresetSelector, DeliveryPanel, ReportCard, KnobRack
│   │   ├── hooks/                # useMasteringSettings, useProcessingStatus
│   │   └── services/             # masteringApi.ts
│   │
│   ├── player/                   # Motor Web Audio y reproductor A/B
│   │   ├── components/           # PlayerBar, WaveformVisualizer, ABToggle, VolumeMeter
│   │   ├── hooks/                # useAudioPlayer, useTransportSync
│   │   └── services/             # webAudioEngine.ts
│   │
│   ├── remastering-history/      # Historial de versiones y proyectos
│   │   ├── components/           # VersionTimeline, VersionCard, CompareSheet
│   │   ├── hooks/                # useTrackHistory, useRemaster
│   │   └── services/             # historyService.ts
│   │
│   ├── live-engine/              # Motor Live en tiempo real + Bridge MIDI
│   ├── stem-splitter/            # Separador de stems
│   ├── vocal-chain/              # Procesamiento de pista vocal
│   └── songstarter/              # Generador y secuenciador
│
├── shared/                       # Código común y primitivas sin lógica de dominio
│   ├── components/               # Knobs, Faders, Modales, Botones, Sheets, Tabs
│   ├── hooks/                    # useDebounce, useMediaQuery, useLocalStorage
│   ├── utils/                    # formateadores de tiempo, decibeles, frecuencias
│   └── config/                   # features.config.ts (Feature Flags)
│
├── i18n/                         # Internacionalización modular
│   ├── locales/
│   │   ├── es.json               # Español neutro
│   │   └── en.json               # Inglés técnico
│   ├── I18nProvider.tsx          # Provider de contexto de traducción
│   └── useTranslation.ts         # Hook tipado
│
└── app/                          # Composition Root (Rutas de Next.js App Router)
    ├── (auth)/                   # Rutas de login / registro
    ├── (studio)/                 # Ruta principal del estudio (ensamblado modular)
    └── historial/                # Vista de historial y proyectos
```

### Composición Limpia de `page.tsx`
- El archivo `page.tsx` nunca debe contener llamadas directas `fetch`, `useState` dispersos o lógica de renderizado masiva.
- Actúa como un **Composition Root**: monta los providers de las features activas y renderiza el layout visual componiendo los contenedores principales.

---

## 🎛️ 2. Sistema Modular y Feature Flags (Encender / Apagar Módulos)

Para permitir que herramientas experimentales o secundarias (Stem Splitter, Vocal Chain, Beats, Live Engine) se enciendan o apaguen sin tocar la lógica central:

1. **Configuración Centralizada (`src/shared/config/features.config.ts`)**:
   ```ts
   export interface FeatureToggle {
     id: string;
     enabled: boolean;
     labelKey: string;
     icon: string;
     requiresAuth: boolean;
   }

   export const FEATURE_FLAGS: Record<string, FeatureToggle> = {
     mastering: { id: "mastering", enabled: true, labelKey: "nav.mastering", icon: "Sliders", requiresAuth: false },
     history: { id: "history", enabled: true, labelKey: "nav.history", icon: "Clock", requiresAuth: true },
     splitter: { id: "splitter", enabled: true, labelKey: "nav.splitter", icon: "Scissors", requiresAuth: false },
     vocalChain: { id: "vocalChain", enabled: false, labelKey: "nav.vocal", icon: "Mic", requiresAuth: true },
     liveEngine: { id: "liveEngine", enabled: true, labelKey: "nav.live", icon: "Activity", requiresAuth: false },
   };
   ```
2. **Consumo Dinámico en Navegación y Vistas**:
   - El `ModuleDock` o barra de herramientas lee `FEATURE_FLAGS` y renderiza exclusivamente las pestañas activas.
   - Si una feature se apaga en configuración, se excluye del bundle y de la vista sin generar errores de referencia.

---

## 🔊 3. Buenas Prácticas de Audio y Web Audio API

1. **Gestión del `AudioContext`**:
   - Inicializar el `AudioContext` o reanudarlo (`ctx.resume()`) únicamente tras una interacción del usuario (click/tap) para cumplir con las políticas de autoplay de los navegadores.
   - Desconectar nodos y liberar buffers al desmontar componentes de reproducción para evitar fugas de memoria en sesiones largas.
2. **Suavizado de Ganancia y Filtros (Anti-zipper)**:
   - Prohibido asignar valores directos a parámetros de audio en tiempo real:
     ```ts
     // ❌ INCORRECTO (genera clics y artefactos audibles)
     gainNode.gain.value = newVolume;

     // ✅ CORRECTO (rampa exponencial/lineal suave)
     gainNode.gain.setTargetAtTime(newVolume, ctx.currentTime, 0.015);
     ```
3. **Reproductor A/B Preciso**:
   - Mantener ambos audios (Original y Masterizado) sincronizados en la misma línea de tiempo (`currentTime`).
   - El toggle A/B debe conmutar las ganancias de salida (`mute`/`unmute` con micro-fade de 5ms) en lugar de pausar y reproducir streams separados.

---

## ⚡ 4. Manejo de Audio Pesado y Supabase Storage

1. **Cero Saturación de Servidor Web**:
   - Los archivos WAV de 30MB a 100MB **nunca** deben enviarse al servidor Node/Next.js como payload `multipart/form-data`.
   - Flujo obligatorio:
     1. El cliente solicita una URL de subida prefirmada a Supabase Storage (`supabase.storage.from('audio-originals').createSignedUploadUrl(...)`).
     2. El navegador sube el binario directamente al bucket vía HTTP PUT / TUS.
     3. Solo se envía a la base de datos la metadata (duración, sample rate, URL del archivo).
2. **Seguridad y Aislamiento por Usuario (RLS)**:
   - Aplicar políticas RLS estrictas en Supabase:
     ```sql
     -- Solo el dueño de la pista puede leer o descargar su archivo original
     CREATE POLICY "Users can only access their own audio"
     ON storage.objects FOR ALL
     USING (bucket_id = 'audio-originals' AND auth.uid()::text = (storage.foldername(name))[1]);
     ```

---

## 🌍 5. Internacionalización (i18n)

1. **Separación de Diccionarios**:
   - Mantener traducciones organizadas por dominios (`common`, `nav`, `mastering`, `player`, `auth`, `history`) en `src/i18n/locales/es.json` y `en.json`.
2. **Consistencia de Tipos y Prevención de Hydration Mismatches**:
   - Usar claves tipadas para que TypeScript advierta si falta una traducción en algún idioma.
   - Leer el idioma preferido en cliente desde `localStorage` o cookies sincronizadas para evitar parpadeos visuales al renderizar en el servidor.

---

## 🧪 6. Calidad, Testing y Resiliencia

1. **Modo Transparente / Verificación Bit-Exacta**:
   - Cada cambio en el flujo de datos debe validar que el procesamiento neutral devuelve audio idéntico (passthrough de integridad sonora).
2. **Manejo Gradual de Fallos**:
   - Si el backend de Python o el job de mastering falla, la UI debe mostrar mensajes claros en el idioma del usuario con la razón exacta (ej. audio saturado, clipping por encima de -0.3 dBTP, formato no soportado) y permitir reintentar sin reiniciar la sesión.
