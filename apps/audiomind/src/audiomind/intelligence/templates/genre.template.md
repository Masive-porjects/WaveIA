# Genre Knowledge Template

> **Uso**: Copiar a `knowledge/genres/<genre-id>.md` y completar.
> **Obligatorio**: Todos los campos marcados con `*`.
> **Naming**: lowercase, kebab-case (ej: `hip-hop.md`, `edm-house.md`, `latin-reggaeton.md`)

---

## características *
Descripción cualitativa del sonido típico del género (instrumentación, arreglo, vibe).
> Ej: "Kick/808 fused, sub-bass 30-60Hz sustain, rolling hi-hats 1/32-1/64, snare/clap on beat 3, vocal ad-libs, half-time feel, tempo 140 BPM"

---

## rango_bpm *
| Min | Max | Typical |
|-----|-----|---------|
| 130 | 150 | 140 |

---

## energía *
Escala 1-10 + descripción.
> **9** — Alta densidad espectral, transientes nítidos, sustain largo en 808, energía constante

---

## balance_tonal *
Perfil espectral descriptivo + dB relativos vs referencia plana.
> "Sub-bass dominante 30-80Hz (+6 a +10dB vs mid), low-mids scooped 200-500Hz (-3 a -6dB), presence 3-5kHz (+2dB), air 10kHz+ (+1dB). Kick fundamental ~50Hz, 808 fundamental ~40-50Hz sustain."

---

## dinamica *
Métricas de dinámica típicas en mixes comerciales del género.
| Métrica | Rango típico | Comentario |
|---------|--------------|------------|
| Crest factor (entrada) | 12-18 dB | Muy dinámico pre-master |
| Crest factor (target out) | 8-10 dB | Post-mastering |
| Dynamic Range (EBU) | 5-7 dB | Muy comprimido comercial |
| LUFS integrated (comercial) | -8 a -6 LUFS | "Loud" normalizado |
| True Peak (comercial) | -0.5 a -0.1 dBTP | Cercano a 0 |

---

## loudness_promedio *
LUFS integrated y true peak típicos en releases comerciales (Spotify/Apple/YouTube normalized).
> **-7 LUFS integrated, -0.5 dBTP true peak** (Spotify loud normalization → suena a -7 LUFS real)

---

## recomendaciones_dsp *
Qué cadena DSP funciona y por qué. Referenciar `knowledge/plugins/*.md` y `knowledge/mastering/*.md`.
> 1. **Saturation tube/tape en low-end** (30-120Hz) → armónicos pares hacen 808 audible en móvil/auriculares baratos. `knowledge/plugins/saturation.md` → type=tube, drive=3dB, tone=1500Hz.
> 2. **Compresor FET fast attack** (0.3-0.5ms, 4:1) en kick/808 bus → define transiente, controla sustain. `knowledge/plugins/compressor.md` → ratio=4, attack=0.3ms, sidechain_hpf=150Hz.
> 3. **EQ low-shelf +2dB @ 50Hz** + **high-shelf +1.5dB @ 10kHz** → peso + aire. `knowledge/plugins/eq.md`.
> 4. **True peak limiter -1dBTP obligatorio** (oversample 4x) → sub-bass genera inter-sample peaks brutales. `knowledge/plugins/limiter.md`.
> 5. **Match EQ curva objetivo trap** → pink noise slope -3dB/oct + bass boost 30-80Hz + presence 3-5kHz. `knowledge/mastering/target_curves/trap_target_curve.md`.
> 6. **Dither Lipshitz 2nd order** para export 16-bit. `knowledge/plugins/dither.md`.

---

## presets_compatibles *
Mapeo a presets canónicos con confianza (0.0-1.0).

### Primario
| Preset | Confianza | Por qué |
|--------|-----------|---------|
| `fuego` | 0.93 | Diseñado para trap/hip-hop: saturación low-end, FET punch, low-shelf boost |

### Secundarios
| Preset | Confianza | Cuándo usar |
|--------|-----------|-------------|
| `empuje` | 0.70 | Si track necesita más loudness agresivo, menos carácter |
| `claridad` | 0.35 | Solo si vocal muy upfront y 808 poco prominente (raro en trap) |
| `universal` | 0.20 | Fallback seguro si genre confidence <0.6 |

### Incompatibles (no usar)
| Preset | Por qué |
|--------|---------|
| `natural` | Destruye punch 808, demasiado transparente |
| `cinta` | Saturación tape suaviza transientes — kick pierde click |
| `espacial` | Widener en low-end = phase issues en mono (club) |
| `cinematico` | Diseñado para score, no para beat-centric |

---

## target_curve_ref *
Referencia a curva objetivo para Match EQ.
> `knowledge/mastering/target_curves/trap_target_curve.md`

---

## reference_tracks *
Tracks de referencia calibrados (path relativo a `knowledge/mastering/reference_tracks/` o URL).
| Track | Artista | LUFS | TP | Genre | Notes |
|-------|---------|------|-----|-------|-------|
| `refs/trap_ref_01.wav` | Metro Boomin type | -7.2 | -0.3 | Trap | 808 sustain heavy |
| `refs/trap_ref_02.wav` | Travis Scott type | -6.8 | -0.1 | Trap | Vocal loud, kick clicky |

---

## detection_features *
Features clave para Genre Classifier ML (CNN en spectrograma / XGBoost en features).
| Feature | Rango esperado | Importancia |
|---------|----------------|-------------|
| spectral_centroid_mean | 2500-3500 Hz | High |
| spectral_rolloff_95 | 6000-8000 Hz | Medium |
| mfcc_1_mean (bass energy) | High (negative) | Very High |
| mfcc_2_mean (formant) | Mid | High |
| zero_crossing_rate | 0.08-0.15 | Medium (hi-hats density) |
| tempo_bpm | 130-150 | High |
| crest_factor | 12-18 dB | High |
| sub_bass_energy (30-80Hz) | Top 10% all genres | Very High |
| spectral_flatness | Low (tonal) | Medium |

---

## subgenres_variants *
Variantes que comparten perfil base pero difieren en detalles.
| Subgénero | Diferencia clave | Preset adjust |
|-----------|------------------|---------------|
| Drill (UK) | Slide 808, darker, 140-145 BPM | `fuego` + más low-shelf, menos high-shelf |
| Melodic Trap | Más melodía, vocal processed, 130-140 | `fuego` o `claridad` si vocal lead |
| Trap Latino | Dembow influence, 130-140, español | `fuego` + `empuje` blend |
| Cloud Rap | Ambient, lo-fi, slower 100-130 | `natural` o `cinta` |

---

## notas *
Contexto adicional, edge cases, evolución del género.
- Trap evoluciona rápido — revisar target curves cada 6 meses
- 808 tuning varía (C, C#, D, Eb) → saturation armónicos deben alinear
- Hi-hat density (1/32 vs 1/64) afecta spectral centroid → feature para sub-clasificación
- Vocal processing (auto-tune, formant shift) común → de-esser pre-master crítico

---

## versionado
| Versión | Fecha | Autor | Cambios |
|---------|-------|-------|---------|
| 1.0.0 | 2026-07-29 | Chief Audio Engineer | Creación inicial |