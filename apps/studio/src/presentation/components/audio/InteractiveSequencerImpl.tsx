"use client";

import { type CSSProperties } from "react";
import StepGrid from "./StepGrid";
import {
  DEFAULT_BASS_NOTES,
  SEQUENCER_STEPS,
  SEQUENCER_TRACK_NAMES,
  useSequencerEngine,
  type SequencerGrid,
} from "./useSequencerEngine";

function createPresetGrid(): SequencerGrid {
  const grid: SequencerGrid = Array.from(
    { length: SEQUENCER_TRACK_NAMES.length },
    () => Array.from({ length: SEQUENCER_STEPS }, () => false),
  );
  // Four-on-the-floor kick.
  [0, 4, 8, 12].forEach((step) => {
    grid[0][step] = true;
  });
  // Backbeat snare.
  [4, 12].forEach((step) => {
    grid[1][step] = true;
  });
  // Offbeat hats.
  [2, 6, 10, 14].forEach((step) => {
    grid[2][step] = true;
  });
  DEFAULT_BASS_NOTES.forEach((note, step) => {
    if (note !== null) {
      grid[3][step] = true;
    }
  });
  return grid;
}

export default function InteractiveSequencerImpl() {
  const { playing, bpm, grid, canvasRef, toggleStep, toggleTransport, updateBpm } =
    useSequencerEngine({
      initialGrid: createPresetGrid,
      initialBpm: 120,
      initialBassNotes: DEFAULT_BASS_NOTES,
    });

  return (
    <section
      className="w-full max-w-3xl rounded-xl p-5"
      style={{
        background: "var(--bg-glass)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        border: "1px solid var(--border-subtle)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <header className="mb-4 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
          Secuenciador
        </h3>
        <button
          type="button"
          onClick={() => {
            void toggleTransport();
          }}
          className="rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-[#f4f4f2] transition-[filter] hover:brightness-110"
          style={{ background: "var(--accent-primary)" }}
        >
          {playing ? "Detener" : "Reproducir"}
        </button>
      </header>

      <canvas
        ref={canvasRef}
        className="mb-4 h-14 w-full rounded-md"
        style={{
          background: "var(--bg-tertiary)",
          border: "1px solid var(--border)",
        }}
        aria-hidden="true"
      />

      <StepGrid grid={grid} trackNames={SEQUENCER_TRACK_NAMES} onToggleCell={toggleStep} />

      <div className="mt-5 flex items-center gap-3">
        <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
          BPM
        </span>
        <input
          type="range"
          min={70}
          max={180}
          step={1}
          value={bpm}
          onChange={(event) => updateBpm(Number(event.currentTarget.value))}
          className="knob-fill flex-1"
          style={{ "--fill": `${((bpm - 70) / 110) * 100}%` } as CSSProperties}
          aria-label="Tempo en pulsos por minuto"
        />
        <span className="w-8 text-right text-sm tabular-nums text-[var(--text-primary)]">
          {bpm}
        </span>
      </div>
    </section>
  );
}
