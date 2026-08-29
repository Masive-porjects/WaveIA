"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Send, Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { speak } from "@/lib/voice/speak";
import { useSpeechInput } from "@/lib/voice/useSpeechInput";

import MicButton from "./MicButton";
import PresetCards, { type Recommendation } from "./PresetCards";
import TrackBadge from "./TrackBadge";

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

/**
 * Los nueve ejes del IntentProfile.
 *
 * No se muestran en la UI: el usuario elige un preset, no ajusta ejes. Pero el
 * perfil se sigue enviando y recibiendo porque es el contrato con el mapper de
 * DSP, que traduce estos numeros a los parametros reales del motor.
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

/** Subconjunto del analisis de AudioMind que le sirve al agente. */
export interface TrackAnalysis {
  integrated_lufs?: number;
  dynamic_range_db?: number;
  tempo_bpm?: number;
  duration_seconds?: number;
  detected_genre?: string;
  is_already_mastered?: boolean;
}

export interface ChatPanelProps {
  /** Perfil vigente. Si no se pasa, el panel arranca en neutral. */
  profile?: Profile;
  /** Se dispara cada vez que el agente propone un perfil nuevo. */
  onProfileChange?: (profile: Profile) => void;
  /** Se dispara cuando el usuario elige uno de los presets sugeridos. */
  onPresetSelect?: (presetId: string) => void;
  /** Analisis del track. Con esto el agente calibra cuanto mover cada eje. */
  analysis?: TrackAnalysis;
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
  analysis,
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


  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy]);

  // La bienvenida se dice en voz alta una sola vez. El guard es necesario
  // porque el texto cambia cuando llega el analisis con el genero, y sin el
  // se repetiria el saludo.
  const welcomeSpokenRef = useRef(false);
  useEffect(() => {
    if (!voiceOutput || !welcome || welcomeSpokenRef.current) return;
    welcomeSpokenRef.current = true;
    setSpeaking(true);
    void speak(welcome).finally(() => setSpeaking(false));
  }, [welcome, voiceOutput]);

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
            analysis,
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
    [busy, turns, profile, analysis, voiceOutput, controlledProfile, onProfileChange],
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

      <header className="relative flex items-center justify-between px-6 pt-5 pb-2">
        <TrackBadge
          genre={analysis?.detected_genre}
          tempoBpm={analysis?.tempo_bpm}
          durationSeconds={analysis?.duration_seconds}
        />
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

      <div ref={scrollRef} className="relative flex-1 overflow-y-auto px-6">
        {turns.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.25, 0.1, 0.25, 1] }}
            className="flex flex-col items-center py-6 text-center"
          >
            <h2
              className="text-2xl font-medium tracking-tight"
              style={{ color: "var(--text-primary)", letterSpacing: "-0.03em" }}
            >
              ¿Cómo querés que <span className="serif-accent">suene</span>?
            </h2>
            {welcome && (
              <p
                className="mt-2 max-w-sm text-sm leading-relaxed"
                style={{ color: "var(--text-secondary)" }}
              >
                {welcome}
              </p>
            )}
          </motion.div>
        )}

        {turns.length === 0 && (
          <div className="flex flex-wrap justify-center gap-2 pb-2">
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

      <div className="relative border-t px-6 py-4" style={{ borderColor: "var(--border-subtle)" }}>

        <MicButton
          supported={mic.supported}
          listening={mic.listening}
          disabled={busy}
          transcript={mic.transcript}
          onToggle={mic.toggle}
          onCancel={mic.cancel}
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
