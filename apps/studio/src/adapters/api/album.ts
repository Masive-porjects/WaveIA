/* ── Album Mastering (Phase D) ───────────────────────────── */

import { API_BASE } from "./config";
import { licenseHeaders } from "./client";

export interface AlbumTrackInput {
  session_id: string;
  track_number: number;
}

export interface AlbumNegotiateRequest {
  session_ids: string[];
  target_lufs_db?: number;
}

export interface AlbumTrackTarget {
  session_id: string;
  track_number: number;
  input_lufs: number | null;
  input_true_peak_db: number | null;
  input_lra: number | null;
  target_lufs: number;
  gain_offset_db: number;
}

export interface AlbumNegotiateResponse {
  album_base_lufs: number;
  track_targets: AlbumTrackTarget[];
}

export interface AlbumProcessRequest {
  session_ids: string[];
  platform_target?: "spotify" | "apple_music" | "youtube" | "tidal" | "custom";
  target_lufs_db?: number;
  preserve_relative_dynamics?: boolean;
  max_gain_adjustment_db?: number;
  processing_mode?: "master" | "transparent";
  output_sr?: "same_as_input" | "44100" | "48000" | "96000";
  output_bit_depth?: 16 | 24 | 32;
  strict_mode?: boolean;
}

export interface AlbumTrackResult {
  session_id: string;
  track_number: number;
  input_lufs: number | null;
  output_lufs: number | null;
  gain_offset_db: number;
  output_true_peak_db: number | null;
  warnings: string[];
  mastered_path: string | null;
  error: string | null;
}

export interface AlbumProcessResponse {
  album_id: string;
  album_base_lufs: number;
  album_true_peak_ceiling: number;
  tracks: AlbumTrackResult[];
  album_integrated_lufs: number | null;
  album_lra: number | null;
  consistency_check: "PASS" | "FAIL";
}

export interface AlbumReport {
  album_id: string;
  platform_target: string;
  album_lufs_target: number;
  album_true_peak_ceiling: number;
  tracks: AlbumTrackResult[];
  album_integrated_lufs: number | null;
  album_lra: number | null;
  consistency_check: "PASS" | "FAIL";
  created_at: string;
}

export async function negotiateAlbum(
  request: AlbumNegotiateRequest
): Promise<AlbumNegotiateResponse> {
  const res = await fetch(`${API_BASE}/album/negotiate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...licenseHeaders() },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Album negotiate failed" }));
    throw new Error(err.detail || "Album negotiate failed");
  }
  return res.json();
}

export async function processAlbum(
  request: AlbumProcessRequest
): Promise<AlbumProcessResponse> {
  const res = await fetch(`${API_BASE}/album/process`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...licenseHeaders() },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Album process failed" }));
    throw new Error(err.detail || "Album process failed");
  }
  return res.json();
}

export async function downloadAlbumZip(albumId: string): Promise<Blob> {
  const res = await fetch(`${API_BASE}/album/${albumId}/download`, {
    headers: { ...licenseHeaders() },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Album download failed" }));
    throw new Error(err.detail || "Album download failed");
  }
  return res.blob();
}

export async function getAlbumReport(albumId: string): Promise<AlbumReport> {
  const res = await fetch(`${API_BASE}/album/${albumId}/report`, {
    headers: { ...licenseHeaders() },
  });
  if (!res.ok) throw new Error("Failed to fetch album report");
  return res.json();
}