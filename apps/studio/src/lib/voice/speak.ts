"use client";

import { BASE_PATH } from "@/lib/basePath";

/**
 * Reproduce una respuesta del agente en voz alta.
 *
 * Pide el audio a /voz/speak. Si el servidor responde 204, la sintesis de pago
 * esta apagada y usamos la voz del navegador, que es gratis. Ese 204 es lo que
 * hace que desarrollar no cueste creditos.
 */

export type SpeakSource = "elevenlabs" | "browser" | "none";

export interface SpeakResult {
  source: SpeakSource;
  /** true si ElevenLabs sirvio el audio desde su cache en disco. */
  cached: boolean;
}

/** Lo que esta sonando ahora, para poder cortarlo al abrir el microfono. */
let current: HTMLAudioElement | null = null;

/**
 * Corta la voz del agente.
 *
 * Se llama al abrir el microfono: si el agente sigue hablando, el microfono lo
 * graba a el y transcribe su propia respuesta.
 */
export function stopSpeaking(): void {
  if (current) {
    current.pause();
    current = null;
  }
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

/** Voz en espanol del navegador, la primera que aparezca. */
function pickSpanishVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  return voices.find((v) => v.lang.toLowerCase().startsWith("es"));
}

function speakWithBrowser(text: string): Promise<SpeakResult> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      resolve({ source: "none", cached: false });
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "es-ES";
    const voice = pickSpanishVoice();
    if (voice) utterance.voice = voice;
    utterance.onend = () => resolve({ source: "browser", cached: false });
    utterance.onerror = () => resolve({ source: "none", cached: false });
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  });
}

function playAudio(blob: Blob, cached: boolean): Promise<SpeakResult> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    current = audio;
    const done = (source: SpeakSource) => {
      URL.revokeObjectURL(url);
      if (current === audio) current = null;
      resolve({ source, cached });
    };
    audio.onpause = () => done("elevenlabs");
    audio.onended = () => done("elevenlabs");
    audio.onerror = () => done("none");
    void audio.play().catch(() => done("none"));
  });
}

/**
 * Habla el texto y resuelve cuando termina.
 *
 * El caller es responsable de bajar el volumen del master mientras esto corre:
 * la voz del agente pisa la cancion si no se hace.
 */
export async function speak(text: string): Promise<SpeakResult> {
  if (!text.trim()) return { source: "none", cached: false };

  let response: Response;
  try {
    response = await fetch(`${BASE_PATH}/voz/speak`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch {
    return speakWithBrowser(text);
  }

  // 204 = sintesis de pago apagada. Cualquier fallo tampoco debe dejar mudo al
  // agente: la voz del navegador es el fallback en los dos casos.
  if (response.status === 204 || !response.ok) {
    return speakWithBrowser(text);
  }

  const cached = response.headers.get("X-TTS-Cache") === "hit";
  return playAudio(await response.blob(), cached);
}
