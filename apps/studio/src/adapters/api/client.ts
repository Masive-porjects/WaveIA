import { API_BASE } from "./config";

/** Thrown when an API call fails. Carries the HTTP status code. */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Measured metrics of the final master (nulls: cache-hit path measures best-effort). */
export interface MasterResultMetrics {
  integrated_lufs: number | null;
  true_peak_db: number | null;
  crest_factor_db: number | null;
  limiter_ceiling_db: number | null;
  duration_seconds: number | null;
  sample_rate: number | null;
  output_bit_depth: number | null;
}

/** Single out-of-tolerance metric found by the Layer 2 gate. */
export interface ValidationIssue {
  metric: "lufs" | "crest" | "true_peak";
  measured: number;
  expected: string;
  message_es: string;
}

/** Post-master validation verdict (null when nothing to validate). */
export interface ValidationReport {
  status: "ok" | "warning";
  issues: ValidationIssue[];
  retry_recommended: boolean;
  retry_applied?: boolean;
  suggested_preset_id?: string | null;
  note?: string | null;
}

/** Delivery compliance report (Compliance Phase 1) — what the engine
 *  actually did to the delivered file. Nullable metrics stay null when
 *  they were never measured (pure passthrough, pre-built cache hits). */
export interface MasteringReport {
  input_sr: number | null; // SR del archivo subido
  output_sr: number | null; // SR entregado (después de SRC)
  output_bit_depth: number | null;
  lufs_i: number | null; // loudness integrada medida del entregado
  true_peak_dbtp: number | null;
  lra: number | null;
  crest_factor_db: number | null;
  target_lufs: number | null; // target REAL usado (null = no se aplicó loudness)
  warnings: string[]; // en español rioplatense
}

export interface SessionData {
  session_id: string;
  status: "uploaded" | "analyzing" | "processing" | "completed" | "error";
  progress: number;
  original_path: string | null;
  mastered_path: string | null;
  analysis: AnalysisResult | null;
  parameters: MasteringParameters;
  master_result?: MasterResultMetrics | null;
  validation?: ValidationReport | null;
  mastering_report?: MasteringReport | null;
  error: string | null;
}

export interface AnalysisResult {
  integrated_lufs: number;
  true_peak_db: number;
  dynamic_range_db: number;
  spectral_centroid: number;
  tempo_bpm: number;
  duration_seconds: number;
  sample_rate: number;
  channels: number;
  detected_genre: string;
  genre_confidence: number;
  crest_factor_db?: number;
  is_already_mastered?: boolean;
  mastering_confidence?: number;
}

/** Module-based mastering controls (replaces old fixed presets). */
export interface MasteringParameters {
  clarity_wet: number;
  clarity_brightness_db: number;
  compression_ratio: number;
  limiter_ceiling_db: number;
  transient_boost_db: number;
  saturation_drive_db: number;
  saturation_warmth_db: number;
  stereo_width: number;
  haas_delay_ms: number;
  output_bit_depth: number;
  target_lufs_db?: number;
  /* ── Delivery / Compliance (Phase 1) ── defaults mirror the backend
     (models/audio.py) so an untouched form stays byte-identical neutral. */
  processing_mode: "master" | "transparent";
  platform_target?: "spotify" | "apple_music" | "youtube" | "tidal" | "custom";
  output_sr: "same_as_input" | "44100" | "48000" | "96000";
  strict_mode: boolean;
}

export const DEFAULT_PARAMS: MasteringParameters = {
  clarity_wet: 0.15,
  clarity_brightness_db: 1.0,
  compression_ratio: 2.0,
  limiter_ceiling_db: -1.0,
  transient_boost_db: 0.0,
  saturation_drive_db: 0.0,
  saturation_warmth_db: 0.0,
  stereo_width: 1.0,
  haas_delay_ms: 0.0,
  output_bit_depth: 24,
  processing_mode: "master",
  output_sr: "same_as_input",
  strict_mode: false,
};

export async function uploadAudio(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<SessionData> {
  const formData = new FormData();
  formData.append("file", file);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    // Real upload progress (bytes sent vs total file size).
    xhr.upload.onprogress = (e: ProgressEvent) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.open("POST", `${API_BASE}/upload`, true);

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        try {
          resolve(xhr.response as SessionData);
        } catch {
          reject(new ApiError("Upload failed parsing response", xhr.status));
        }
      } else {
        let detail = "Upload failed";
        try {
          detail = JSON.parse(xhr.responseText)?.detail || detail;
        } catch {}
        reject(new ApiError(detail, xhr.status));
      }
    };

    xhr.onerror = () => reject(new ApiError("Upload failed", 0));
    xhr.responseType = "json";
    xhr.send(formData);
  });
}

export async function getSession(sessionId: string): Promise<SessionData> {
  const res = await fetch(`${API_BASE}/session/${sessionId}`);
  if (!res.ok) throw new ApiError("Session not found", res.status);
  return res.json();
}

export interface ProcessingProgress {
  progress: number; // 0.0 - 1.0 from the backend
  status: string;
}

export async function getProcessingProgress(sessionId: string): Promise<ProcessingProgress> {
  const res = await fetch(`${API_BASE}/session/${sessionId}`);
  if (!res.ok) throw new ApiError(`Progress fetch failed: ${res.status}`, res.status);
  const data = (await res.json()) as SessionData;
  return { progress: data.progress ?? 0, status: data.status ?? "" };
}

export async function processAudio(
  sessionId: string,
  parameters: MasteringParameters,
  signal?: AbortSignal,
  presetId?: string,
): Promise<SessionData> {
  const url = new URL(`${API_BASE}/session/${sessionId}/process`);
  if (presetId) {
    url.searchParams.set("preset_id", presetId);
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...licenseHeaders() },
    body: JSON.stringify(parameters),
    signal,
  });
  if (!res.ok) {
    // Surface the backend's detail (e.g. strict_mode 422 rejection) the
    // same way uploadAudio does — never swallow the message.
    const err = await res.json().catch(() => ({ detail: "Processing failed" }));
    throw new Error(err.detail || "Processing failed");
  }
  return res.json();
}

export function getAudioUrl(sessionId: string, type: "original" | "mastered"): string {
  return `${API_BASE}/session/${sessionId}/audio/${type}`;
}

export function getDownloadUrl(sessionId: string, format: "wav" | "mp3"): string {
  return `${API_BASE}/session/${sessionId}/download/${format}`;
}

/* ── Crudo Reference (Layer 3 fair A/B) ─────────────── */

/** Result of the on-demand neutral (Crudo) reference render. */
export interface ReferenceResult {
  reference_path: string;
  target_lufs: number;
  source_preset_id: string;
}

/**
 * Render the neutral reference loudness-matched to the preset master:
 * natural chain character + the preset's target_lufs/limiter ceiling.
 * Cached server-side per session+preset.
 */
export async function renderReference(
  sessionId: string,
  presetId: string,
): Promise<ReferenceResult> {
  const res = await fetch(
    `${API_BASE}/session/${sessionId}/reference/${encodeURIComponent(presetId)}`,
    { method: "POST", headers: { ...licenseHeaders() } },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Reference render failed" }));
    throw new Error(err.detail || "Reference render failed");
  }
  return res.json();
}

export function getReferenceAudioUrl(sessionId: string, presetId: string): string {
  return `${API_BASE}/session/${sessionId}/audio/reference/${encodeURIComponent(presetId)}`;
}

/* ── License ──────────────────────────────────────────── */

export function getStoredLicenseKey(): string | null {
  if (typeof window === "undefined") return null;
  // sessionStorage se borra al cerrar la pestaña — así cada sesión pide la clave
  return sessionStorage.getItem("waveai_license_key");
}

function licenseHeaders(): Record<string, string> {
  const key = getStoredLicenseKey();
  return key ? { "X-License-Key": key } : {};
}

export interface LicenseStatus {
  licensed: boolean;
  message: string;
}

export async function checkLicense(): Promise<LicenseStatus> {
  const res = await fetch(`${API_BASE}/license/status`);
  if (!res.ok) return { licensed: false, message: "Error al verificar licencia" };
  return res.json();
}

export async function activateLicense(
  key: string,
): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/license/activate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Activación fallida" }));
    throw new Error(err.detail || "Activación fallida");
  }
  return res.json();
}

/* ── Stem Splitter ───────────────────────────────────── */

export interface StemSplitResult {
  session_id: string;
  status: string;
  stems: Record<string, string>;
  sample_rate: number;
  duration_seconds: number;
}

export async function splitStems(
  sessionId: string,
  model: string = "htdemucs",
): Promise<StemSplitResult> {
  const res = await fetch(
    `${API_BASE}/session/${sessionId}/split?model=${model}`,
    {
      method: "POST",
      headers: { ...licenseHeaders() },
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Stem split failed" }));
    throw new Error(err.detail || "Stem split failed");
  }
  return res.json();
}

export async function listStems(sessionId: string): Promise<StemSplitResult> {
  const res = await fetch(`${API_BASE}/session/${sessionId}/stems`);
  if (!res.ok) throw new Error("Failed to list stems");
  return res.json();
}

export function getStemUrl(sessionId: string, stemName: string): string {
  return `${API_BASE}/session/${sessionId}/stem/${stemName}`;
}

export async function downloadStem(
  sessionId: string,
  stemName: string,
): Promise<Blob> {
  const res = await fetch(
    `${API_BASE}/session/${sessionId}/stem/${stemName}`,
    { headers: { ...licenseHeaders() } },
  );
  if (!res.ok) throw new Error("Failed to download stem");
  return res.blob();
}

/* ── Vocal Chain ─────────────────────────────────────── */

export interface VocalChainParams {
  deesser_amount: number;
  pitch_shift_semitones: number;
  cohesion_amount: number;
}

export interface VocalChainResult {
  session_id: string;
  status: string;
  gain_reduction_db: number;
  output_path: string;
}

export async function processVocalChain(
  sessionId: string,
  params: VocalChainParams,
): Promise<VocalChainResult> {
  const res = await fetch(`${API_BASE}/session/${sessionId}/vocal`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...licenseHeaders() },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Vocal processing failed" }));
    throw new Error(err.detail || "Vocal processing failed");
  }
  return res.json();
}

/* ── SongStarter ──────────────────────────────────── */

export interface BeatParams {
  bpm: number;
  scale: string;
  root_note: string;
  swing_amount?: number;
}

export interface BeatResponse {
  beat_id: string;
  bpm: number;
  scale: string;
  root_note: string;
  swing_amount: number;
  duration: number;
  output_path: string;
  stems: Record<string, string>;
}

export interface SavedBeat {
  id: string;
  name?: string;
  bpm: number;
  scale: string;
  root_note: string;
  swing_amount: number;
  duration: number;
  created_at: string;
}

export async function generateBeat(
  sessionId: string,
  params: BeatParams,
): Promise<BeatResponse> {
  const res = await fetch(
    `${API_BASE}/session/${sessionId}/beat/generate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Beat generation failed" }));
    throw new Error(err.detail || "Beat generation failed");
  }
  return res.json();
}

export async function saveBeat(
  sessionId: string,
  beatId: string,
  name?: string,
  params?: BeatParams,
): Promise<{ message: string; beat_id: string }> {
  const body: Record<string, unknown> = { session_id: sessionId, beat_id: beatId };
  if (name) body.name = name;
  if (params) {
    body.bpm = params.bpm;
    body.scale = params.scale;
    body.root_note = params.root_note;
    body.swing_amount = params.swing_amount ?? 0.3;
  }
  const res = await fetch(`${API_BASE}/beat/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Save failed" }));
    throw new Error(err.detail || "Save failed");
  }
  return res.json();
}

export async function listBeats(): Promise<SavedBeat[]> {
  const res = await fetch(`${API_BASE}/beats`);
  if (!res.ok) throw new Error("Failed to list beats");
  return res.json();
}

export async function getBeat(beatId: string): Promise<SavedBeat> {
  const res = await fetch(`${API_BASE}/beat/${beatId}`);
  if (!res.ok) throw new Error("Beat not found");
  return res.json();
}

export async function deleteBeat(beatId: string): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE}/beat/${beatId}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete beat");
  return res.json();
}

export function getBeatAudioUrl(sessionId: string, beatId: string, stem?: string): string {
  let url = `${API_BASE}/session/${sessionId}/beat/${beatId}/audio`;
  if (stem) url += `?stem=${encodeURIComponent(stem)}`;
  return url;
}

export function getSavedBeatAudioUrl(beatId: string, stem?: string): string {
  let url = `${API_BASE}/beat/${beatId}/audio`;
  if (stem) url += `?stem=${encodeURIComponent(stem)}`;
  return url;
}

export async function downloadMastered(
  sessionId: string,
  format: "wav" | "mp3",
): Promise<Blob> {
  const res = await fetch(
    `${API_BASE}/session/${sessionId}/download/${format}`,
    { headers: { ...licenseHeaders() } },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Descarga fallida" }));
    throw new Error(err.detail || "Descarga fallida");
  }
  return res.blob();
}
