/**
 * lib/audioUtils.ts
 *
 * Funciones puras extraídas del Home() component.
 * Estas funciones son testeables en aislamiento y reutilizables.
 */

import type { SessionData, MasteringParameters } from "@/lib/api";
import { DEFAULT_PARAMS } from "@/lib/api";
import { useSyncExternalStore } from "react";

/* ── Genre to mastering params mapping ───────────────────── */

export function genreToParams(genre: string | null): MasteringParameters {
  const p: MasteringParameters = { ...DEFAULT_PARAMS };
  if (!genre) return p;

  switch (genre.toLowerCase()) {
    case "urban":
    case "hip_hop": // id emitido por _detect_genre (underscore)
    case "hip-hop":
    case "reggaeton":
      p.compression_ratio = 4.0;
      p.limiter_ceiling_db = -1.0;
      p.transient_boost_db = 2.0;
      p.haas_delay_ms = 5;
      p.stereo_width = 1.2;
      p.target_lufs_db = -12;
      break;
    case "rock":
    case "indie":
      p.compression_ratio = 2.5;
      p.transient_boost_db = 1.0;
      p.saturation_drive_db = 3.0;
      p.saturation_warmth_db = 2.0;
      p.stereo_width = 1.2;
      break;
    case "pop":
    case "electronic":
    case "electrónica":
      p.clarity_brightness_db = 2.0;
      p.compression_ratio = 3.0;
      p.stereo_width = 1.4;
      p.haas_delay_ms = 8;
      break;
    case "jazz":
    case "classical":
    case "clásica":
      p.compression_ratio = 1.5;
      p.limiter_ceiling_db = -2.0;
      p.clarity_wet = 0.25;
      break;
    case "latin":
    case "latino":
    case "fusion":
      p.compression_ratio = 3.0;
      p.transient_boost_db = 1.5;
      p.saturation_drive_db = 2.0;
      p.stereo_width = 1.1;
      break;
  }
  return p;
}

/* ── Check if preset's master is ready to be fetched ───────── */

/** Etiqueta de display para un género detectado. El backend emite ids con
 *  underscore (``hip_hop``); null / "other" se normalizan a "Otro". */
export function genreDisplayLabel(genre: string | null): string {
  if (!genre || genre === "other") return "Otro";
  if (genre === "hip_hop") return "Rap / Hip-Hop";
  return genre.replace("_", " ");
}

export function isPresetCompleted(
  session: SessionData,
  presetId: string | null | undefined,
): boolean {
  if (!presetId) {
    return Boolean(session.mastered_path);
  }
  return session.preset_masters?.[presetId]?.status === "completed";
}

/* ── Client detection helper ──────────────────────────── */

export function useIsClient(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

/* ── Progress utilities ───────────────────────────────── */

export function clampProgress(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function percentString(value: number): string {
  return `${clampProgress(value)}%`;
}

/* ── Progress percentage with rounding ─────────────────── */

export function progressPct(value: number): number {
  return Math.round(clampProgress(value));
}