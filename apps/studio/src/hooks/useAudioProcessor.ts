"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { AudioProcessor } from "@/lib/audio-processor";

export function useAudioProcessor() {
  const processorRef = useRef<AudioProcessor | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentVersion, setCurrentVersion] = useState<"original" | "mastered">("original");
  const animFrameRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      processorRef.current?.destroy();
      cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  useEffect(() => {
    const updatePosition = () => {
      if (processorRef.current) {
        setPosition(processorRef.current.getPosition());
      }
      animFrameRef.current = requestAnimationFrame(updatePosition);
    };
    animFrameRef.current = requestAnimationFrame(updatePosition);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, []);

  /**
   * Load original (raw) audio only — used at upload time (no mastered yet).
   */
  const loadOriginal = useCallback(async (sessionId: string) => {
    setIsLoading(true);
    try {
      if (!processorRef.current) {
        processorRef.current = new AudioProcessor();
      }
      await processorRef.current.init();
      await processorRef.current.loadOriginal(sessionId);
      setDuration(processorRef.current.getDuration());
    } catch (err) {
      console.error("Failed to load audio:", err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Play the original (raw) audio.
   */
  const playOriginal = useCallback(() => {
    processorRef.current?.playOriginal();
    setIsPlaying(true);
    setCurrentVersion("original");
  }, []);

  /**
   * Play the mastered audio.
   */
  const playMastered = useCallback(() => {
    processorRef.current?.playMastered();
    setIsPlaying(true);
    setCurrentVersion("mastered");
  }, []);

  const play = useCallback(() => {
    processorRef.current?.play();
    setIsPlaying(true);
  }, []);

  const pause = useCallback(() => {
    processorRef.current?.pause();
    setIsPlaying(false);
  }, []);

  const stop = useCallback(() => {
    processorRef.current?.stop();
    setIsPlaying(false);
    setPosition(0);
  }, []);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  }, [isPlaying, play, pause]);

  const seek = useCallback((normalized: number) => {
    processorRef.current?.seek(normalized);
    setPosition(normalized);
  }, []);

  /**
   * Reload only the mastered audio buffer (after re-processing with new preset).
   */
  const loadMastered = useCallback(async (sessionId: string) => {
    if (!processorRef.current) return;
    await processorRef.current.loadMastered(sessionId);
    setDuration(processorRef.current.getDuration());
  }, []);

  return {
    loadOriginal,
    loadMastered,
    play,
    pause,
    stop,
    togglePlay,
    seek,
    playOriginal,
    playMastered,
    isPlaying,
    isLoading,
    position,
    duration,
    currentVersion,
  };
}
