/**
 * useLiveEngine — React hook orchestrating the standalone Live Engine.
 * Manages: AudioContext, AudioGraph, Recorder, and UI state.
 * No WebSocket: params come exclusively from the knob UI (mouse/keyboard).
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type { LiveParams } from '@/lib/live/liveParams.gen';
import { createAudioGraph, AudioGraph } from './audioGraph';
import { createRecorder, RecorderState } from './recorder';
import { applyPreset, FX_PRESETS, FxPresetName } from './fxPresets';
import { LIVE_PARAM_DEFAULTS } from '@/lib/live/liveDefaults';

export interface UseLiveEngineOptions {
  /** Master audio buffer (from WaveAI mastering) */
  masterAudioBuffer: AudioBuffer | null;
  /** AudioContext (shared or created internally) */
  audioContext?: AudioContext;
  /** Initial LiveParams */
  initialParams?: Partial<LiveParams>;
  /** Callbacks */
  onParamsChange?: (params: LiveParams) => void;
  onError?: (error: Error) => void;
}

export interface UseLiveEngineReturn {
  // State
  params: LiveParams;
  outputLevel: number;
  analyserData: { frequency: Uint8Array; timeDomain: Uint8Array } | null;
  recorderState: RecorderState;
  isPlaying: boolean;

  // Actions
  setParams: (params: Partial<LiveParams>) => void;
  setFxPreset: (preset: FxPresetName) => void;
  play: () => void;
  pause: () => void;
  stop: () => void;
  startRecording: () => void;
  stopRecording: () => void;
  downloadRecording: (filename?: string) => void;

  // Cleanup
  destroy: () => void;
}

/**
 * Main hook for the standalone Live Engine (knob-controlled).
 * Pipeline: Knobs → LiveParams → AudioGraph → Recorder.
 */
export function useLiveEngine(options: UseLiveEngineOptions): UseLiveEngineReturn {
  const {
    masterAudioBuffer,
    audioContext: providedContext,
    initialParams = {},
    onParamsChange,
    onError,
  } = options;

  // ── Refs for persistent objects ──────────────────────────────────
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioGraphRef = useRef<AudioGraph | null>(null);
  const recorderRef = useRef<ReturnType<typeof createRecorder> | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // ── React State ──────────────────────────────────────────────────
  const [params, setParamsState] = useState<LiveParams>(() => ({
    ...LIVE_PARAM_DEFAULTS,
    ts: Date.now(),
    ...initialParams,
  }));
  const [outputLevel, setOutputLevel] = useState(0);
  const [analyserData, setAnalyserData] = useState<{ frequency: Uint8Array; timeDomain: Uint8Array } | null>(null);
  const [recorderState, setRecorderState] = useState<RecorderState>({
    recording: false,
    paused: false,
    duration: 0,
    blob: null,
    url: null,
    mimeType: null,
    extension: null,
  });
  const [isPlaying, setIsPlaying] = useState(false);

  // Latest-value ref: lets the audio graph effect read current params
  // WITHOUT re-running (and recreating the graph) on every param change.
  // Synced via effect (React 19 forbids writing refs during render).
  const paramsRef = useRef(params);
  useEffect(() => {
    paramsRef.current = params;
  }, [params]);

  // ── Initialize AudioContext ──────────────────────────────────────
  useEffect(() => {
    if (!audioContextRef.current) {
      const ctx = providedContext || new AudioContext({ latencyHint: 'interactive' });
      audioContextRef.current = ctx;
    }
  }, [providedContext]);

  // ── Initialize AudioGraph when buffer is ready ───────────────────
  useEffect(() => {
    const ctx = audioContextRef.current;
    if (!ctx || !masterAudioBuffer || audioGraphRef.current) return;

    // Resume context if suspended (browser autoplay policy)
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const graph = createAudioGraph(ctx, masterAudioBuffer, paramsRef.current);
    audioGraphRef.current = graph;

    // Connect recorder to master output
    const recorder = createRecorder(ctx, {
      onStop: (blob, url) => {
        setRecorderState(prev => ({ ...prev, recording: false, blob, url }));
      },
      onError: (err) => onError?.(err),
    });
    recorderRef.current = recorder;
    if (recorder.mediaStreamDestination) {
      graph.nodes.masterGain.connect(recorder.mediaStreamDestination);
    }

    return () => {
      graph.disconnect();
      audioGraphRef.current = null;
      if (recorderRef.current) {
        recorderRef.current.cleanup();
        recorderRef.current = null;
      }
    };
  }, [masterAudioBuffer]);

  // ── Analyser / Output Level Loop ────────────────────────────────
  useEffect(() => {
    const graph = audioGraphRef.current;
    if (!graph) return;

    const tick = () => {
      const data = graph.getAnalyserData();
      const level = graph.getOutputLevel();
      setAnalyserData(data);
      setOutputLevel(level);
      animationFrameRef.current = requestAnimationFrame(tick);
    };
    animationFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // ── Parameter Setters ────────────────────────────────────────────
  const setParams = useCallback((newParams: Partial<LiveParams>) => {
    setParamsState(prev => {
      const merged = { ...prev, ...newParams, ts: Date.now() };
      audioGraphRef.current?.setParams(newParams);
      onParamsChange?.(merged);
      return merged;
    });
  }, [onParamsChange]);

  const setFxPreset = useCallback((preset: FxPresetName) => {
    setParamsState(prev => {
      const next = applyPreset(prev, preset);
      audioGraphRef.current?.setFxPreset(preset);
      onParamsChange?.(next);
      return next;
    });
  }, [onParamsChange]);

  // ── Transport Controls ───────────────────────────────────────────
  const play = useCallback(() => {
    audioGraphRef.current?.start(true);
    setIsPlaying(true);
  }, []);

  const pause = useCallback(() => {
    audioGraphRef.current?.stop();
    setIsPlaying(false);
  }, []);

  const stop = useCallback(() => {
    audioGraphRef.current?.stop();
    setIsPlaying(false);
  }, []);

  // ── Recorder Controls ────────────────────────────────────────────
  const startRecording = useCallback(() => {
    recorderRef.current?.start();
    setRecorderState(prev => ({ ...prev, recording: true, paused: false, duration: 0 }));
  }, []);

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop();
    // State updated via onStop callback
  }, []);

  const downloadRecording = useCallback((filename?: string) => {
    recorderRef.current?.download(filename);
  }, []);

  // ── Cleanup ──────────────────────────────────────────────────────
  const destroy = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    audioGraphRef.current?.disconnect();
    recorderRef.current?.cleanup();
    if (audioContextRef.current && !providedContext) {
      audioContextRef.current.close();
    }
  }, [providedContext]);

  useEffect(() => {
    return () => destroy();
  }, [destroy]);

  return {
    // State
    params,
    outputLevel,
    analyserData,
    recorderState,
    isPlaying,
    // Actions
    setParams,
    setFxPreset,
    play,
    pause,
    stop,
    startRecording,
    stopRecording,
    downloadRecording,
    destroy,
  };
}
