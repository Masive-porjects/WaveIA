"use client";

import {
  SEQUENCER_TRACK_NAMES,
  type SequencerGrid,
} from "./useSequencerEngine";

interface StepGridProps {
  grid: SequencerGrid;
  trackNames?: readonly string[];
  onToggleCell: (track: number, step: number) => void;
  /** Per-track accent color for ON cells; falls back to the app accent. */
  trackColors?: readonly (string | undefined)[];
  /**
   * Opt-in live column highlight (0..15). Deliberately NOT wired to the
   * audio playhead by callers — that one lives on the canvas so React
   * never re-renders at frame rate.
   */
  activeStep?: number;
  disabled?: boolean;
}

export default function StepGrid({
  grid,
  trackNames = SEQUENCER_TRACK_NAMES,
  onToggleCell,
  trackColors,
  activeStep = -1,
  disabled = false,
}: StepGridProps) {
  return (
    <div className="space-y-1.5">
      {trackNames.map((name, track) => (
        <div key={name} className="flex items-center gap-3">
          <span className="w-12 shrink-0 text-right text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
            {name}
          </span>
          <div
            className="flex flex-1 gap-1"
            role="group"
            aria-label={`Pistas ${name}`}
          >
            {grid[track].map((on, step) => {
              const cellColor = trackColors?.[track];
              const isColumnActive = activeStep >= 0 && activeStep === step;
              return (
                <button
                  key={step}
                  type="button"
                  aria-label={`${name} paso ${step + 1}`}
                  aria-pressed={on}
                  disabled={disabled}
                  onClick={() => onToggleCell(track, step)}
                  className={`h-7 flex-1 rounded transition-colors ${
                    step % 4 === 0 && step > 0 ? "ml-1.5" : ""
                  }`}
                  style={{
                    backgroundColor: on
                      ? (cellColor ?? "var(--accent-primary)")
                      : "var(--surface-hover)",
                    border: `1px solid ${
                      on
                        ? (cellColor ?? "var(--accent-secondary)")
                        : "var(--border-subtle)"
                    }`,
                    boxShadow: isColumnActive
                      ? `0 0 10px ${cellColor ?? "var(--accent-secondary)"}`
                      : undefined,
                  }}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
