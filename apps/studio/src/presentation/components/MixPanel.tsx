"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  Download,
  Loader2,
  Music2,
  ShieldCheck,
} from "lucide-react";
import {
  getAudioUrl,
  getMixAudioUrl,
  mixTracks,
  type MixResult,
} from "@/lib/api";

interface MixPanelProps {
  sessionId: string | null;
  /** ``session.mix_path`` de una sesión recargada con mix ya generado. */
  sessionMixPath?: string | null;
  /** ``session.mix_analysis`` persistido (espejo del header X-Mix-Result). */
  sessionMixAnalysis?: MixResult | null;
  disabled?: boolean;
}

/** Etapas simuladas de progreso mientras corre el POST /mix (blocking). */
const MIX_STAGES = [
  "Separando stems...",
  "Mezclando kick...",
  "Mezclando bajo...",
  "Mezclando guitarra...",
  "Mezclando voces...",
  "Mezclando el bus...",
] as const;

// El backend no expone progreso real: cada etapa dura ~9 s mientras el fetch
// está en vuelo. El porcentaje NUNCA llega a 100 hasta que la promesa resuelve.
const STAGE_MS = 9_000;

/** Formatea segundos como mm:ss (o segundos con decimal si es corto). */
function formatDuration(seconds: number): string {
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }
  return `${seconds.toFixed(1)} s`;
}

/* ── Grilla de análisis ─────────────────────────────────
   Renderiza SOLO los campos presentes en el payload — nunca
   inventa datos que el backend no midió. */
function MixAnalysisGrid({ result }: { result: MixResult }) {
  const cells: { label: string; value: string }[] = [];

  if (typeof result.tempo_bpm === "number") {
    cells.push({ label: "BPM", value: String(Math.round(result.tempo_bpm)) });
  }
  if (typeof result.genre === "string" && result.genre && result.genre !== "other") {
    cells.push({ label: "Género", value: result.genre.replace("_", " ") });
  }
  if (typeof result.genre_confidence === "number") {
    cells.push({
      label: "Confianza",
      value: `${Math.round(result.genre_confidence * 100)}%`,
    });
  }
  if (typeof result.sample_rate === "number") {
    cells.push({ label: "Sample rate", value: `${result.sample_rate} Hz` });
  }
  if (typeof result.duration_seconds === "number") {
    cells.push({ label: "Duración", value: formatDuration(result.duration_seconds) });
  }

  const qc = result.qc_report as
    | { summary?: { all_ok?: boolean; flagged?: unknown[] } }
    | null
    | undefined;

  if (cells.length === 0 && !qc) return null;

  return (
    <div className="mt-3 pt-3 border-t border-[var(--border-subtle)]">
      <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest mb-2">
        Análisis de la mezcla
      </p>
      {cells.length > 0 && (
        <div className="grid grid-cols-3 gap-2 text-center">
          {cells.map((cell) => (
            <div key={cell.label} className="min-w-0">
              <p className="text-xs font-mono text-[var(--text-primary)] truncate">
                {cell.value}
              </p>
              <p className="text-[9px] text-[var(--text-muted)]">{cell.label}</p>
            </div>
          ))}
        </div>
      )}
      {qc && (
        <div
          className="mt-2 flex items-center gap-1.5 text-[10px]"
          style={{ color: qc.summary?.all_ok === false ? "#fbbf24" : "#30d158" }}
        >
          <ShieldCheck size={12} />
          QC: {qc.summary?.all_ok === false ? "revisar" : "ok"}
        </div>
      )}
    </div>
  );
}

export default function MixPanel({
  sessionId,
  sessionMixPath,
  sessionMixAnalysis,
  disabled,
}: MixPanelProps) {
  const [mixing, setMixing] = useState(false);
  const [mixUrl, setMixUrl] = useState<string | null>(null);
  const [mixResult, setMixResult] = useState<MixResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progressStage, setProgressStage] = useState(0);
  const [progressPct, setProgressPct] = useState(0);
  // Sesión restaurada con mix ya hecho → el resultado se muestra al abrir;
  // la pill permite ocultarlo/mostrarlo.
  const [showResult, setShowResult] = useState(() => Boolean(sessionMixPath));
  const objectUrlRef = useRef<string | null>(null);
  const stageRef = useRef(0);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Revoca el objectURL local al desmontar (el player lo usa hasta ese
  // momento, por eso NO se revoca en el finally de handleMix) y limpia
  // el intervalo de progreso si el componente se desmonta a mitad del mix.
  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  // La sesión puede llegar con mix ya generado después del mount
  // (restauración asíncrona): mostrar el resultado en ese caso.
  useEffect(() => {
    if (sessionMixPath) setShowResult(true);
  }, [sessionMixPath]);

  const clearProgressTimer = useCallback(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  }, []);

  const handleMix = useCallback(async () => {
    if (!sessionId || mixing) return;
    setMixing(true);
    setError(null);
    // Re-mezcla: ocultar el resultado previo mientras procesa.
    setShowResult(false);
    stageRef.current = 0;
    setProgressStage(0);
    setProgressPct(0);

    // Progreso por etapas simuladas: el POST /mix del backend es una sola
    // request blocking que devuelve el WAV completo; la UI avanza por etapas
    // mientras el fetch está en vuelo. El 100% solo llega con la respuesta
    // real — nunca se marca done antes.
    progressIntervalRef.current = setInterval(() => {
      stageRef.current = Math.min(stageRef.current + 1, MIX_STAGES.length - 1);
      setProgressStage(stageRef.current);
      setProgressPct(
        Math.min(95, Math.round((stageRef.current / MIX_STAGES.length) * 100)),
      );
    }, STAGE_MS);

    try {
      const { audioUrl, result } = await mixTracks(sessionId);
      clearProgressTimer();
      objectUrlRef.current = audioUrl;
      setProgressPct(100);
      setMixUrl(audioUrl);
      setMixResult(result);
      setShowResult(true);
    } catch (e) {
      clearProgressTimer();
      setError(e instanceof Error ? e.message : "No se pudo mezclar el audio");
    } finally {
      setMixing(false);
    }
  }, [sessionId, mixing, clearProgressTimer]);

  if (!sessionId) {
    return (
      <p className="text-[var(--text-muted)] text-sm">
        Carga un audio para usar la Mezcla de Audio.
      </p>
    );
  }

  // Sesión recargada con mix ya hecho: el player usa la URL estable del
  // backend (nunca se re-mezcla automáticamente).
  const hasMixed = Boolean(mixUrl || sessionMixPath);
  const audioSrc = mixUrl ?? (sessionMixPath ? getMixAudioUrl(sessionId) : null);
  const analysis = mixResult ?? sessionMixAnalysis ?? null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2
            className="text-lg font-semibold text-[var(--text-primary)]"
            style={{ letterSpacing: "-0.02em" }}
          >
            Mezcla de <span className="serif-accent">Audio</span>
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Separa, ecualiza y mezcla tus stems en un bus unificado
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Pill de estado: deshabilitado sin mix; con mix muestra/oculta
              el panel de resultado. Nunca muestra nada mientras procesa. */}
          <button
            onClick={() => setShowResult((v) => !v)}
            disabled={!hasMixed || mixing}
            aria-pressed={hasMixed && showResult}
            title={
              hasMixed
                ? "Mostrar u ocultar el resultado de la mezcla"
                : "Todavía no hay una mezcla"
            }
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold
              transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed
              hover:brightness-110"
            style={{
              background: hasMixed
                ? "rgba(48, 209, 88, 0.12)"
                : "var(--surface-hover)",
              border: `1px solid ${
                hasMixed ? "rgba(48, 209, 88, 0.2)" : "var(--border-subtle)"
              }`,
              color: hasMixed ? "#30d158" : "var(--text-muted)",
            }}
          >
            <CheckCircle2 size={13} />
            Audio mezclado
          </button>

          <button
            onClick={handleMix}
            disabled={disabled || mixing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110"
            style={{
              background: hasMixed
                ? "rgba(48, 209, 88, 0.12)"
                : "linear-gradient(135deg, rgba(94,92,230,0.15), rgba(94,92,230,0.06))",
              border: `1px solid ${
                hasMixed ? "rgba(48, 209, 88, 0.2)" : "rgba(94,92,230,0.2)"
              }`,
              color: hasMixed ? "#30d158" : "#5e5ce6",
            }}
          >
            {mixing ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Procesando mezcla...
              </>
            ) : hasMixed ? (
              <>
                <CheckCircle2 size={16} /> Mezcla lista
              </>
            ) : (
              <>
                <Music2 size={16} /> Mezclar Audio
              </>
            )}
          </button>
        </div>
      </div>

      {/* Barra de progreso por etapas — solo mientras corre el /mix */}
      {mixing && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-[var(--text-secondary)]">
              {MIX_STAGES[progressStage]}
            </span>
            <span className="text-xs font-mono text-[var(--text-muted)]">
              {progressPct}%
            </span>
          </div>
          <div
            className="w-full h-1.5 rounded-full overflow-hidden"
            style={{ background: "var(--surface-hover)" }}
          >
            <motion.div
              className="h-full rounded-full"
              style={{
                background: "linear-gradient(135deg, #5e5ce6, #30d158)",
              }}
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          </div>
        </motion.div>
      )}

      {/* Error banner */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div
            className="p-3 rounded-xl text-xs"
            style={{
              background: "rgba(220, 38, 38, 0.08)",
              border: "1px solid rgba(220, 38, 38, 0.2)",
              color: "var(--accent-error)",
            }}
          >
            {error}
          </div>
        </motion.div>
      )}

      {/* Resultado: comparación original vs mezcla + descarga + análisis.
          Solo con mix real (nunca mientras procesa) y cuando la pill
          "Audio mezclado" lo tiene visible. */}
      {hasMixed && audioSrc && !mixing && showResult && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="p-4 rounded-2xl"
          style={{
            background: "var(--bg-glass)",
            border: "1px solid var(--border-subtle)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
          }}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <p className="mb-1.5 text-[10px] text-[var(--text-muted)] uppercase tracking-widest">
                Original
              </p>
              <audio
                controls
                src={getAudioUrl(sessionId, "original")}
                className="w-full"
                preload="metadata"
              />
            </div>
            <div>
              <p className="mb-1.5 text-[10px] text-[#30d158] uppercase tracking-widest">
                Audio mezclado
              </p>
              <audio
                controls
                src={audioSrc}
                className="w-full"
                preload="metadata"
              />
            </div>
          </div>

          <div className="flex items-center justify-between mt-3 gap-2 flex-wrap">
            <span className="text-xs text-[var(--text-secondary)]">
              Mezcla generada: escucha el resultado o descarga el WAV
            </span>
            <a
              href={audioSrc}
              download={`${sessionId}_mix.wav`}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                text-[var(--text-secondary)] hover:text-[var(--text-primary)]
                bg-[var(--surface-hover)] hover:bg-[var(--surface-active)]
                transition-all border border-[var(--border-subtle)]"
            >
              <Download size={13} /> Descargar WAV
            </a>
          </div>

          {analysis && <MixAnalysisGrid result={analysis} />}
        </motion.div>
      )}

      {/* Hint inicial */}
      {!hasMixed && !mixing && (
        <p className="text-xs text-[var(--text-muted)] text-center pt-2">
          La mezcla separa el audio en stems por rol, aplica ecualización
          por banda de frecuencia y los junta en un bus estéreo unificado.
        </p>
      )}
    </div>
  );
}