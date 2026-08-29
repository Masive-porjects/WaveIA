"use client";

import { useMemo } from "react";
import type { MasteringParameters } from "@/lib/api";

/* ── Derived signal chain data from raw mastering params ────
   Maps MasteringParameters → 4 visual blocks with curve data.
   Pure computation, no side effects. */

export interface ChainBlock {
  id: string;
  label: string;
  subtitle: string;
  active: boolean;
  color: string;
  /** SVG path for the block's characteristic curve (0-1 coordinate space). */
  curvePath: string;
  /** Secondary curve path (e.g. gain reduction overlay). */
  overlayPath?: string;
  /** Peak level indicator 0–1 for the animated bar. */
  intensity: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

/**
 * Generates an SVG path for a high-shelf EQ boost.
 * x: 0–1 (frequency), y: 0–1 (amplitude).
 * The shelf starts at ~0.3 (low-mid) and rises to the boost amount.
 */
function eqCurvePath(brightnessDb: number, wet: number): string {
  const boost = (brightnessDb / 12) * wet; // normalise to 0–1 range
  const points: string[] = [];
  const steps = 24;

  for (let i = 0; i <= steps; i++) {
    const x = i / steps;
    // Flat below 0.3, gentle rise 0.3–0.6, shelf above 0.6
    let y: number;
    if (x < 0.25) {
      y = 0.5; // flat low end
    } else if (x < 0.55) {
      // smooth transition zone
      const t = (x - 0.25) / 0.3;
      y = 0.5 + boost * 0.3 * Math.sin((t * Math.PI) / 2);
    } else {
      // shelf region
      const t = (x - 0.55) / 0.45;
      y = 0.5 + boost * (0.3 + 0.7 * t);
    }
    points.push(`${(x * 100).toFixed(1)},${((1 - y) * 100).toFixed(1)}`);
  }

  return `M ${points.join(" L ")}`;
}

/**
 * Generates an SVG path for a compression transfer curve.
 * x: input level (0–1), y: output level (0–1).
 * ratio 1:1 = straight line, higher = more compression.
 */
function compressionCurvePath(ratio: number): string {
  const knee = 0.6; // compression starts at 60% input
  const points: string[] = [];
  const steps = 24;

  for (let i = 0; i <= steps; i++) {
    const x = i / steps;
    let y: number;
    if (x < knee) {
      y = x; // linear below knee
    } else {
      const over = x - knee;
      const compressed = over / ratio;
      y = knee + compressed;
    }
    // Clamp to 0–1
    y = Math.min(1, Math.max(0, y));
    points.push(`${(x * 100).toFixed(1)},${((1 - y) * 100).toFixed(1)}`);
  }

  return `M ${points.join(" L ")}`;
}

/**
 * Gain reduction overlay — shows how much the compressor reduces gain.
 * Drawn as a dashed line below the main curve.
 */
function gainReductionPath(ratio: number): string {
  const knee = 0.6;
  const points: string[] = [];
  const steps = 24;

  for (let i = 0; i <= steps; i++) {
    const x = i / steps;
    let gr: number;
    if (x < knee) {
      gr = 0; // no reduction below knee
    } else {
      const output = knee + (x - knee) / ratio;
      gr = x - output; // gain reduction = input - output
    }
    gr = Math.min(0.5, Math.max(0, gr));
    points.push(
      `${(x * 100).toFixed(1)},${((1 - (x - gr)) * 100).toFixed(1)}`,
    );
  }

  return `M ${points.join(" L ")}`;
}

/**
 * Generates an SVG path for a soft-clip / saturation curve.
 * Smoothly rounds off peaks above a threshold.
 */
function saturationCurvePath(driveDb: number, warmthDb: number): string {
  const drive = Math.max(0, driveDb / 12); // normalise 0–1
  const warmth = warmthDb / 6; // -6 to +6 → -1 to +1
  const points: string[] = [];
  const steps = 24;

  for (let i = 0; i <= steps; i++) {
    const x = i / steps;
    // Soft-clip: tanh-like curve
    const driveAmount = drive * 3; // exaggerate for visibility
    const raw = x + warmth * 0.1 * Math.sin(x * Math.PI);
    const saturated = Math.tanh(raw * (1 + driveAmount)) / Math.tanh(1 + driveAmount);
    const y = Math.max(0, Math.min(1, saturated));
    points.push(`${(x * 100).toFixed(1)},${((1 - y) * 100).toFixed(1)}`);
  }

  return `M ${points.join(" L ")}`;
}

/**
 * Generates an SVG path for a brick-wall limiter.
 * Flat line at the ceiling, hard clip above.
 */
function limiterCurvePath(ceilingDb: number): string {
  const ceiling = 1 + ceilingDb / 6; // -6 to 0 → 0 to 1 range, mapped to visual
  const points: string[] = [];
  const steps = 24;

  for (let i = 0; i <= steps; i++) {
    const x = i / steps;
    let y: number;
    if (x < ceiling) {
      y = x; // linear below ceiling
    } else {
      y = ceiling; // brick wall
    }
    points.push(`${(x * 100).toFixed(1)},${((1 - y) * 100).toFixed(1)}`);
  }

  return `M ${points.join(" L ")}`;
}

export function useSignalChain(params: MasteringParameters): ChainBlock[] {
  return useMemo(() => {
    const eqActive =
      Math.abs(params.clarity_brightness_db) > 0.1 ||
      params.clarity_wet > 0.05;
    const compActive = params.compression_ratio > 1.05;
    const satActive =
      Math.abs(params.saturation_drive_db) > 0.1 ||
      Math.abs(params.saturation_warmth_db) > 0.1;
    const limActive = params.limiter_ceiling_db > -6;

    return [
      {
        id: "eq",
        label: "Claridad",
        subtitle: `${params.clarity_wet > 0.05 ? `${(params.clarity_wet * 100).toFixed(0)}% wet` : "Bypass"}${params.clarity_brightness_db > 0.1 ? ` · +${params.clarity_brightness_db.toFixed(1)}dB` : ""}`,
        active: eqActive,
        color: "#4ecdc4",
        curvePath: eqCurvePath(params.clarity_brightness_db, params.clarity_wet),
        intensity: eqActive
          ? lerp(0.15, 0.8, params.clarity_wet)
          : 0.05,
      },
      {
        id: "comp",
        label: "Compresor",
        subtitle: `${params.compression_ratio.toFixed(1)}:1 ratio`,
        active: compActive,
        color: "#ffb347",
        curvePath: compressionCurvePath(params.compression_ratio),
        overlayPath: gainReductionPath(params.compression_ratio),
        intensity: compActive
          ? lerp(0.15, 0.9, (params.compression_ratio - 1) / 9)
          : 0.05,
      },
      {
        id: "sat",
        label: "Saturación",
        subtitle: `${params.saturation_drive_db > 0.1 ? `+${params.saturation_drive_db.toFixed(1)}dB drive` : "Clean"}${Math.abs(params.saturation_warmth_db) > 0.1 ? ` · ${params.saturation_warmth_db > 0 ? "+" : ""}${params.saturation_warmth_db.toFixed(1)} warmth` : ""}`,
        active: satActive,
        color: "#ff6b9d",
        curvePath: saturationCurvePath(
          params.saturation_drive_db,
          params.saturation_warmth_db,
        ),
        intensity: satActive
          ? lerp(0.15, 0.85, params.saturation_drive_db / 12)
          : 0.05,
      },
      {
        id: "lim",
        label: "Limiter",
        subtitle: `Ceiling ${params.limiter_ceiling_db.toFixed(1)}dB`,
        active: limActive,
        color: "#7b68ee",
        curvePath: limiterCurvePath(params.limiter_ceiling_db),
        intensity: limActive
          ? lerp(0.3, 0.95, 1 + params.limiter_ceiling_db / 6)
          : 0.05,
      },
    ];
  }, [params]);
}
