import {
  SEQUENCER_STEPS,
  type BassNotes,
  type SequencerGrid,
} from "./useSequencerEngine";

/**
 * Genre loop presets for the SongStarter "Probá el groove" section.
 * Rows are 16-step strings ('X' = hit, '.' = rest) in fixed track order:
 * Kick / Caja / Hi-Hat / Bajo.
 */
type RowSpec = readonly [string, string, string, string];

export interface GenrePreset {
  id: string;
  label: string;
  bpm: number;
  rows: RowSpec;
  /** Note per step for the Bajo row; `null` stays silent. */
  bassNotes: BassNotes;
}

function parseRow(spec: string): boolean[] {
  if (spec.length !== SEQUENCER_STEPS) {
    throw new Error(
      `Preset row must have exactly ${SEQUENCER_STEPS} steps, got ${spec.length}: "${spec}"`,
    );
  }
  return Array.from(spec, (char) => char === "X");
}

/** Parses a preset's row specs into a fresh mutable grid instance. */
export function parsePresetGrid(preset: GenrePreset): SequencerGrid {
  return preset.rows.map(parseRow);
}

export const GENRE_PRESETS: readonly GenrePreset[] = [
  {
    id: "reggaeton",
    label: "Reggaetón",
    bpm: 94,
    // Dembow: four-on-the-floor kick + the 3+3+2 tresillo snare (steps 0, 6, 12).
    rows: [
      "X...X...X...X...",
      "X.....X.....X...",
      "X.X.X.X.X.X.X.X.",
      "X...X...X...X...",
    ],
    // Am — F — G bass movement under the tresillo.
    bassNotes: [
      "A1", null, null, null,
      "A1", null, null, null,
      "F1", null, null, null,
      "G1", null, null, null,
    ],
  },
  {
    id: "trap",
    label: "Trap",
    bpm: 140,
    // Half-time: sparse syncopated kick, single snare on step 8, rolling 16th hats.
    rows: [
      "X.....X...X.....",
      "........X.......",
      "XXXXXXXXXXXXXXXX",
      "X.....X...X.....",
    ],
    // 808-style chord tones (Am): A — E — C.
    bassNotes: [
      "A1", null, null, null,
      null, null, "E1", null,
      null, null, "C2", null,
      null, null, null, null,
    ],
  },
  {
    id: "drill",
    label: "Drill",
    bpm: 142,
    // UK drill: sliding-808 kick pockets, half-time snare + pickup on 15,
    // choppy two-and-rest hat bounce.
    rows: [
      "X.....X..X....X.",
      "........X......X",
      "XX.XX.XX.XX.XX.X",
      "X.....X..X....X.",
    ],
    bassNotes: [
      "A1", null, null, null,
      null, null, "G1", null,
      null, null, "A1", null,
      null, null, null, "C2",
    ],
  },
  {
    id: "house",
    label: "House",
    bpm: 124,
    // Four-on-the-floor + clap backbeat + offbeat open hats and bass pump.
    rows: [
      "X...X...X...X...",
      "....X.......X...",
      "..X...X...X...X.",
      "..X...X...X...X.",
    ],
    bassNotes: [
      null, null, "A1", null,
      null, null, "A1", null,
      null, null, "C2", null,
      null, null, "E2", null,
    ],
  },
  {
    id: "lofi",
    label: "Lo-Fi",
    bpm: 78,
    // Lazy boom-bap: off-kilter kick, straight backbeat, gapped swung-feel hats.
    rows: [
      "X......X..X.....",
      "....X.......X...",
      "X.X.X.X.X.X..X.X",
      "X......X..X.....",
    ],
    // Dm7 outline with a passing E over a D dorian vamp.
    bassNotes: [
      "D2", null, null, null,
      null, null, null, "F2",
      null, null, "E2", null,
      null, null, null, null,
    ],
  },
];
