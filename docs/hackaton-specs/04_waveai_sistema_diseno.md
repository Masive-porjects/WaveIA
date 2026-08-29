# 04 — Idea 2 · WaveAI: Sistema de Diseño del Studio (Parte II de la spec)

> Fuente: `MASTERING_ECOSYSTEM_SPEC.md` — Parte II (design spec). Frontend: Next.js.

## 1. Visión de diseño

El studio se lee como un **panel de instrumento hardware oscuro**: superficies casi negras en capas, un único acento teal desaturado (`#627e84`), paneles de vidrio, knobs físicos, y una capa de mascotas contenida (fantasmas + notas musicales) que mantiene la herramienta viva sin sobrecarga decorativa. Referencias citadas en los docs del proyecto: tonalidad Ableton/BandLab.

Tipografía: **Inter** (UI) + **Instrument Serif italic** para acentos de una sola palabra ("Masterizá Tu *Música*", "Macro-*Carácter*") — el acento serif estilo Mindloop.

**Light theme** soportado vía overrides `html[data-theme="light"]`; script inline `beforeInteractive` en `layout.tsx` restaura el tema persistido (`localStorage` `waveai-theme`) antes de la hidratación (sin flash).

## 2. Sistema visual (`globals.css`)

Tres generaciones de tokens coexisten (nombres legacy son load-bearing; los tokens HSL canónicos son aditivos por contrato de comentarios).

### 2.1 Color (defaults dark)

| Rol | Token | Valor |
|---|---|---|
| Fondo app | `--bg-app` | `#0b0b0c` |
| Fondo sidebar | `--bg-sidebar` | `#09090a` |
| Fondos legacy | `--bg-primary/secondary/tertiary/elevated` | `#0a0a0c` / `#121216` / `#1a1a20` / `#22222a` |
| Texto | `--text-primary/secondary/muted` | `#e8e8e8` / `#8a8a8a` / `#555555` |
| Acento | `--accent-primary/secondary` | `#627e84` / `#829ca1` |
| Status | `--accent-success/warning/error` | `#34c759` / `#ff9500` / `#dc2626` |
| Meters | `--meter-safe/warn/clip` | `#34c759` / `#ff9500` / `#ff3b30` |
| Waveforms | `--waveform-original/mastered` | `#484855` / `#00d4aa` |
| Vidrio | `--bg-glass` / `--bg-glass-elevated` | `rgba(18,18,22,0.6)` / `rgba(26,26,32,0.55)` |
| Surfaces | `--surface-hover/active` | blanco @ 4% / 8% |
| Bordes | `--border-subtle/strong` | blanco @ 5% / 12% |
| Sombras | `--shadow-card/heavy/knob-inset` | `0 8px 32px rgba(0,0,0,.3)` / `0 25px 60px rgba(0,0,0,.5)` / inset knob |
| Watermark | `--brand-bg-opacity` | 0.14 dark / 0.10 light |
| Knockout text | `--text-knockout` | blanco→gris→blanco (135°) |

**Colores de identidad de presets** (wave/progress pairs): universal `#ff3b30/#ff6b35`, fuego `#ff6b00/#ff3b30`, claridad `#ffd700/#ffaa00`, cinta `#ff8c00/#ff6b00`, natural `#34c759/#30d158`, espacial `#af52de/#8944b8`, cinematico `#ff375f/#bf5af2`, empuje `#ff453a/#ff3b30`. Notas ambientales: `[#ff5a5f, #ffb347, #4ecdc4, #7b68ee, #ff6b9d]`.

### 2.2 Tipografía y textura

- Inter 300–700 para todo lo funcional; Instrument Serif italic 400 para `.serif-accent`; letter-spacing negativo en headings (−0.02 a −0.04 em).
- El fondo del body lleva dos elipses radiales teal tenues (alpha 0.04/0.03) para profundidad.
- **Receta de vidrio:** fondo token translúcido + `backdrop-blur` (md en cards, 2xl + `saturate-150` en modales) + borde sutil + rim-light superior de 1 px (blanco/30) + sheen superior de 64 px blanco/[0.07] en paneles elevados.

### 2.3 Lenguaje visual del knob

`Knob3D`: cara mecanizada radial-gradient desde tokens `--knob-gradient-*`, inset shadow, elipse de highlight, dimple central, y LED brillante que rota ±135° (sweep 270°) con transición transform 0.08 s ease-out. Interacción: arrastre vertical, 200 px de recorrido = rango completo, escalonado al incremento del knob.

## 3. Mascota y capa ambiental

Tres componentes, todos deterministas/seeded para ser hydration-safe (sin `Math.random` durante render):

| Componente | Población | Tamaños / movimiento |
|---|---|---|
| `FloatingGhosts.tsx` | 8 fantasmas | 26–56 px, opacity 0.18–0.46, loops de deriva 9–17 s |
| `FloatingNotes.tsx` | 16 notas (paleta 5 colores) | 14–34 px, loops 8–16 s |
| `BigGhostWithNotes.tsx` | Un fantasma hero (80 px) + hasta 7 notas orbitando (radio 96) | Bob y −12 px + rotate 3°, 4.2 s `sine.inOut`; soporta composición "recostado" |

Colocación: campos ambientales detrás de toda la app (z 1–2); el fantasma grande detrás de la card de upload. El canvas de mastering añade el watermark `/brand/WaveAI.png` a `var(--brand-bg-opacity)`. La pantalla de licencia compone las mismas piezas en su ilustración de estado bloqueado.

## 4. Sistema de movimiento

Librerías: **GSAP** (+ `@gsap/react` `useGSAP`) para entradas coreografiadas; **Framer Motion** para transiciones de presencia/layout. Helpers en `lib/motion.ts`: `fadeUp(delay)` (opacity 0→1, y 20→0, 0.6 s easeOut, viewport once, margin −100 px) y `VIEW_TRANSITION` (y 40, 0.5 s).

| Patrón | Dónde | Spec |
|---|---|---|
| Paint sweep | `PaintedModule.tsx` | Overlay wipe `clipPath: inset(0 100% 0 0) → inset(0 0 0 0)`, 0.7 s `power2.inOut` opacity 0.55; contenido sube de y 26 / scale 0.985 en 0.55 s; remount vía `key={currentTab}` |
| Curtain modal | `ModuleSheet.tsx` | Panel se descubre `inset(0 0 100% 0) → 0`, 0.55 s `power3.inOut`; header (y 12, 0.4 s, overlap −0.25); contenido (y 16, 0.45 s, −0.2); exit Framer fade scale 0.96 / y 10 en 0.2 s; backdrop black/60 blur 0.25 s |
| Card stagger | `ModulePanel.tsx` | Cards desde y 30 / opacity 0, stagger 0.04 s, 0.45 s `power2.out`; entrada individual scale 0.92 / y 24 / 0.5 s |
| Card hover/press | `ModulePanel.tsx` | Hover scale 1.03 + borde/glow de color (`color-mix` 35%) 0.35 s; press 0.97 en 0.1 s |
| Waveform wake-up | `Player.tsx` | Barras crecen `scaleY 0.35 → 1`, 0.8 s `power2.out`, capa mastered delay 0.12 s; transform-only (React posee opacity para A/B) |
| Wave decorativo | `WaveformBars` | 32 barras ondulan independientes (random 0.9–1.8 s yoyo); `timeScale` 0.7 idle → 1.6 en playback |
| Upload card float | page.tsx | y ±6 px, 2.6 s `sine.inOut` yoyo |
| Count-up métricas | `AnalysisPanel.tsx` | GSAP tween 1.1 s `power2.out` escribiendo `textContent` directo |
| Unlock fade | `LicenseGuard.tsx` | Gate fade out (opacity 0, y −12, 0.6 s `power2.inOut`) al activar |
| Processing overlay | `ProcessingOverlay.tsx` | Anillo SVG (radio 72, stroke 6); subtextos por umbral: <30% "Analizando espectro y aplicando Gain Staging...", <70% "Aplicando algoritmos DSP de Waveman Paul Morales...", <99% "Modelando True Peak y Noise Shaping...", else "Cargado"; check al 100% (+300 ms); exit scale 1.04 en 0.5 s |

**Contrato de accesibilidad:** todo efecto coreografiado protege `prefers-reduced-motion` (revealWave, PaintedModule, ModuleSheet, CountUp); componentes ambientales `aria-hidden`/pointer-events-none.

## 5. Evolución de la navegación

Modelo actual (post-eliminación del parallax — `useParallax` ya no existe):

```
Left rail (w-16 / lg:72px)       Canvas                        Right panel (w-80 / lg:96)
├─ Home (upload view)            ├─ Columna de iconos módulos   ├─ AnalysisPanel
├─ Library (placeholder)         │  └─ trigger "Módulos" →      ├─ Download WAV / MP3
├─ Estudio (mastering view)      │     dropdown (w-56):         └─ Compact DropZone (re-upload)
│   └─ abre Macro-Carácter       │        Macro-Carácter
├─ Guides (Guía de Géneros)      │        Splitter · Vocal · Beats
└─ ThemeToggle (bottom)          │        Guía de Géneros · Cadena de Master
                                 ├─ Player (top, sticky)
                                 ├─ Vocal result bar (cuando hay)
                                 └─ Contenido del módulo pintado (scroll)
```

Reglas de interacción:
- El único trigger "Módulos" (icono grid) abre el dropdown; cierra con pointerdown fuera o Escape; dot activo cuando hay módulo pintado.
- Click en item **pinta** el módulo en el canvas (`setCurrentTab` + cierra sheet/menú). El pintado remounta contenido vía `PaintedModule key={currentTab}` (entrada paint-sweep).
- Las tabs también pueden abrirse en el `ModuleSheet` de vidrio centrado (`openModuleTab`); al cerrar el sheet se revela la columna aún montada → el estado del módulo sobrevive.
- El panel derecho colapsa a ancho cero (300 ms ease) con botón expand flotante; la columna central mantiene `min-w-0`.
- Historia: tab bar completo → columna de iconos → parallax removido → trigger dropdown único. **No reintroducir tabs horizontales.**

## 6. Componentes core

| Componente | Spec |
|---|---|
| `DropZone` | Drag-and-drop + click; acepta solo `.wav`/`.mp3` (rechazo client-side espejo del 400 backend); variante compacta para re-upload; entrance fadeUp |
| `ModulePanel` | 8 cards macro-carácter (icono, título, descripción, chip de género) en grid responsive 2/4 col; card activa adopta su color de preset (borde, glow dot, chip tintado). "Ajuste Fino" colapsable con 9 knobs: Reverb (wet 0–1, .05), Brillo (±6 dB, .5), Ratio (1–10:1, .5), Ceiling (−3…0 dB, .1), Punch (0–6 dB, .5), Drive (0–10 dB, .5), Warmth (±6 dB, .5), Width (0.5–2.0×, .1), Haas (0–40 ms, 1). Seleccionar card → `onPresetSelect(params, id)` → **auto-procesa** (con `preset_id` para el lookup prebuilt) |
| `PlatformSelector` | Chips de target loudness: Automático (engine deriva del ceiling), Spotify/YouTube/Tidal/Deezer/SoundCloud −14, Apple Music −16. Chip activo tintado; valores con minus tipográfico (−) |
| `ProcessingOverlay` | Modal global: anillo de progreso con progreso real (poll 500 ms), subtextos por fase, check, salida vigilada |
| `LicenseGuard` | Envuelve toda la app. Estados: `loading` → `locked` (fantasma recostado en el key form de vidrio + notas orbitando) → `unlocked` (fade GSAP). `checkLicense()` en mount contra `/license/status`; entornos dev sin licencia pasan gratis. Key en `sessionStorage` + header `X-License-Key` |
| Legacy sin referencia | `hooks/useAudioProcessor.ts`, `components/MasteringControls.tsx`, `PresetSelector.tsx` — no importados en el árbol activo; candidatos a borrado |

## 7. Responsive y pulido

- Layout: shell `h-screen overflow-hidden`; tres columnas flex con scroll independiente. Breakpoints: sidebar 64→72 px, columna de iconos 48→56 px, panel derecho 320→384 px en `lg`; grid macro 2→4 columnas en `md`.
- Mobile: hamburguesa toggle icono Menu/X rotado; acciones search/user se ocultan progresivamente (`hidden sm:flex`).
- Hydration safety: `useIsClient` vía `useSyncExternalStore`; capas ambientales seeded; tema restaurado pre-hydration.
- Superficie de error: banner tintado rojo (`rgba(220,38,38,…)`) sobre el contenido de módulos; mensajes de timeout con acciones de recuperación explícitas ("Procesar con estos parámetros" retry).
- Empty states: cada tab de módulo renderiza "Subí un audio…" sin sesión.
- **Micro-copy: UI en español rioplatense (voseo)** — "Subí", "Ajustá", "Probá de nuevo"; identificadores y comentarios en inglés.
