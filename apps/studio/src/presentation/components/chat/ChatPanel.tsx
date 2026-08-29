"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Send, Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { speak } from "@/lib/voice/speak";
import { useSpeechInput } from "@/lib/voice/useSpeechInput";

import IntentBars, { AXES } from "./IntentBars";
import MicButton from "./MicButton";
import PresetCards, { type Recommendation } from "./PresetCards";

/**
 * Panel de conversación con el agente de mastering.
 *
 * El agente traduce lenguaje natural a un IntentProfile; este panel solo lo
 * muestra y lo devuelve hacia arriba. No toca parámetros de audio ni sabe qué
 * modelo hay detrás: esa separación es lo que deja cambiar de proveedor o de
 * mapper sin rehacer la UI.
 */

export type Profile = Record<string, number | string>;

interface Turn {
  role: "user" | "assistant";
  content: string;
  /** Ejes movidos por este turno, para resaltarlos junto a la respuesta. */
  changed?: string[];
}

export const NEUTRAL_PROFILE: Profile = {
  ...Object.fromEntries(AXES.map((a) => [a, 0.5])),
  target_platform: "none",
  reference_genre: "",
  notes: "",
};

const SUGERENCIAS = [
  "Que suene más cálida",
  "Más pegada en los graves",
  "Quiero la voz al frente",
  "Que pegue en el club",
];

export interface ChatPanelProps {
  /** Perfil vigente. Si no se pasa, el panel arranca en neutral. */
  profile?: Profile;
  /** Se dispara cada vez que el agente propone un perfil nuevo. */
  onProfileChange?: (profile: Profile) => void;
  /** Se dispara cuando el usuario elige uno de los presets sugeridos. */
  onPresetSelect?: (presetId: string) => void;
  /** Lee las respuestas en voz alta. */
  voiceOutput?: boolean;
  /**
   * Saludo inicial del agente. Se muestra como un turno suyo pero NO se manda
   * al modelo: `contents` tiene que empezar con un turno de usuario, y ademas
   * no hay nada que interpretar en un saludo.
   */
  welcome?: string;
}

export default function ChatPanel({
  profile: controlledProfile,
  onProfileChange,
  onPresetSelect,
  voiceOutput = true,
  welcome,
}: ChatPanelProps) {
  const [internalProfile, setInternalProfile] = useState<Profile>(NEUTRAL_PROFILE);
  const profile = controlledProfile ?? internalProfile;

  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [trackType, setTrackType] = useState<string>("unknown");
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const lastChanged = turns.at(-1)?.changed ?? [];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy]);

  const send = useCallback(
    async (text: string) => {
      const clean = text.trim();
      if (!clean || busy) return;

      setBusy(true);
      setError(null);
      setDraft("");

      const history: Turn[] = [...turns, { role: "user", content: clean }];
      setTurns(history);

      try {
        const res = await fetch("/voz/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: history.map(({ role, content }) => ({ role, content })),
            profile,
            voiceMode: voiceOutput,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

        const changed: string[] = (data.changes ?? []).map((c: { axis: string }) => c.axis);
        setTurns([...history, { role: "assistant", content: data.reply, changed }]);
        setRecommendations(data.recommendations ?? []);
        setTrackType(data.trackType ?? "unknown");

        if (controlledProfile === undefined) setInternalProfile(data.profile);
        onProfileChange?.(data.profile);

        if (voiceOutput) {
          setSpeaking(true);
          await speak(data.reply);
          setSpeaking(false);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [busy, turns, profile, voiceOutput, controlledProfile, onProfileChange],
  );

  const mic = useSpeechInput({ onFinal: send });

  return (
    <section
      className="relative flex h-full flex-col overflow-hidden rounded-2xl border backdrop-blur-xl"
      style={{ background: "var(--bg-glass)", borderColor: "var(--border-subtle)" }}
      aria-label="Conversación con el agente de mastering"
    >
      {/* Receta de vidrio: rim-light de 1 px y sheen superior. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background: "linear-gradient(to right, transparent, rgba(255,255,255,0.3), transparent)",
        }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-16"
        style={{ background: "linear-gradient(to bottom, rgba(255,255,255,0.07), transparent)" }}
      />

      <header className="relative flex items-center justify-between px-5 pt-5 pb-3">
        <div>
          <h2
            className="text-base font-medium tracking-tight"
            style={{ color: "var(--text-primary)" }}
          >
            Contame cómo querés que suene
          </h2>
          <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
            Hablá o escribí. Yo traduzco.
          </p>
        </div>
        {speaking && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-1.5 text-xs"
            style={{ color: "var(--accent-secondary)" }}
          >
            <Volume2 size={14} strokeWidth={1.75} />
            hablando
          </motion.span>
        )}
      </header>

      <div ref={scrollRef} className="relative flex-1 overflow-y-auto px-5">
        {welcome && turns.length === 0 && (
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.25, 0.1, 0.25, 1] }}
            className="py-2 text-sm leading-relaxed"
            style={{ color: "var(--text-primary)" }}
          >
            {welcome}
          </motion.p>
        )}

        {turns.length === 0 && (
          <div className="flex flex-wrap gap-2 py-2">
            {SUGERENCIAS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => send(s)}
                disabled={busy}
                className="rounded-full border px-3 py-1.5 text-xs transition-colors duration-300
                  hover:border-[var(--border-hover)] disabled:opacity-40"
                style={{
                  background: "var(--surface-hover)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-secondary)",
                }}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-3 py-2">
          <AnimatePresence initial={false}>
            {turns.map((turn, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
                className={turn.role === "user" ? "self-end max-w-[85%]" : "max-w-[92%]"}
              >
                <div
                  className="rounded-xl px-3.5 py-2.5 text-sm leading-relaxed"
                  style={
                    turn.role === "user"
                      ? { background: "var(--surface-active)", color: "var(--text-primary)" }
                      : { background: "transparent", color: "var(--text-primary)" }
                  }
                >
                  {turn.content}
                </div>
                {turn.changed && turn.changed.length > 0 && (
                  <p className="mt-1 px-3.5 text-xs" style={{ color: "var(--accent-secondary)" }}>
                    ajusté {turn.changed.length === 1 ? "1 parámetro" : `${turn.changed.length} parámetros`}
                  </p>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {recommendations.length > 0 && !busy && (
            <div className="pt-1">
              <p
                className="mb-2 text-xs tracking-tight"
                style={{ color: "var(--text-muted)" }}
              >
                Elegí por dónde arrancar
                {trackType !== "unknown" && ` · ${trackType === "vocal" ? "con voz" : "instrumental"}`}
              </p>
              <PresetCards
                recommendations={recommendations}
                selected={selectedPreset}
                onSelect={(id) => {
                  setSelectedPreset(id);
                  onPresetSelect?.(id);
                }}
              />
            </div>
          )}

          {busy && (
            <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
              <Loader2 size={13} className="animate-spin" />
              interpretando…
            </div>
          )}
          {error && (
            <p
              className="rounded-lg px-3 py-2 text-xs"
              style={{ background: "var(--surface-hover)", color: "var(--accent-error)" }}
            >
              {error}
            </p>
          )}
        </div>
      </div>

      {mic.transcript && (
        <p className="relative px-5 pb-1 text-xs italic" style={{ color: "var(--text-muted)" }}>
          {mic.transcript}
        </p>
      )}

      <div className="relative border-t px-5 py-4" style={{ borderColor: "var(--border-subtle)" }}>
        <div className="mb-3">
          <IntentBars profile={profile} changed={lastChanged} />
        </div>

        <MicButton
          supported={mic.supported}
          listening={mic.listening}
          disabled={busy}
          onStart={mic.start}
          onStop={mic.stop}
        />

        <form
          className="mt-2.5 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(draft);
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={busy}
            placeholder="…o escribilo acá"
            className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm outline-none
              transition-colors duration-300 focus:border-[var(--accent-primary)]
              disabled:opacity-40"
            style={{
              background: "var(--surface-hover)",
              borderColor: "var(--border-subtle)",
              color: "var(--text-primary)",
            }}
          />
          <button
            type="submit"
            disabled={busy || !draft.trim()}
            aria-label="Enviar"
            className="flex w-11 items-center justify-center rounded-lg border transition-colors
              duration-300 hover:border-[var(--border-hover)] disabled:opacity-30"
            style={{
              background: "var(--surface-hover)",
              borderColor: "var(--border-subtle)",
              color: "var(--text-secondary)",
            }}
          >
            <Send size={15} strokeWidth={1.75} />
          </button>
        </form>
      </div>
    </section>
  );
}
