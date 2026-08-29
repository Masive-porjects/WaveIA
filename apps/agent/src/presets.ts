/**
 * Los 8 presets de mastering sobre los que el agente puede recomendar.
 *
 * Los ids son los del backend (`audiomind.processing.presets.PRESET_CHAINS`),
 * que es lo que realmente corre. El frontend los espeja en `core/presets.ts`
 * con sus colores. Si el backend agrega o quita uno, este archivo cambia.
 */

export const PRESET_IDS = [
  "universal",
  "fuego",
  "claridad",
  "cinta",
  "natural",
  "espacial",
  "cinematico",
  "empuje",
] as const;

export type PresetId = (typeof PRESET_IDS)[number];

export interface PresetInfo {
  title: string;
  genre: string;
  targetLufs: number;
  /** Para que sirve, en el lenguaje del usuario. Alimenta el prompt. */
  suits: string;
  /** true si el preset se apoya en que haya voz. */
  vocalOriented: boolean;
}

export const PRESETS: Record<PresetId, PresetInfo> = {
  universal: {
    title: "Pulido",
    genre: "Multigénero",
    targetLufs: -14,
    suits: "opción segura y transparente cuando no hay una intención marcada",
    vocalOriented: false,
  },
  fuego: {
    title: "Brutal",
    genre: "Trap / Drill",
    targetLufs: -9,
    suits: "808 y bombo al frente, agresivo, muy fuerte",
    vocalOriented: false,
  },
  claridad: {
    title: "Cristalino",
    genre: "Pop / Latin Pop",
    targetLufs: -12,
    suits: "voz definida y al frente, mezcla legible, brillo controlado",
    vocalOriented: true,
  },
  cinta: {
    title: "Vintage",
    genre: "Lo-Fi / Hip Hop",
    targetLufs: -12,
    suits: "calidez de cinta, agudos suaves, carácter analógico",
    vocalOriented: false,
  },
  natural: {
    title: "Crudo",
    genre: "Acústico / Folk",
    targetLufs: -14,
    suits: "conserva la dinámica, casi sin compresión, honesto",
    vocalOriented: true,
  },
  espacial: {
    title: "Envolvente",
    genre: "Ambient / Electronic",
    targetLufs: -12,
    suits: "estéreo ancho, profundidad, atmósfera",
    vocalOriented: false,
  },
  cinematico: {
    title: "Épico",
    genre: "Rock / Alternativo",
    targetLufs: -8,
    suits: "grande y dramático, mucho impacto, rango amplio",
    vocalOriented: false,
  },
  empuje: {
    title: "Muro",
    genre: "Reggaeton / Dembow",
    targetLufs: -8,
    suits: "muro de sonido, graves densos, pensado para el club",
    vocalOriented: false,
  },
};

/** Tipo de track. El analisis del backend no lo detecta: lo infiere el agente. */
export const TRACK_TYPES = ["vocal", "instrumental", "unknown"] as const;
export type TrackType = (typeof TRACK_TYPES)[number];

/** Bloque para el prompt. Se genera de la tabla asi no se desincroniza. */
export function presetCatalogForPrompt(): string {
  return PRESET_IDS.map((id) => {
    const p = PRESETS[id];
    const voz = p.vocalOriented ? " [se apoya en la voz]" : "";
    return `- ${id} — "${p.title}" (${p.genre}, ${p.targetLufs} LUFS): ${p.suits}${voz}`;
  }).join("\n");
}
