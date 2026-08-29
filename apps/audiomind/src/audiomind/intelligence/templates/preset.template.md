# Preset Knowledge Template

> **Uso**: Copiar este archivo a `knowledge/presets/<preset-id>.md` y completar todos los campos.
> **Obligatorio**: Todos los campos marcados con `*`. No eliminar secciones.

---

## nombre *
**ID canónico**: `universal` | `fuego` | `claridad` | `cinta` | `natural` | `espacial` | `cinematico` | `empuje`

---

## objetivo *
Una frase — qué logra este preset.
> Ej: "Añade punch y peso en graves para trap/hip-hop sin destruir dinámica"

---

## descripción *
Párrafo explicativo para usuario final (mostrado en UI).
> Ej: "Brutal está diseñado para música urbana electrónica donde el kick y el 808 necesitan corte y presencia. Aplica saturación armónica en low-mids, compresión FET rápida y limiting true-peak conservador."

---

## problema que resuelve *
Qué falla en el mix original que este preset arregla.
> Ej: "Kick y 808 se pierden al normalizar a -14 LUFS streaming; sub-bass inaudible en móvil"

---

## cuándo usar *
Condiciones de entrada (género, BPM, crest factor, balance tonal, loudness).
> Ej: "Trap, Hip Hop, Drill, Reggaeton — BPM 130-150 — crest factor entrada >12dB — sub-bass energy alta — LUFS entrada > -18"

---

## cuándo NO usar *
Contraindicaciones explícitas.
> Ej: "Jazz, Classical, Acoustic, Ambient — destruye micro-dinámica y espacio. No usar en material ya masterizado a -9 LUFS (over-limiting)"

---

## plugins utilizados *
Lista ordenada con parámetros clave (referencia `knowledge/plugins/*.md`).
```
1. saturation (tube, drive=3dB, mix=0.5, tone=2000Hz)
2. compressor (FET, ratio=4:1, attack=0.5ms, release=auto, threshold=-12dB)
3. eq (low-shelf +2dB @ 60Hz, high-shelf +1.5dB @ 10kHz)
4. limiter (true_peak=-1dBTP, oversample=4x, lookahead=2ms)
```

---

## cadena DSP *
Diagrama textual o pseudo-código de la señal.
```
input
  → analyze(crest_factor, lufs, genre)          # Safety check
  → ceiling_adjust(crest_factor)                # Dynamic ceiling
  → saturation(tube, drive=3dB)                 # Harmonic excitement
  → compressor(FET, 4:1, fast_attack)           # Transient control
  → eq(low_shelf +2@60, high_shelf +1.5@10k)    # Tonal shape
  → match_eq(trap_target_curve)                 # Genre reference
  → limiter(true_peak=-1dBTP, 4x_oversample)    # Ceiling
  → dither(Lipshitz_2nd_order)                  # 16-bit export
output
```

---

## ventajas *
Qué hace bien este preset.
> - Añade peso y presencia a 808 sin distorsión audible
> - Mantiene punch en kick vía compressor FET fast attack
> - True peak limiting evita clipping en streaming
> - Match EQ alinea balance tonal a referencia comercial

---

## limitaciones *
Qué no hace / riesgos / casos donde falla.
> - En tracks con poco low-end, low-shelf puede sonar artificial
> - Saturación tube + compresor FET puede comprimir en exceso si threshold muy bajo
> - No compensa problemas de fase en mix original
> - Match EQ genérica — no artista-específica

---

## métricas esperadas *
Targets medibles post-procesamiento.
| Métrica | Target | Tolerancia |
|---------|--------|------------|
| LUFS Integrated | -14.0 | ±0.5 dB |
| True Peak | -1.0 dBTP | ≤ -1.0 dBTP |
| Dynamic Range (EBU) | 6-8 dB | ≥ 6 dB |
| Crest Factor (out) | 8-10 dB | — |
| Spectral Centroid shift | +5-10% | — |

---

## géneros ideales *
Lista con badges (mayúsculas, tal como aparecen en UI).
> `["TRAP", "HIP HOP", "DRILL", "REGGAETON"]`

---

## futuras mejoras *
Ideas para v2/v3 (referencia `ideas/IDEA-XXX.md` si existe).
> - Adaptive saturation basada en fundamental frequency del 808 detectada
> - Multi-band saturation (solo low-mids, no highs)
> - Artist-specific match EQ curves (IDEA-004)
> - Real-time sub-bass monoing < 100Hz opcional

---

## referencias *
Enlaces a experimentos, papers, presets comerciales análogos, ADRs.
> - `EXP-003` (ceiling strategy validation)
> - `EXP-001` (saturation type comparison)
> - LandR "Loud" preset analysis (internal doc)
> - `DEC-001` (limiter ceiling decision)
> - `knowledge/mastering/target_curves/trap_target_curve.md`

---

## versionado
| Versión | Fecha | Autor | Cambios |
|---------|-------|-------|---------|
| 1.0.0 | 2026-07-29 | Chief Audio Engineer | Creación inicial |