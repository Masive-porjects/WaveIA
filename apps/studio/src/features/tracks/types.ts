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
  created_at: string;
  updated_at: string;
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
}

export interface AudioMetadata {
  duration: number;
  sampleRate: number;
  channels: number;
  format: string;
  fileSizeBytes: number;
}
