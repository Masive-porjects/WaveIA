/* ── Preset Colors for Dynamic WaveSurfer ─────────────── */

export const PRESET_COLORS: Record<
  string,
  { wave: string; progress: string }
> = {
  universal: { wave: "#ff3b30", progress: "#ff5147" },    // Pulido · Multigénero (rojo)
  fuego: { wave: "#ff6b00", progress: "#ff3b30" },        // Trap / Drill
  claridad: { wave: "#ffd700", progress: "#ffaa00" },     // Pop / Latin Pop
  cinta: { wave: "#ff8c00", progress: "#ff6b00" },        // Lo-Fi / Hip Hop
  natural: { wave: "#34c759", progress: "#30d158" },      // Acústico / Folk
  espacial: { wave: "#af52de", progress: "#8944b8" },     // Ambient / Electronic
  cinematico: { wave: "#ff375f", progress: "#bf5af2" },   // Rock / Alternativo
  empuje: { wave: "#ff453a", progress: "#ff3b30" },       // Reggaeton / Dembow
};

/** Default color (falls back when no preset is active). */
export const DEFAULT_PRESET_COLOR = { wave: "#ff3b30", progress: "#ff5147" };

/* ── Preset info map (target DSP values) ──────────────────
   Numbers mirror backend PRESET_CHAINS (audiomind.processing.presets)
   — the backend is what actually runs, so it is the source of truth.
   All targets are streaming-safe: LUFS in [-14, -12] and true-peak
   ceiling ≤ -1.0 dBTP (Spotify/YouTube/Tidal -14/-1, Apple -16/-1), so a
   master never gets attenuated by loudness normalization while carrying
   over-compression or inter-sample clipping. */

export interface PresetInfo {
  title: string;
  genre: string;
  targetLufs: number;
  ceiling: number;
  ratio: number;
  color: string;
}

export const PRESET_INFO: Record<string, PresetInfo> = {
  universal: { title: "Pulido", genre: "Multigénero", targetLufs: -14, ceiling: -1.0, ratio: 1.5, color: "#ff3b30" },
  fuego: { title: "Brutal", genre: "Trap / Drill", targetLufs: -12, ceiling: -1.0, ratio: 4.0, color: "#ff6b00" },
  claridad: { title: "Cristalino", genre: "Pop / Latin Pop", targetLufs: -13, ceiling: -1.5, ratio: 1.8, color: "#ffd700" },
  cinta: { title: "Vintage", genre: "Lo-Fi / Hip Hop", targetLufs: -12, ceiling: -1.0, ratio: 2.5, color: "#ff8c00" },
  natural: { title: "Crudo", genre: "Acústico / Folk", targetLufs: -14, ceiling: -2.0, ratio: 1.1, color: "#34c759" },
  espacial: { title: "Envolvente", genre: "Ambient / Electronic", targetLufs: -13, ceiling: -1.0, ratio: 1.6, color: "#af52de" },
  cinematico: { title: "Épico", genre: "Rock / Alternativo", targetLufs: -12, ceiling: -1.0, ratio: 5.0, color: "#ff375f" },
  empuje: { title: "Muro", genre: "Reggaeton / Dembow", targetLufs: -12, ceiling: -1.0, ratio: 6.0, color: "#ff453a" },
};
