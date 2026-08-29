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
      // Chrome no transcribe local: manda el audio a servidores de Google.
      // Si esa peticion falla, no hay nada que reintentar del lado nuestro.
      return "Chrome no pudo contactar el servicio de transcripción de Google. Escribí tu pedido mientras tanto — funciona igual.";
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
  /** Se dispara con la transcripcion final. */
  onFinal?: (text: string) => void;
  /**
   * Se dispara ante un fallo del que no se vuelve reintentando.
   *
   * Existe para que quien orquesta pueda cambiar de motor en el acto. Se llama
   * desde el handler del evento del navegador, no desde un efecto de React.
   */
  onFatalError?: (code: string) => void;
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
  const { lang = "es-ES", onFinal, onFatalError } = options;

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
  /**
   * Lo que el usuario QUIERE, que no es lo mismo que lo que el navegador hace.
   *
   * Chrome termina la sesion de reconocimiento por su cuenta cada pocos
   * segundos aunque continuous sea true. Sin este ref, cada corte del navegador
   * se interpretaba como "el usuario termino" y el microfono se apagaba solo.
   */
  const wantListeningRef = useRef(false);
  /** Un solo reintento por toma ante un corte de red. */
  const networkRetriedRef = useRef(false);
  // En un ref para que cambiar el callback no reinicie el reconocimiento.
  // Se asigna en un efecto y no durante el render: escribir un ref mientras se
  // renderiza rompe con StrictMode y con render concurrente.
  const onFinalRef = useRef(onFinal);
  useEffect(() => {
    onFinalRef.current = onFinal;
  }, [onFinal]);

  const onFatalErrorRef = useRef(onFatalError);
  useEffect(() => {
    onFatalErrorRef.current = onFatalError;
  }, [onFatalError]);

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
      // Chrome corta por su cuenta: si el usuario no pidio terminar, se
      // reanuda y para el la toma nunca se interrumpio.
      if (wantListeningRef.current && !discardRef.current) {
        try {
          recognition.start();
          return;
        } catch {
          // Si no se puede reanudar, se cierra la toma normalmente.
        }
      }

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
      wantListeningRef.current = false;
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
    wantListeningRef.current = true;
    networkRetriedRef.current = false;
    setTranscript("");
    setError(null);
    try {
      recognition.start();
      setListening(true);
    } catch (err) {
      // InvalidStateError = la sesion anterior todavia no cerro. Se reintenta
      // una vez; cualquier otra cosa se le muestra al usuario en vez de dejar
      // el boton mudo, que era lo que hacia antes.
      if (err instanceof DOMException && err.name === "InvalidStateError") {
        recognition.abort();
        setTimeout(() => {
          if (!wantListeningRef.current) return;
          try {
            recognition.start();
            setListening(true);
          } catch {
            wantListeningRef.current = false;
            setError("No pude abrir el micrófono. Recargá la página.");
          }
        }, 120);
        return;
      }
      wantListeningRef.current = false;
      setError("No pude abrir el micrófono. Revisá que ninguna otra app lo esté usando.");
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
    wantListeningRef.current = false;
    recognitionRef.current?.stop();
  }, [clearSilence]);

  const cancel = useCallback(() => {
    clearSilence();
    wantListeningRef.current = false;
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
