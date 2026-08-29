"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Entrada de voz: graba con el micrófono y transcribe en el servidor.
 *
 * NO usa el reconocimiento de voz del navegador. Ese no transcribe localmente:
 * Chrome manda el audio a servidores de Google, y esa petición falla en algunas
 * redes con un error que el cliente no puede reintentar. La transcripción la
 * hace `/voz/escuchar` con ElevenLabs Scribe, y Gemini como respaldo.
 *
 * La grabación sí es local — del equipo sale solo el audio ya grabado.
 */

export interface UseVoiceInputOptions {
  onFinal?: (text: string) => void;
}

export interface VoiceInput {
  /** false solo si el navegador no permite grabar audio. */
  supported: boolean;
  listening: boolean;
  /** true mientras el servidor transcribe lo grabado. */
  transcribing: boolean;
  error: string | null;
  /** Empieza a grabar, o corta y envia si ya estaba grabando. */
  toggle: () => void;
  /** Corta y descarta sin transcribir. */
  cancel: () => void;
}

/** El primero que soporte el navegador. El servidor acepta los tres. */
function pickMimeType(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"];
  for (const type of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return "";
}

export function useVoiceInput(options: UseVoiceInputOptions = {}): VoiceInput {
  const { onFinal } = options;

  // El motor inicial se calcula una sola vez, sin efecto: si el navegador ni
  // siquiera implementa la API, se arranca directo en Gemini.
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const discardRef = useRef(false);

  const onFinalRef = useRef(onFinal);
  useEffect(() => {
    onFinalRef.current = onFinal;
  }, [onFinal]);

  const stopTracks = useCallback(() => {
    recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    recorderRef.current = null;
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    chunksRef.current = [];
    discardRef.current = false;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      setError(
        "Necesito permiso para usar el micrófono. Habilitalo en el candado de la barra de direcciones.",
      );
      return;
    }

    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      stopTracks();
      setRecording(false);
      if (discardRef.current) return;

      const blob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
      // Menos de medio segundo es un toque accidental, no una instrucción.
      if (blob.size < 2000) return;

      setTranscribing(true);
      try {
        const form = new FormData();
        form.append("audio", blob, "voz.webm");
        const res = await fetch("/voz/escuchar", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        const text = (data.text ?? "").trim();
        if (text) onFinalRef.current?.(text);
        else setError("No te entendí. Probá de nuevo hablando un poco más fuerte.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "No pude transcribir el audio.");
      } finally {
        setTranscribing(false);
      }
    };

    recorder.start();
    setRecording(true);
  }, [stopTracks]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }, []);

  const toggle = useCallback(() => {
    if (recording) stopRecording();
    else void startRecording();
  }, [recording, startRecording, stopRecording]);

  const cancel = useCallback(() => {
    discardRef.current = true;
    stopRecording();
    stopTracks();
    setRecording(false);
  }, [stopRecording, stopTracks]);

  useEffect(() => stopTracks, [stopTracks]);

  return {
    // MediaRecorder existe en todo navegador moderno, Firefox incluido.
    supported: typeof window !== "undefined" && typeof MediaRecorder !== "undefined",
    listening: recording,
    transcribing,
    error,
    toggle,
    cancel,
  };
}
