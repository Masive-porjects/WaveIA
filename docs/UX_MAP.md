# Mapa de UX — Brikmaster Studio

> Estado del árbol: **septiembre 2026**. Documenta el flujo real de la UI, no la spec 04 (que quedó desactualizada en navegación).

## 1. Vista general de rutas

| Ruta | Pantalla | Guarda |
|---|---|---|
| `/` | Studio de mastering (upload → mastering) | `AuthGuard` (off por default) + `LicenseGuard` |
| `/login` | Login | `AuthGuard` (solo si `NEXT_PUBLIC_REQUIRE_AUTH=1`) |
| `/voz` | Flujo de intención por voz (2 pasos: subir → conversar) | — |
| `/lab` | Laboratorio de audio aislado (`InteractiveSequencer`) | — |

```mermaid
flowchart LR
    subgraph App["App Shell (/, login, /voz, /lab)"]
        AG[AuthGuard<br/>off por default] --> LG[LicenseGuard<br/>loading → locked | unlocked]
    end
    LG --> ROOT
```

## 2. Flujo principal (`/`)

```mermaid
stateDiagram-v2
    [*] --> Boot: mount
    Boot --> UploadView: license OK
    UploadView --> Processing: DropZone (WAV/MP3)
    Processing --> UploadView: error (413/415/404/5xx)
    Processing --> MasteringView: análisis OK (>90s timeout)
    MasteringView --> MasteringView: preset / procesar
    MasteringView --> UploadView: "Inicio" / volver
```

**Estados del upload:**

```mermaid
flowchart LR
    A[DropZone<br/>drag & drop / click] --> B{Validación cliente}
    B -- wav/mp3 <50MB --> C[ProcessingOverlay<br/>upload]
    B --> D[ErrorModal<br/>413/415]
    C --> E[Analysis background<br/>poll hasta 90s]
    E --> F{is_already_mastered?}
    F -- sí --> G[OverMasterWarning<br/>confirmar / cancelar]
    F -- no --> H[MasteringView<br/>auto-preset by genre]
```

## 3. MasteringView — navegación por dock

El **ModuleDock** flotante (abajo-centro) es EL navegador de módulos. 10 módulos en dos grupos separados por tiles de telemetría.

```mermaid
flowchart TB
    subgraph Dock["ModuleDock (fisheye, glass)"]
        G1["Macro-Carácter · Splitter · Vocal · Beats"]
        T["Progress · LUFS · Motor"]
        G2["Guía de Géneros · Cadena de Master · Análisis · Estéreo · Live Engine · Álbum"]
    end
    Dock -->|click item| Paint["PaintedModule<br/>paint-sweep en lienzo"]
    Dock -->|open sheet| Sheet["ModuleSheet<br/>vidrio centrado"]
    Paint -->|cerrar / tab activo| Dock
```

**Dos modos de masterización (toggle Manual / Asistente IA):**

```mermaid
flowchart LR
    subgraph Manual["Modo Manual"]
        MP[ModulePanel<br/>8 presets + ajuste fino 9 knobs]
        PB[Procesar con estos parámetros]
    end
    subgraph AI["Modo Asistente IA"]
        CP[ChatPanel<br/>voz + texto + sugerencias]
        PC[PresetCards<br/>recomendaciones]
    end
    Manual --> Player
    AI --> Player
```

**Layout:**

```mermaid
flowchart LR
    subgraph Desktop["Desktop (3 columnas)"]
        Nav[Navbar<br/>brand · toggle modo · tema · user · home]
        Cen[Lienzo central<br/>Player + PaintedModule + scroll]
        RP[Right Panel colapsable<br/>Análisis · descargas · estéreo · live]
        Dock2[Dock flotante]
    end
    subgraph Mobile["Mobile (1 columna)"]
        Nav2[Navbar + hamburguesa]
        MPlayer[Player arriba]
        MS[Flujo one-tap<br/>presets strip + procesar + descargas]
        MD[MobileDrawer izq]
    end
```

## 4. Estados del Player (A/B)

```mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> Loading: original/master load
    Loading --> Ready: wavesurfer load ok
    Ready --> Playing: play
    Playing --> Ready: pause
    Ready --> Masked: master_idle
    Ready --> Reference: render referencia (Crudo on-demand)
```

- Fuentes: **Original / Referencia / Master** (`SourceKind`).
- A/B por capas de wave: transform-only, React controla opacity.
- Note burst por cada master que aterriza.

## 5. Live Engine (tab `live`)

```mermaid
flowchart LR
    Master[Master audio<br/>getAudioUrl(mastered)] --> Decode[decodeAudioData<br/>AudioContext efímero]
    Decode --> LV[LiveView<br/>2 columnas: FX + meters]
    LV --> FX[FxSlotPanel<br/>filtro · drive · delay · reverb]
    LV --> Meters[LiveMeters]
    LV --> Rec[LiveRecorderBar]
```

- Requiere **master previo** (empty state si no hay).
- Control standalone: los **knobs** (mouse/teclado, `Knob3D`) escriben `LiveParams` directo en el grafo Web Audio del navegador. No hay cámara, gestos ni WebSocket.
- Patrón React oficial de descarte de buffer: ajuste durante render (`decodedUrl !== masterAudioUrl`).

## 6. Chat del Asistente IA

```mermaid
sequenceDiagram
    participant U as Usuario
    participant C as ChatPanel
    participant A as API /voz/chat
    U->>C: mensaje texto / mic
    C->>A: {messages, profile, analysis, voiceMode}
    A-->>C: {reply, profile, changes[], recommendations[]}
    C-->>U: texto + "ajusté N parámetros"
    C-->>U: habla (speak)
    C-->>U: PresetCards
```

- 9 ejes del `IntentProfile` (warmth, punch, clarity, brightness, width, bass_weight, vocal_focus, vintage, loudness) — **no se muestran** en UI, el usuario elige presets.
- Saludo hablado una sola vez (guard `welcomeSpokenRef`).
- Mic corta la voz del agente (para no grabarse a sí mismo).

## 7. Rutas auxiliares

- **`/voz`**: flujo de intención en 2 pasos (subir track → conversar). `speak()` en el drop, el navegador suele permitirlo por gesto del usuario; si bloquea, falla en silencio.
- **`/lab`**: `InteractiveSequencer` aislado del flujo de mastering.
- **`/login`**: `LoginScreen` — auth apagado por default (`NEXT_PUBLIC_REQUIRE_AUTH !== "1"`), flag de localStorage sin verificación de servidor.

## 8. Puertas (guards)

1. **`AuthGuard`**: off por default. Envuelve la raíz. Si `REQUIRE_AUTH=1`: redirige a `/login` si no hay flag `waveai-auth`.
2. **`LicenseGuard`**: `loading → locked | unlocked`. `checkLicense()` en mount contra `/license/status`. Dev sin key → unlocked gratis. Key en `sessionStorage` + header `X-License-Key`. States gestionados con GSAP fade (locked → unlocked).

## 9. Descubrimientos transversales

- `@/components/*` **resuelve** a `src/presentation/components/*` (tsconfig) → no hay capa legacy de component-dup real.
- Duplicación pendiente: `lib/` vs `shared/` vs `adapters/` vs `core/` vs `hooks/` vs `application/` (ver deuda técnica en reporte de estado).
- Overlays flotantes: **FloatingDeliveryPanel** (FAB derecha), **FloatingReportCard** (píldora izquierda), dock abajo. Filosofía: "nada crece, todo es overlay".
- Convex desconectado: provider passthrough (layout).
- Accesibilidad: `prefers-reduced-motion` respetado en fisheye (desactiva), revealWave, módulos; `aria-hidden` en capas ambientales.