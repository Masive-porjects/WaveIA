import { createClient } from "@/lib/supabase/client";
import type { PaginationParams, PaginatedResult } from "@/shared/types/pagination";
import type {
  Track,
  CreateTrackInput,
  AudioMetadata,
  MasterRecord,
  CreateMasterInput,
  TrackFilterStatus,
} from "../types";

/**
 * Extracts basic technical metadata from an audio file in the browser
 * using the Web Audio API.
 */
export async function extractAudioMetadata(file: File): Promise<AudioMetadata> {
  const format = file.name.split(".").pop()?.toLowerCase() || "wav";
  const fileSizeBytes = file.size;

  if (typeof window === "undefined") {
    return {
      duration: 0,
      sampleRate: 44100,
      channels: 2,
      format,
      fileSizeBytes,
    };
  }

  // Method 1: Decode via Web Audio API for exact sample rate and channels
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      const duration = Number(audioBuffer.duration.toFixed(2));
      const sampleRate = audioBuffer.sampleRate;
      const channels = audioBuffer.numberOfChannels;
      await ctx.close();

      return {
        duration,
        sampleRate,
        channels,
        format,
        fileSizeBytes,
      };
    }
  } catch {
    // If decodeAudioData fails (e.g. browser codec restriction), fallback to HTMLAudioElement
  }

  // Method 2: HTMLAudioElement fallback for duration
  try {
    const objectUrl = URL.createObjectURL(file);
    const audio = new Audio();
    const duration = await new Promise<number>((resolve) => {
      audio.onloadedmetadata = () => {
        resolve(Number(audio.duration.toFixed(2)) || 0);
      };
      audio.onerror = () => resolve(0);
      audio.src = objectUrl;
    });
    URL.revokeObjectURL(objectUrl);

    return {
      duration,
      sampleRate: 44100,
      channels: 2,
      format,
      fileSizeBytes,
    };
  } catch {
    return {
      duration: 0,
      sampleRate: 44100,
      channels: 2,
      format,
      fileSizeBytes,
    };
  }
}

/**
 * Uploads an original audio file directly to Supabase Storage in the user's isolated folder.
 */
export async function uploadOriginalAudio(
  userId: string,
  file: File,
  trackId: string
): Promise<{ storagePath: string }> {
  const supabase = createClient();
  const ext = file.name.split(".").pop()?.toLowerCase() || "wav";
  const storagePath = `${userId}/${trackId}.${ext}`;

  const { data, error } = await supabase.storage
    .from("audio-originals")
    .upload(storagePath, file, {
      cacheControl: "3600",
      upsert: true,
      contentType: file.type || `audio/${ext}`,
    });

  if (error) {
    throw new Error(`Error uploading audio to Supabase Storage: ${error.message}`);
  }

  return { storagePath: data.path };
}

/**
 * Creates a track record in the public.tracks table with complete audio metadata.
 */
export async function createTrackRecord(
  userId: string,
  input: CreateTrackInput
): Promise<Track> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("tracks")
    .insert({
      id: input.id,
      user_id: userId,
      title: input.title,
      original_filename: input.original_filename,
      storage_path: input.storage_path,
      file_size_bytes: input.file_size_bytes,
      duration_seconds: input.duration_seconds ?? null,
      sample_rate: input.sample_rate ?? null,
      channels: input.channels ?? null,
      format: input.format ?? null,
      status: input.status ?? "uploaded",
      draft_parameters: input.draft_parameters ?? null,
      active_preset: input.active_preset ?? null,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Error saving track record: ${error.message}`);
  }

  return data as Track;
}

/**
 * Fetches user tracks with standardized server-side pagination, search and status filtering.
 */
export async function fetchUserTracks(
  userId: string,
  params?: PaginationParams & { filter?: TrackFilterStatus }
): Promise<PaginatedResult<Track>> {
  const supabase = createClient();
  const page = Math.max(1, params?.page ?? 1);
  const pageSize = Math.max(1, params?.pageSize ?? 10);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("tracks")
    .select("*, masters(*)", { count: "exact" })
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (params?.search && params.search.trim()) {
    const s = params.search.trim();
    query = query.or(`title.ilike.%${s}%,original_filename.ilike.%${s}%`);
  }

  if (params?.filter === "draft") {
    query = query.not("draft_parameters", "is", null);
  } else if (params?.filter === "completed") {
    query = query.eq("status", "completed");
  }

  const { data, count, error } = await query.range(from, to);

  if (error) {
    throw new Error(`Error fetching tracks: ${error.message}`);
  }

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return {
    items: (data || []) as Track[],
    totalCount,
    page,
    pageSize,
    totalPages,
  };
}

/**
 * Creates a signed URL to stream or download an original audio file securely.
 */
export async function getOriginalSignedUrl(
  storagePath: string,
  expiresInSeconds = 3600
): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from("audio-originals")
    .createSignedUrl(storagePath, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(`Error generating signed audio URL: ${error?.message || "Unknown"}`);
  }

  return data.signedUrl;
}

/**
 * Deletes a track record, its original audio, and all associated master files.
 */
export async function deleteTrack(
  trackId: string,
  storagePath: string
): Promise<void> {
  const supabase = createClient();

  // 1. Fetch any master files to remove from storage
  const { data: masters } = await supabase
    .from("masters")
    .select("storage_path")
    .eq("track_id", trackId);

  if (masters && masters.length > 0) {
    const masterPaths = masters.map((m: { storage_path: string }) => m.storage_path).filter(Boolean);
    if (masterPaths.length > 0) {
      await supabase.storage.from("audio-masters").remove(masterPaths);
    }
  }

  // 2. Delete original audio file
  if (storagePath) {
    await supabase.storage.from("audio-originals").remove([storagePath]);
  }

  // 3. Delete track record (cascades to public.masters)
  const { error } = await supabase.from("tracks").delete().eq("id", trackId);
  if (error) {
    throw new Error(`Error deleting track record: ${error.message}`);
  }
}

/**
 * Updates a track's processing status.
 */
export async function updateTrackStatus(
  trackId: string,
  status: Track["status"]
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("tracks")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", trackId);

  if (error) {
    console.error("Error updating track status:", error);
  }
}

/**
 * Saves non-destructive draft parameters and active preset in real time.
 */
export async function saveTrackDraft(
  trackId: string,
  draftParameters: Record<string, any>,
  activePreset: string | null = null
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("tracks")
    .update({
      draft_parameters: draftParameters,
      active_preset: activePreset,
      updated_at: new Date().toISOString(),
    })
    .eq("id", trackId);

  if (error) {
    console.error("Error saving draft parameters:", error);
    throw new Error(`Error saving draft: ${error.message}`);
  }
}

/**
 * Clears draft parameters when a master is finalized or reset.
 */
export async function clearTrackDraft(
  trackId: string,
  markCompleted = true
): Promise<void> {
  const supabase = createClient();
  const updateData: Record<string, any> = {
    draft_parameters: null,
    active_preset: null,
    updated_at: new Date().toISOString(),
  };
  if (markCompleted) {
    updateData.status = "completed";
  }
  const { error } = await supabase
    .from("tracks")
    .update(updateData)
    .eq("id", trackId);

  if (error) {
    console.error("Error clearing track draft:", error);
    throw new Error(`Error clearing draft: ${error.message}`);
  }
}

/**
 * Uploads a consolidated master render to the audio-masters bucket in Supabase Storage.
 */
export async function uploadMasterAudio(
  userId: string,
  trackId: string,
  fileOrBlob: Blob | File,
  format = "wav"
): Promise<{ storagePath: string }> {
  const supabase = createClient();
  const storagePath = `${userId}/${trackId}/master_${Date.now()}.${format}`;

  const { data, error } = await supabase.storage
    .from("audio-masters")
    .upload(storagePath, fileOrBlob, {
      cacheControl: "3600",
      upsert: true,
      contentType: format === "mp3" ? "audio/mpeg" : `audio/${format}`,
    });

  if (error) {
    throw new Error(`Error uploading master to Supabase Storage: ${error.message}`);
  }

  return { storagePath: data.path };
}

/**
 * Creates an auditable master record in public.masters.
 */
export async function createMasterRecord(
  userId: string,
  input: CreateMasterInput
): Promise<MasterRecord> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("masters")
    .insert({
      id: input.id,
      track_id: input.track_id,
      user_id: userId,
      storage_path: input.storage_path,
      format: input.format,
      file_size_bytes: input.file_size_bytes,
      integrated_lufs: input.integrated_lufs ?? null,
      true_peak_db: input.true_peak_db ?? null,
      parameters_applied: input.parameters_applied ?? {},
      preset_name: input.preset_name ?? null,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Error creating master record: ${error.message}`);
  }

  return data as MasterRecord;
}

/**
 * Generates a signed URL to stream or download a consolidated master.
 */
export async function getMasterSignedUrl(
  storagePath: string,
  expiresInSeconds = 3600
): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from("audio-masters")
    .createSignedUrl(storagePath, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(`Error generating signed master URL: ${error?.message || "Unknown"}`);
  }

  return data.signedUrl;
}

/**
 * Fetches all consolidated masters for a given track.
 */
export async function fetchTrackMasters(trackId: string): Promise<MasterRecord[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("masters")
    .select("*")
    .eq("track_id", trackId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Error fetching track masters: ${error.message}`);
  }

  return (data || []) as MasterRecord[];
}


