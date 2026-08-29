"use client";

import { useEffect, useRef } from "react";
import * as Tone from "tone";
import { audioEngine } from "@/lib/audio/engine";

/* ── Module-level analyser tap ──────────────────────────
   Exactly ONE Waveform analyser per JS context, connected to
   the engine singleton's master bus the first time any motor
   tile mounts. Remounts/HMR reuse it — never a duplicate tap
   and never disposed (the bus outlives the tile). */
let masterTap: Tone.Waveform | null = null;

function getMasterTap(): Tone.Waveform {
  if (!masterTap) {
    masterTap = new Tone.Waveform(512);
    audioEngine.masterBus().connect(masterTap);
  }
  return masterTap;
}

const BAR_COUNT = 22;
const CANVAS_W = 64;
const CANVAS_H = 26;

/* ── MotorTileImpl ──────────────────────────────────────
   rAF-driven canvas: mini bar waveform sampled from the shared
   master-bus analyser while the Transport runs; flat baseline
   when idle. Pure pixel writes — zero React state. */
export default function MotorTileImpl() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(CANVAS_W * dpr);
    canvas.height = Math.round(CANVAS_H * dpr);
    ctx.scale(dpr, dpr);

    const accent =
      getComputedStyle(canvas).getPropertyValue("--accent-secondary").trim() ||
      "#829ca1";
    const idleColor = "rgba(130, 156, 161, 0.35)";

    let raf = 0;

    const draw = (): void => {
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.fillStyle = idleColor;

      const running = audioEngine.getTransport().state === "started";
      if (!running) {
        // Engine idle — flat line.
        ctx.fillRect(0, CANVAS_H / 2 - 0.5, CANVAS_W, 1);
      } else {
        let samples: Float32Array | null = null;
        try {
          const value = getMasterTap().getValue();
          if (value instanceof Float32Array) samples = value;
        } catch {
          samples = null; // Context not ready yet — fall through to stubs
        }

        ctx.fillStyle = accent;
        const gap = 2;
        const barWidth = (CANVAS_W - gap * (BAR_COUNT - 1)) / BAR_COUNT;
        for (let i = 0; i < BAR_COUNT; i++) {
          const sample = samples
            ? Math.abs(samples[Math.floor((i / BAR_COUNT) * samples.length)])
            : 0;
          const barHeight = Math.max(2, sample * CANVAS_H * 0.92);
          ctx.fillRect(
            i * (barWidth + gap),
            (CANVAS_H - barHeight) / 2,
            barWidth,
            barHeight,
          );
        }
      }
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="block h-[26px] w-[64px]"
    />
  );
}
