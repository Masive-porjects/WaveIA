export type TrackStatus =
  | "uploaded"
  | "analyzing"
  | "ready"
  | "mastering"
  | "completed"
  | "error";

export interface Track {
  id: string;
  user_id: string;
  title: string;
  original_filename: string;
  storage_path: string;
  file_size_bytes: number;
  duration_seconds: number | null;
  sample_rate: number | null;
  channels: number | null;
  format: string | null;
  status: TrackStatus;
  draft_parameters?: Record<string, any> | null;
  active_preset?: string | null;
  created_at: string;
  updated_at: string;
  masters?: MasterRecord[];
}

export interface CreateTrackInput {
  id?: string;
  title: string;
  original_filename: string;
  storage_path: string;
  file_size_bytes: number;
  duration_seconds?: number | null;
  sample_rate?: number | null;
  channels?: number | null;
  format?: string | null;
  status?: TrackStatus;
  draft_parameters?: Record<string, any> | null;
  active_preset?: string | null;
}

export interface AudioMetadata {
  duration: number;
  sampleRate: number;
  channels: number;
  format: string;
  fileSizeBytes: number;
}

export interface MasterRecord {
  id: string;
  track_id: string;
  user_id: string;
  storage_path: string;
  format: string;
  file_size_bytes: number;
  integrated_lufs: number | null;
  true_peak_db: number | null;
  parameters_applied: Record<string, any>;
  preset_name: string | null;
  created_at: string;
}

export interface CreateMasterInput {
  id?: string;
  track_id: string;
  storage_path: string;
  format: string;
  file_size_bytes: number;
  integrated_lufs?: number | null;
  true_peak_db?: number | null;
  parameters_applied?: Record<string, any>;
  preset_name?: string | null;
}

export type TrackFilterStatus = "all" | "draft" | "completed";

