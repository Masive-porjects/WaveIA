# Plugin Knowledge Template

> **Uso**: Copiar a `knowledge/plugins/<plugin-id>.md` y completar.
> **Obligatorio**: Todos los campos marcados con `*`.

---

## propósito *
Una frase — qué hace este plugin en la cadena de mastering.
> Ej: "Compresor estilo FET con ataque ultra-rápido para control de transientes agresivos (kick, snare, 808)"

---

## parámetros *
Tabla completa — cada parámetro expuesto al motor DSP.

| Parámetro | Tipo | Rango | Default | Unidad | Descripción |
|-----------|------|-------|---------|--------|-------------|
| `ratio` | float | `[1.0, 20.0]` | `4.0` | :1 | Ratio de compresión |
| `threshold_db` | float | `[-40, 0]` | `-12.0` | dB | Umbral de entrada |
| `attack_ms` | float | `[0.01, 100]` | `0.5` | ms | Tiempo de ataque |
| `release_ms` | float | `[10, 2000]` | `100` | ms | Tiempo de release (0 = auto) |
| `knee_db` | float | `[0, 24]` | `6.0` | dB | Knee suave/duro |
| `makeup_db` | float | `[-12, 12]` | `0.0` | dB | Gain compensación |
| `mix` | float | `[0, 1]` | `1.0` | — | Dry/wet (parallel compression) |
| `sidechain_hpf_hz` | float | `[20, 500]` | `120` | Hz | High-pass en sidechain (evita pumping por low-end) |

---

## impacto sonoro *
Descripción cualitativa + medible.

**Cualitativo**:
> "FET: ataque <1ms clampa transientes instantáneamente. Agresivo, punchy, 'grabby'. Ideal para kick/snare/808 donde quieres definir el ataque. No transparente — colorea (bueno para carácter). Release program-dependent evita pumping en material complejo."

**Medible (typical: ratio=4:1, thresh=-12dB, attack=0.5ms, release=auto)**:
| Métrica | Delta típico |
|---------|--------------|
| Crest factor | -3 a -6 dB |
| Dynamic range (EBU) | -2 a -4 dB |
| Transient preservation (attack slope) | +20-40% steepness |
| Perceived punch (subjective) | High |
| THD | +0.1-0.3% (armónicos impares) |
| LUFS (con makeup=0) | -2 a -4 LU |

---

## ventajas *
> - Ataque más rápido que VCA/Opto/Vari-Mu → control transientes nítido
> - Release program-dependent → musical en material variable
> - Carácter "grabby" deseado en música urbana/electrónica
> - Sidechain HPF evita que sub-bass dispare compresor (pumping)

---

## desventajas *
> - No transparente — colorea (malo para classical/jazz/acoustic)
> - Attack ultra-rápido + ratio alto → distorsión en low-freq (intermodulación)
> - Release auto puede ser impredecible en material muy dinámico
> - CPU: ~2x VCA simple (envelope follower complejo)
> - Makeup gain manual necesario si no se usa auto-makeup

---

## ejemplos de uso *
Settings típicos por caso de uso real.

| Caso | ratio | thresh_db | attack_ms | release_ms | knee_db | makeup_db | mix | sidechain_hpf | Notas |
|------|-------|-----------|-----------|------------|---------|-----------|-----|---------------|-------|
| 808 punch | 4:1 | -10 | 0.3 | auto | 3 | +3 | 1.0 | 150 | Define ataque 808 |
| Kick click | 6:1 | -8 | 0.1 | 50 | 2 | +4 | 1.0 | 100 | Transiente quirúrgico |
| Drum bus glue | 2:1 | -6 | 10 | auto | 8 | +2 | 0.7 | 120 | Paralelo, cohesión |
| Vocal control | 3:1 | -15 | 3 | auto | 6 | +3 | 1.0 | 200 | Suave, musical |
| Bass leveler | 2.5:1 | -12 | 5 | auto | 10 | +2 | 0.8 | 80 | Control sustain |
| Master bus (subtle) | 1.5:1 | -3 | 30 | auto | 12 | +1 | 0.3 | 200 | Glue transparente |

---

## interacción con otros plugins *

### Antes de (plugins que se benefician de ir ANTES de este)
| Plugin | Por qué |
|--------|---------|
| `eq` (correctivo) | Limpiar mud/resonancias ANTES → compresor no reacciona a basura |
| `highpass` | Sub-sónico (<30Hz) consume headroom → threshold engañoso |
| `deesser` | Eses comprimidos suenan peor → de-ess primero |
| `saturation` (ligera) | Saturación pre-comp → compresor suaviza armónicos añadidos |

### Después de (plugins que se benefician de ir DESPUÉS de este)
| Plugin | Por qué |
|--------|---------|
| `eq` (tonal) | Moldear tono post-compresión = más predecible |
| `limiter` | Compresor controla macro-dinámica → limiter solo picos |
| `stereo_widener` | Mid comprimido, side intacto → widening más limpio |
| `match_eq` | Referencia tonal post-dinámica = target realista |

### Conflictos (combinaciones a evitar o usar con extrema precaución)
| Combo | Problema | Mitigación |
|-------|----------|------------|
| `FET(attack<1ms, ratio>6)` + `saturation(transistor, drive>6)` | Intermodulación low-end → distorsión fea | Separar en chain, bajar ratio o drive |
| `FET` + `limiter(ceiling>-0.5, lookahead=0)` | Compresor no suelta → limiter clampa sostenido | Subir ceiling a -1dBTP, añadir lookahead 1-2ms |
| `FET(mix<1.0)` + `FET(mix<1.0)` (dos paralelos) | Phase issues, comb filtering | Usar solo uno, o alinear phase |

### Sinergias (combos recomendados)
| Combo | Efecto | Use case |
|-------|--------|----------|
| `FET(4:1, fast)` + `tube_sat(drive=2)` | Punch + warmth | 808, kick, bass |
| `FET(2:1, parallel mix=0.5)` + `opto_comp(2:1, slow)` | Transient control + sustain glue | Drum bus, mix bus |
| `FET(sidechain_hpf=150)` + `match_eq(trap_curve)` | Low-end control + tonal target | Trap mastering chain |

---

## implementación notes
- **Pedalboard**: `pedalboard.Compressor(ratio=..., threshold_db=..., attack_ms=..., release_ms=..., knee_db=...)`
  - Note: Pedalboard no expone `sidechain_hpf` ni `mix` nativamente → implementar sidechain HPF vía `pedalboard.HighpassFilter` en sidechain path custom, o paralelismo manual
- **Librosa fallback**: `librosa.effects.compressor` — limitado (no FET, no sidechain HPF) → documentar gap
- **Modelo FET**: Emular 1176-style: attack 0.02-0.8ms, release 50-1100ms program-dependent, ratio 4:1/8:1/12:1/20:1
- **Envelope follower**: RMS vs Peak detection — FET usa peak para transientes, RMS para sustain

---

## referencias
- `EXP-002` (limiter algorithms comparison — incluye FET compressor stage)
- `knowledge/mastering/pipeline.md` (stage 4: character compression)
- `knowledge/presets/fuego.md` (usa FET compressor)
- Universal Audio 1176 manual (reference behavior)
- "The Audio Expert" Ethan Winer — compressor types chapter