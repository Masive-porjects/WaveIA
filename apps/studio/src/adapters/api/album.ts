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

export interface AlbumNegotiationTrack {
  session_id: string;
  track_number: number;
  input_lufs_db: number | null;
  input_true_peak_dbtp: number | null;
  input_lra_lu: number | null;
  negotiated_target_lufs_db: number | null;
  offset_db: number | null;
}

export interface AlbumNegotiateResponse {
  target_base_lufs_db: number;
  lra_median_lu: number | null;
  tracks: AlbumNegotiationTrack[];
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

export interface AlbumProcessTrack {
  session_id: string;
  original_filename: string | null;
  negotiated_target_lufs_db: number | null;
  output_lufs_db: number | null;
  output_lra_lu: number | null;
  output_crest_db: number | null;
  output_true_peak_dbtp: number | null;
  lufs_deviation_db: number | null;
  within_tolerance: boolean;
  warnings: string[];
}

export interface AlbumProcessResponse {
  target_base_lufs_db: number;
  lra_median_lu: number | null;
  tracks: AlbumProcessTrack[];
}

export interface AlbumReport {
  album_id: string;
  platform_target: string;
  album_lufs_target: number;
  album_true_peak_ceiling: number;
  tracks: AlbumProcessTrack[];
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