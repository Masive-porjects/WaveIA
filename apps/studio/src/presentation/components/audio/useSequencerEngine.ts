"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import * as Tone from "tone";
import {
  audioEngine,
  createSequencerResources,
  type SequencerResources,
} from "@/adapters/audio/engine";

/* ── Shared sequencer contract ─────────────────────── */

export const SEQUENCER_STEPS = 16;

export const SEQUENCER_TRACK_NAMES: readonly string[] = [
  "Kick",
  "Caja",
  "Hi-Hat",
  "Bajo",
];

export type SequencerGrid = boolean[][];

/** Per-step note for the Bajo track; `null` steps stay silent. */
export type BassNotes = readonly (string | null)[];

/**
 * Default bass line (A minor pentatonic) — the original /lab demo line.
 * Presets can override it per pattern via `applyPattern`.
 */
export const DEFAULT_BASS_NOTES: BassNotes = [
  "A1", null, null, "C2",
  null, null, "D2", null,
  "A1", null, null, "E2",
  null, null, "G2", null,
];

export interface SequencerPattern {
  bpm: number;
  grid: SequencerGrid;
  bassNotes?: BassNotes;
}

export interface SequencerEngine {
  playing: boolean;
  bpm: number;
  grid: SequencerGrid;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  toggleStep: (track: number, step: number) => void;
  toggleTransport: () => Promise<void>;
  updateBpm: (bpm: number) => void;
  /**
   * Loads a pattern through the ref mirrors first, so a RUNNING sequence
   * picks up grid + bass + BPM on its next tick without recreating anything.
   */
  applyPattern: (pattern: SequencerPattern) => void;
}

interface UseSequencerEngineOptions {
  /** Lazy initializer so each mount owns a fresh grid instance. */
  initialGrid: () => SequencerGrid;
  initialBpm?: number;
  initialBassNotes?: BassNotes;
}

/* ── Canvas playhead ───────────────────────────────── */

function drawPlayhead(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  activeStep: number,
  accent: string,
  glow: string,
): void {
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (
    canvas.width !== Math.round(width * dpr) ||
    canvas.height !== Math.round(height * dpr)
  ) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const cellWidth = width / SEQUENCER_STEPS;
  for (let step = 0; step < SEQUENCER_STEPS; step += 1) {
    const isBeat = step % 4 === 0;
    ctx.fillStyle =
      step === activeStep
        ? accent
        : isBeat
          ? "rgba(255, 255, 255, 0.10)"
          : "rgba(255, 255, 255, 0.04)";
    ctx.fillRect(step * cellWidth + 1, 4, cellWidth - 2, height - 8);

    if (isBeat) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.22)";
      ctx.fillRect(step * cellWidth + 1, height - 6, cellWidth - 2, 2);
    }
  }

  if (activeStep >= 0) {
    ctx.shadowColor = glow;
    ctx.shadowBlur = 12;
    ctx.fillStyle = glow;
    ctx.fillRect(activeStep * cellWidth + 1, 4, cellWidth - 2, height - 8);
    ctx.shadowBlur = 0;
  }
}

/* ── Engine hook ───────────────────────────────────── */

/**
 * Owns the full lifecycle of one drum-machine sequencer instance: synth kit,
 * Tone.Sequence, Transport BPM sync and the rAF canvas playhead.
 *
 * Ownership rules (inherited from M1): cleanup disposes ONLY the nodes built
 * here plus a Transport stop() — never the shared master bus, never the
 * engine singleton, never the AudioContext.
 */
export function useSequencerEngine(
  options: UseSequencerEngineOptions,
): SequencerEngine {
  const { initialGrid, initialBpm = 120, initialBassNotes = DEFAULT_BASS_NOTES } =
    options;

  const [playing, setPlaying] = useState(false);
  const [bpm, setBpm] = useState(initialBpm);
  const [grid, setGrid] = useState<SequencerGrid>(initialGrid);

  // Ref mirrors of the musical state: the running Tone.Sequence callback
  // reads these on the audio thread; toggles and pattern loads push updates
  // here without recreating anything.
  const gridRef = useRef<SequencerGrid>(grid);
  const bassNotesRef = useRef<BassNotes>(initialBassNotes);
  const resourcesRef = useRef<SequencerResources | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Build the whole audio graph once per mount.
  useEffect(() => {
    const bus = audioEngine.masterBus();

    const kick = new Tone.MembraneSynth({
      volume: -4,
      pitchDecay: 0.04,
      octaves: 6,
      envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 1.2 },
    }).connect(bus);

    const snare = new Tone.NoiseSynth({
      volume: -12,
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.18, sustain: 0 },
    }).connect(bus);

    const hatFilter = new Tone.Filter({
      frequency: 7500,
      type: "highpass",
    }).connect(bus);
    const hihat = new Tone.NoiseSynth({
      volume: -18,
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.045, sustain: 0 },
    }).connect(hatFilter);

    const bass = new Tone.MonoSynth({
      volume: -10,
      oscillator: { type: "sawtooth" },
      filterEnvelope: {
        attack: 0.005,
        decay: 0.15,
        sustain: 0.4,
        baseFrequency: 90,
        octaves: 2.5,
      },
      envelope: { attack: 0.01, decay: 0.25, sustain: 0.35, release: 0.2 },
    }).connect(bus);

    const sequence = new Tone.Sequence<number>(
      (time, step) => {
        const current = gridRef.current;
        if (current[0][step]) {
          kick.triggerAttackRelease("C1", "8n", time);
        }
        if (current[1][step]) {
          snare.triggerAttackRelease("16n", time);
        }
        if (current[2][step]) {
          hihat.triggerAttackRelease("64n", time, 0.6);
        }
        if (current[3][step]) {
          const note = bassNotesRef.current[step];
          if (note !== null) {
            bass.triggerAttackRelease(note, "16n", time);
          }
        }
      },
      Array.from({ length: SEQUENCER_STEPS }, (_, step) => step),
      "16n",
    );
    sequence.start(0);

    const resources = createSequencerResources(
      [kick, snare, hihat, hatFilter, bass],
      sequence,
    );
    resourcesRef.current = resources;

    return () => {
      resources.dispose();
      resourcesRef.current = null;
    };
  }, []);

  // Human-rate BPM state synced imperatively into the Transport — no state
  // flows back from the audio thread.
  useEffect(() => {
    audioEngine.getTransport().bpm.value = bpm;
  }, [bpm]);

  // Single rAF loop while playing: reads Transport position and writes pixels
  // directly. Zero setState inside the loop. When idle, paint once with no
  // highlighted step.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) {
      return;
    }

    const styles = getComputedStyle(canvas);
    const accent =
      styles.getPropertyValue("--accent-secondary").trim() || "#829ca1";
    const glow = styles.getPropertyValue("--accent-primary").trim() || "#627e84";

    if (!playing) {
      drawPlayhead(ctx, canvas, -1, accent, glow);
      return;
    }

    let raf = requestAnimationFrame(function frame() {
      const transport = audioEngine.getTransport();
      const secondsPerStep = 60 / transport.bpm.value / 4;
      const step =
        Math.floor(transport.seconds / secondsPerStep) % SEQUENCER_STEPS;
      drawPlayhead(ctx, canvas, step, accent, glow);
      raf = requestAnimationFrame(frame);
    });

    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const toggleStep = useCallback((track: number, step: number): void => {
    const next = gridRef.current.map((row, t) =>
      t === track ? row.map((on, s) => (s === step ? !on : on)) : row,
    );
    gridRef.current = next;
    setGrid(next);
  }, []);

  const updateBpm = useCallback((value: number): void => {
    setBpm(value);
  }, []);

  const toggleTransport = useCallback(async (): Promise<void> => {
    // Autoplay-policy gate first: must run inside a user-gesture handler.
    await audioEngine.ensureStarted();
    const transport = audioEngine.getTransport();
    if (playing) {
      transport.stop();
      setPlaying(false);
    } else {
      transport.start();
      setPlaying(true);
    }
  }, [playing]);

  const applyPattern = useCallback((pattern: SequencerPattern): void => {
    const next = pattern.grid.map((row) => [...row]);
    gridRef.current = next;
    bassNotesRef.current = pattern.bassNotes ?? DEFAULT_BASS_NOTES;
    setGrid(next);
    setBpm(pattern.bpm);
  }, []);

  return {
    playing,
    bpm,
    grid,
    canvasRef,
    toggleStep,
    toggleTransport,
    updateBpm,
    applyPattern,
  };
}
