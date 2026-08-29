"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useSpeechInput } from "./useSpeechInput";

/**
 * Entrada de voz con dos motores y cambio automático.
 *
 * 1. Reconocimiento del navegador — gratis e instantáneo, pero Chrome manda el
 *    audio a servidores de Google y en algunas redes eso falla con "network".
 * 2. Grabación local + Gemini — usa la misma clave que el chat, así que si el
 *    chat funciona, esto funciona.
 *
 * Arranca con el navegador y, ante el primer fallo que no se arregla
 * reintentando, se pasa a Gemini para el resto de la sesión sin avisar. Al
 * usuario le tiene que dar igual cuál está corriendo.
 */

export type VoiceEngine = "browser" | "gemini";

/**
 * Si el reconocimiento del navegador ya fallo en este equipo, se recuerda.
 *
 * En redes donde Google no responde falla SIEMPRE, y reintentarlo en cada
 * sesion solo agrega una demora y un error visible antes de caer a Gemini.
 */
const FALLBACK_KEY = "waveai-voice-fallback";

function browserFailedBefore(): boolean {
  try {
    return localStorage.getItem(FALLBACK_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberBrowserFailure(): void {
  try {
    localStorage.setItem(FALLBACK_KEY, "1");
  } catch {
    // Storage bloqueado: se reintenta el navegador la proxima vez. No es grave.
  }
}

export interface UseVoiceInputOptions {
  lang?: string;
  onFinal?: (text: string) => void;
}

export interface VoiceInput {
  /** Siempre true: si el navegador no reconoce, se graba y transcribe. */
  supported: boolean;
  listening: boolean;
  /** true mientras Gemini transcribe lo grabado. */
  transcribing: boolean;
  transcript: string;
  error: string | null;
  engine: VoiceEngine;
  toggle: () => void;
  cancel: () => void;
}

/** El primero que soporte el navegador. Gemini acepta los tres. */
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
  const { lang = "es-ES", onFinal } = options;

  // El motor inicial se calcula una sola vez, sin efecto: si el navegador ni
  // siquiera implementa la API, se arranca directo en Gemini.
  const [engine, setEngine] = useState<VoiceEngine>(() => {
    if (typeof window === "undefined") return "gemini";
    const hasApi =
      "SpeechRecognition" in window || "webkitSpeechRecognition" in window;
    if (!hasApi || browserFailedBefore()) return "gemini";
    return "browser";
  });
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

  // startRecording se define mas abajo, asi que se llama por ref para no
  // reordenar el archivo ni crear una dependencia circular entre callbacks.
  const startRecordingRef = useRef<() => void>(() => {});

  const browser = useSpeechInput({
    lang,
    onFinal,
    onFatalError: useCallback((code: string) => {
      // Permiso denegado o micro ausente fallan igual con cualquier motor:
      // ahi si se le muestra al usuario.
      if (code === "not-allowed" || code === "service-not-allowed" || code === "audio-capture") {
        setError(
          "Necesito permiso para usar el micrófono. Habilitalo en el candado de la barra de direcciones.",
        );
        return;
      }
      // Lo demas (tipicamente "network") lo resuelve Gemini. Se cambia de motor
      // y se sigue grabando en el acto: el usuario no tiene que volver a tocar.
      rememberBrowserFailure();
      setEngine("gemini");
      setError(null);
      startRecordingRef.current();
    }, []),
  });

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

  useEffect(() => {
    startRecordingRef.current = () => void startRecording();
  }, [startRecording]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }, []);

  const toggle = useCallback(() => {
    if (engine === "browser") {
      // El navegador ya fallo una vez: se cambia de motor para el resto de la
      // sesion. Se decide aca y no en un efecto porque setState dentro de un
      // efecto dispara renders en cascada.
      if (browser.error) {
        setEngine("gemini");
        setError(null); // el cambio es transparente, no es culpa del usuario
        void startRecording();
        return;
      }
      browser.toggle();
      return;
    }
    if (recording) stopRecording();
    else void startRecording();
  }, [engine, browser, recording, startRecording, stopRecording]);

  const cancel = useCallback(() => {
    if (engine === "browser") {
      browser.cancel();
      return;
    }
    discardRef.current = true;
    stopRecording();
    stopTracks();
    setRecording(false);
  }, [engine, browser, stopRecording, stopTracks]);

  useEffect(() => stopTracks, [stopTracks]);

  return {
    supported: true,
    listening: engine === "browser" ? browser.listening : recording,
    transcribing,
    transcript: engine === "browser" ? browser.transcript : "",
    error: engine === "browser" ? browser.error : error,
    engine,
    toggle,
    cancel,
  };
}
