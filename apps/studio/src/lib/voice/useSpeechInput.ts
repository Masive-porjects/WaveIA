"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Reconocimiento de voz con la Web Speech API del navegador.
 *
 * Es nativa y gratis: cero creditos de ElevenLabs para la entrada. Los creditos
 * se reservan para la salida, que es donde la calidad de voz se nota.
 *
 * Funciona por toque, no manteniendo apretado: mantener se corta al mover el
 * mouse fuera del boton, cansa, y en movil pelea con el scroll. Se toca para
 * empezar y se corta solo tras un silencio, o se toca de nuevo para enviar.
 *
 * Anda en Chrome, Edge y Safari. Firefox no la implementa.
 */

/** Silencio tras el cual se corta y se envia solo. */
const SILENCE_MS = 1800;

/** Mensajes accionables: los codigos crudos de la API no le dicen nada a nadie. */
function errorMessage(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Necesito permiso para usar el micrófono. Habilitalo en el candado de la barra de direcciones.";
    case "audio-capture":
      return "No encontré ningún micrófono conectado.";
    case "network":
      return "Se cortó la conexión con el servicio de transcripción.";
    default:
      return "No pude escucharte. Probá de nuevo.";
  }
}

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
  /** Empieza a escuchar. */
  start: () => void;
  /** Corta y envia lo que haya. */
  stop: () => void;
  /** Corta y descarta. */
  cancel: () => void;
  /** Alterna entre empezar y enviar. Es lo que usa el boton. */
  toggle: () => void;
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
  const silenceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Distingue "el usuario corto" de "descarto": onend no sabe por que paso.
  const discardRef = useRef(false);
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
    // continuous: las pausas naturales al hablar no tienen que cortar la toma.
    // El corte lo decide el temporizador de silencio, no el navegador.
    recognition.continuous = true;
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

      // Cada palabra reinicia la cuenta: el corte llega tras el silencio real.
      if (silenceRef.current) clearTimeout(silenceRef.current);
      silenceRef.current = setTimeout(() => {
        recognitionRef.current?.stop();
      }, SILENCE_MS);
    };

    recognition.onerror = (event) => {
      // "aborted" y "no-speech" son ruido normal al soltar el boton sin hablar.
      if (event.error !== "aborted" && event.error !== "no-speech") {
        setError(errorMessage(event.error));
      }
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
      if (silenceRef.current) {
        clearTimeout(silenceRef.current);
        silenceRef.current = null;
      }
      const text = finalRef.current.trim();
      if (!discardRef.current && text) onFinalRef.current?.(text);
      discardRef.current = false;
    };

    recognitionRef.current = recognition;
    return () => {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.abort();
      recognitionRef.current = null;
      if (silenceRef.current) clearTimeout(silenceRef.current);
    };
  }, [lang]);

  const start = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition || listening) return;
    finalRef.current = "";
    discardRef.current = false;
    setTranscript("");
    setError(null);
    try {
      recognition.start();
      setListening(true);
    } catch {
      // start() tira si ya estaba corriendo. No es un error para el usuario.
    }
  }, [listening]);

  const clearSilence = useCallback(() => {
    if (silenceRef.current) {
      clearTimeout(silenceRef.current);
      silenceRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    clearSilence();
    recognitionRef.current?.stop();
  }, [clearSilence]);

  const cancel = useCallback(() => {
    clearSilence();
    discardRef.current = true;
    finalRef.current = "";
    setTranscript("");
    recognitionRef.current?.abort();
    setListening(false);
  }, [clearSilence]);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  return { supported, listening, transcript, error, start, stop, cancel, toggle };
}
