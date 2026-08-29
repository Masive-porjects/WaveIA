"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Reconocimiento de voz con la Web Speech API del navegador.
 *
 * Es nativa y gratis: cero creditos de ElevenLabs para la entrada. Los creditos
 * se reservan para la salida, que es donde la calidad de voz se nota.
 *
 * Anda en Chrome, Edge y Safari. Firefox no la implementa.
 */

// La Web Speech API no esta en lib.dom, asi que declaramos lo minimo que usamos.
interface SpeechRecognitionAlternative {
  transcript: string;
}
interface SpeechRecognitionResult {
  readonly length: number;
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionResultList {
  readonly length: number;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
}
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface UseSpeechInputOptions {
  /** Variante regional. "es-CO", "es-MX", "es-AR" tambien son validas. */
  lang?: string;
  /** Se dispara con la transcripcion final cuando el usuario suelta el boton. */
  onFinal?: (text: string) => void;
}

export interface SpeechInput {
  /** true si el navegador implementa la API. Firefox devuelve false. */
  supported: boolean;
  listening: boolean;
  /** Texto en curso, incluyendo resultados parciales. */
  transcript: string;
  error: string | null;
  start: () => void;
  stop: () => void;
}

export function useSpeechInput(options: UseSpeechInputOptions = {}): SpeechInput {
  const { lang = "es-ES", onFinal } = options;

  // useSyncExternalStore en vez de estado + efecto: el soporte del navegador no
  // cambia en runtime, y setState dentro de un efecto dispara render en cascada.
  // En el servidor devuelve false, asi que no hay mismatch de hidratacion.
  const supported = useSyncExternalStore(
    () => () => {},
    () => getConstructor() !== null,
    () => false,
  );

  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalRef = useRef("");
  // En un ref para que cambiar el callback no reinicie el reconocimiento.
  // Se asigna en un efecto y no durante el render: escribir un ref mientras se
  // renderiza rompe con StrictMode y con render concurrente.
  const onFinalRef = useRef(onFinal);
  useEffect(() => {
    onFinalRef.current = onFinal;
  }, [onFinal]);

  useEffect(() => {
    const Ctor = getConstructor();
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript;
        if (result.isFinal) {
          finalRef.current += text;
        } else {
          interim += text;
        }
      }
      setTranscript(finalRef.current + interim);
    };

    recognition.onerror = (event) => {
      // "aborted" y "no-speech" son ruido normal al soltar el boton sin hablar.
      if (event.error !== "aborted" && event.error !== "no-speech") {
        setError(event.error);
      }
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
      const text = finalRef.current.trim();
      if (text) onFinalRef.current?.(text);
    };

    recognitionRef.current = recognition;
    return () => {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.abort();
      recognitionRef.current = null;
    };
  }, [lang]);

  const start = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition || listening) return;
    finalRef.current = "";
    setTranscript("");
    setError(null);
    try {
      recognition.start();
      setListening(true);
    } catch {
      // start() tira si ya estaba corriendo. No es un error para el usuario.
    }
  }, [listening]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  return { supported, listening, transcript, error, start, stop };
}
