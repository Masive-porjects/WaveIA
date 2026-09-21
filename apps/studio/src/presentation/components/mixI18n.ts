/**
 * Diccionario ES/EN local del módulo de mezcla (v5).
 *
 * La app no tiene i18n (todo el microcopy está hardcodeado en español
 * neutro latino); este diccionario cubre SOLO los chips flotantes y su
 * toggle. Honestidad técnica: las 7 etapas DSP existen SIEMPRE en la
 * cadena real de ``build_mix`` (apps/audiomind/processing/mix_engine.py:
 * split → EQ mágico → paneo → dimensión delay/reverb → compresión →
 * énfasis por género → bus); lo único simulado es el timing de cuándo se
 * muestra cada chip (mismo ticker de la barra: cap 95 %, 100 % solo con
 * la respuesta real del backend).
 */

export type MixLang = "es" | "en";
export type MixChipTone = "stage" | "stem";

/** Un chip flotante ya traducido (etiqueta final, lista para renderizar). */
export interface MixChip {
  id: string;
  label: string;
  tone: MixChipTone;
}

export interface I18nLabel {
  es: string;
  en: string;
}

/** Clave de localStorage del idioma del módulo (consistente con waveai-theme). */
export const MIX_LANG_STORAGE_KEY = "waveai-mix-lang";

/** Cadena REAL de ``mix_engine.build_mix`` — SIEMPRE presente (7 etapas).
 *  ids en el orden en que la cadena corre en el backend. */
export const MIX_CHAIN_STAGES: { id: string; label: I18nLabel }[] = [
  { id: "split", label: { es: "Separando stems", en: "Splitting stems" } },
  { id: "eq", label: { es: "Aplicando EQ mágico", en: "Applying magic EQ" } },
  { id: "pan", label: { es: "Paneo estéreo", en: "Stereo panning" } },
  {
    id: "dimension",
    label: {
      es: "Reverb + Delay (dimensión)",
      en: "Reverb + Delay (dimension)",
    },
  },
  {
    id: "dynamics",
    label: { es: "Comprimiendo dinámica", en: "Compressing dynamics" },
  },
  {
    id: "emphasis",
    label: { es: "Énfasis por género", en: "Genre emphasis" },
  },
  { id: "bus", label: { es: "Mezclando el bus", en: "Mixing the bus" } },
];

/** Los 4 stems reales de demucs (``splitter.STEM_NAMES``), en orden. */
export const STEM_ROLE_IDS = ["drums", "bass", "other", "vocals"] as const;
export type StemRoleId = (typeof STEM_ROLE_IDS)[number];

/** Nombres honestos por stem: demucs NO detecta guitarra (vive en "other"),
 *  así que nunca se muestra "Guitarra". Solo se muestran los stems que el
 *  backend marcó como presentes (``stem_presence``). */
export const STEM_CHIP_LABELS: Record<StemRoleId, I18nLabel> = {
  drums: { es: "Batería", en: "Drums" },
  bass: { es: "Bajo", en: "Bass" },
  other: { es: "Otros", en: "Other" },
  vocals: { es: "Voces", en: "Vocals" },
};

/** Lee el idioma guardado (default "es"; guard en try/catch por si el
 *  localStorage está bloqueado, p.ej. modo privado estricto). */
export function readMixLang(): MixLang {
  if (typeof window === "undefined") return "es";
  try {
    return window.localStorage.getItem(MIX_LANG_STORAGE_KEY) === "en"
      ? "en"
      : "es";
  } catch {
    return "es";
  }
}