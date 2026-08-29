/**
 * Live Recorder — Capture the live output using MediaRecorder.
 * Records the post-FX master signal. Detects best supported MIME type.
 */

export type RecordingFormat = 'wav' | 'webm' | 'ogg' | 'mp4';

export interface RecorderConfig {
  bitRate?: number;       // For webm/ogg (e.g., 128000)
  onDataAvailable?: (chunk: Blob) => void;
  onStop?: (blob: Blob, url: string) => void;
  onError?: (error: Error) => void;
}

export interface RecorderState {
  recording: boolean;
  paused: boolean;
  duration: number;       // seconds
  blob: Blob | null;
  url: string | null;
  mimeType: string | null;
  extension: string | null;
}

/**
 * Create a recorder for the live audio graph output.
 * Uses AudioContext.createMediaStreamDestination() to tap the master output.
 * Detects best supported MIME type automatically.
 */
export interface RecorderApi {
  state: RecorderState;
  mediaStreamDestination: MediaStreamAudioDestinationNode;
  start: () => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  download: (filename?: string) => void;
  cleanup: () => void;
  getStream: () => MediaStream;
}

export function createRecorder(
  audioContext: AudioContext,
  config: RecorderConfig = {}
): RecorderApi {
  const { bitRate = 128000, onDataAvailable, onStop, onError } = config;

  // Create MediaStream destination to tap audio
  const mediaStreamDest = audioContext.createMediaStreamDestination();
  const stream = mediaStreamDest.stream;

  // Detect best supported MIME type
  const mimeTypeCandidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
    'audio/mp4',
    'audio/wav',
  ];
  const mimeType = mimeTypeCandidates.find(t => MediaRecorder.isTypeSupported(t)) || 'audio/webm';

  const extMap: Record<string, string> = {
    'audio/webm': '.webm',
    'audio/webm;codecs=opus': '.webm',
    'audio/ogg': '.ogg',
    'audio/ogg;codecs=opus': '.ogg',
    'audio/mp4': '.m4a',
    'audio/wav': '.wav',
  };
  const extension = extMap[mimeType] || '.webm';

  let recorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let startTime = 0;
  let animationFrame: number | null = null;

  const state: RecorderState = {
    recording: false,
    paused: false,
    duration: 0,
    blob: null,
    url: null,
    mimeType,
    extension,
  };

  // MediaRecorder setup
  const options: MediaRecorderOptions = { mimeType };
  if (mimeType.startsWith('audio/webm') || mimeType.startsWith('audio/ogg')) {
    options.audioBitsPerSecond = bitRate;
  }

  try {
    recorder = new MediaRecorder(stream, options);
  } catch (err) {
    onError?.(err as Error);
    return {
      state,
      mediaStreamDestination: mediaStreamDest,
      start: () => {},
      stop: () => {},
      pause: () => {},
      resume: () => {},
      download: () => {},
      cleanup: () => {},
      getStream: () => stream,
    };
  }

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      chunks.push(event.data);
      onDataAvailable?.(event.data);
    }
  };

  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: options.mimeType });
    const url = URL.createObjectURL(blob);
    state.recording = false;
    state.paused = false;
    state.blob = blob;
    state.url = url;
    onStop?.(blob, url);
  };

  recorder.onerror = (event: Event) => {
    const target = event.target as MediaRecorder & { error?: DOMException };
    const errMsg = target.error?.message || 'Unknown';
    onError?.(new Error(`MediaRecorder error: ${errMsg}`));
  };

  function updateDuration() {
    if (state.recording && !state.paused) {
      state.duration = (Date.now() - startTime) / 1000;
      animationFrame = requestAnimationFrame(updateDuration);
    }
  }

  return {
    get state() { return state; },
    get mediaStreamDestination() { return mediaStreamDest; },
    getStream() { return stream; },

    start() {
      if (state.recording) return;
      chunks = [];
      startTime = Date.now();
      state.recording = true;
      state.paused = false;
      state.duration = 0;
      state.blob = null;
      if (state.url) {
        URL.revokeObjectURL(state.url);
        state.url = null;
      }
      recorder?.start(100); // timeslice 100ms
      updateDuration();
    },

    stop() {
      if (!state.recording) return;
      recorder?.stop();
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
      }
    },

    pause() {
      if (!state.recording || state.paused) return;
      recorder?.pause();
      state.paused = true;
    },

    resume() {
      if (!state.recording || !state.paused) return;
      recorder?.resume();
      state.paused = false;
    },

    download(filename?: string) {
      if (!state.blob || !state.url) return;
      const ext = state.extension || '.webm';
      const name = filename ? (filename.endsWith(ext) ? filename : filename + ext) : `live-recording-${Date.now()}${ext}`;
      const a = document.createElement('a');
      a.href = state.url;
      a.download = name;
      a.click();
    },

    cleanup() {
      if (state.url) {
        URL.revokeObjectURL(state.url);
        state.url = null;
      }
      state.blob = null;
    },
  };
}

/**
 * Helper: Connect recorder to audio graph master output.
 * Usage: graph.nodes.masterGain.connect(recorder.mediaStreamDestination);
 */
