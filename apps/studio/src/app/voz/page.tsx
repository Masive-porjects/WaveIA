"use client";

import { useCallback, useState } from "react";

import { speak, type SpeakSource } from "@/lib/voice/speak";
import { useSpeechInput } from "@/lib/voice/useSpeechInput";

/**
 * Banco de pruebas del ciclo de voz. No es la UI final: el diseno lo define
 * Andres. Esto existe para verificar la cadena completa de punta a punta.
 *
 *   hablar -> Web Speech API -> interpretIntent -> reply -> voz
 */

const AXES = [
  "warmth",
  "punch",
  "clarity",
  "brightness",
  "width",
  "bass_weight",
  "vocal_focus",
  "vintage",
  "loudness",
] as const;

type Profile = Record<string, number | string>;

interface Change {
  axis: string;
  from: number;
  to: number;
  delta: number;
}

interface Turn {
  role: "user" | "assistant";
  content: string;
}

const NEUTRAL: Profile = {
  ...Object.fromEntries(AXES.map((a) => [a, 0.5])),
  target_platform: "none",
  reference_genre: "",
  notes: "",
};

export default function VozPage() {
  const [history, setHistory] = useState<Turn[]>([]);
  const [profile, setProfile] = useState<Profile>(NEUTRAL);
  const [changes, setChanges] = useState<Change[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voiceSource, setVoiceSource] = useState<SpeakSource | null>(null);
  const [cacheHit, setCacheHit] = useState(false);

  const send = useCallback(
    async (text: string) => {
      setBusy(true);
      setError(null);
      const nextHistory: Turn[] = [...history, { role: "user", content: text }];
      setHistory(nextHistory);

      try {
        const res = await fetch("/voz/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: nextHistory, profile, voiceMode: true }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

        setHistory([...nextHistory, { role: "assistant", content: data.reply }]);
        setProfile(data.profile);
        setChanges(data.changes ?? []);

        const spoken = await speak(data.reply);
        setVoiceSource(spoken.source);
        setCacheHit(spoken.cached);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [history, profile],
  );

  const mic = useSpeechInput({ onFinal: send });

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-8 font-sans">
      <header>
        <h1 className="text-2xl font-semibold">Prueba de voz</h1>
        <p className="text-sm opacity-70">
          Mantené apretado el botón y decí cómo querés que suene tu canción.
        </p>
      </header>

      {!mic.supported && (
        <p className="rounded border border-red-500/40 bg-red-500/10 p-3 text-sm">
          Este navegador no implementa la Web Speech API. Usá Chrome, Edge o Safari — Firefox no
          la soporta.
        </p>
      )}

      <button
        type="button"
        disabled={!mic.supported || busy}
        onPointerDown={mic.start}
        onPointerUp={mic.stop}
        onPointerLeave={mic.stop}
        className={`select-none rounded-xl px-6 py-8 text-lg font-medium transition-colors disabled:opacity-40 ${
          mic.listening ? "bg-red-500 text-white" : "bg-neutral-800 text-neutral-100"
        }`}
      >
        {mic.listening ? "Escuchando… soltá para enviar" : "Mantené apretado para hablar"}
      </button>

      {mic.transcript && (
        <p className="text-sm">
          <span className="opacity-50">Escuché: </span>
          {mic.transcript}
        </p>
      )}
      {mic.error && <p className="text-sm text-red-500">Micrófono: {mic.error}</p>}
      {busy && <p className="text-sm opacity-70">Interpretando…</p>}
      {error && <p className="text-sm text-red-500">{error}</p>}

      {history.length > 0 && (
        <section className="flex flex-col gap-2">
          {history.map((turn, i) => (
            <p key={i} className={turn.role === "user" ? "opacity-60" : "font-medium"}>
              <span className="opacity-50">{turn.role === "user" ? "vos: " : "agente: "}</span>
              {turn.content}
            </p>
          ))}
          {voiceSource && (
            <p className="text-xs opacity-50">
              voz: {voiceSource}
              {voiceSource === "elevenlabs" && (cacheHit ? " (cache, 0 créditos)" : " (sintetizada)")}
            </p>
          )}
        </section>
      )}

      <section className="flex flex-col gap-1 font-mono text-xs">
        {AXES.map((axis) => {
          const value = Number(profile[axis] ?? 0.5);
          const moved = changes.some((c) => c.axis === axis);
          return (
            <div key={axis} className="flex items-center gap-2">
              <span className="w-24 opacity-70">{axis}</span>
              <span className="h-2 flex-1 overflow-hidden rounded bg-neutral-700">
                <span
                  className={`block h-full ${moved ? "bg-amber-400" : "bg-neutral-400"}`}
                  style={{ width: `${value * 100}%` }}
                />
              </span>
              <span className="w-10 text-right">{value.toFixed(2)}</span>
            </div>
          );
        })}
      </section>
    </main>
  );
}
