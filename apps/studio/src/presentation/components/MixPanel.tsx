"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2,
  Download,
  Info,
  Loader2,
  Music2,
  Music4,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import {
  getAudioUrl,
  getMixAudioUrl,
  mixTracks,
  type MixResult,
} from "@/lib/api";
import MixWaveformAB from "@/presentation/components/MixWaveformAB";
import MixFloatingChips from "@/presentation/components/MixFloatingChips";
import {
  MIX_CHAIN_STAGES,
  MIX_LANG_STORAGE_KEY,
  STEM_CHIP_LABELS,
  STEM_ROLE_IDS,
  readMixLang,
  type MixChip,
  type MixLang,
} from "@/presentation/components/mixI18n";

/* ── Módulo: tokens semánticos de globals.css (dark por defecto,
   light con html[data-theme="light"]). Los acentos de marca (verde
   #00d4aa/#10b981, rojo de error, gradiente del ring) quedan fijos:
   funcionan en ambos temas. ──────────────────────────────── */

const CARD_STYLE: React.CSSProperties = {
  // position: relative ancla el overlay de chips flotantes (v5).
  position: "relative",
  background: "var(--bg-elevated)",
  border: "1px solid var(--border)",
  borderRadius: "1rem",
  boxShadow: "0 4px 24px rgba(15, 23, 42, 0.06)",
};

interface MixPanelProps {
  sessionId: string | null;
  /** ``session.mix_path`` de una sesión recargada con mix ya generado. */
  sessionMixPath?: string | null;
  /** ``session.mix_analysis`` persistido (espejo del header X-Mix-Result). */
  sessionMixAnalysis?: MixResult | null;
  /** Duración del audio original en segundos (``session.analysis``). */
  audioDurationSeconds?: number | null;
  disabled?: boolean;
  /** ``session.analysis.detected_genre`` — alimenta el mini-panel IA. */
  genreHint?: string | null;
  /** Modo global Manual/Asistente IA (switch del navbar). Gobierna el
   *  mini-panel de recomendaciones IA del módulo. */
  mode: "manual" | "ai";
  /** Acción "Masterizar": carga la vista de mastering (tab "modules")
   *  para continuar el proceso. Habilitado solo con mix terminado. */
  onMasterize?: () => void;
}

/**
 * Etapas/chips del progreso mientras corre el POST /mix (blocking).
 * v5 — honestidad: la cadena DSP (``MIX_CHAIN_STAGES``) es SIEMPRE cierta
 * (existe en ``mix_engine.build_mix``); los stems solo aparecen cuando el
 * backend los reporta como presentes (``stem_presence``, RMS ≥ −50 dBFS).
 * El timing de cuándo se muestra cada chip es simulado por el ticker de
 * `stageMsForDuration` (igual que la barra: cap 95 %, 100 % solo con la
 * respuesta real). NUNCA se muestra "Guitarra": demucs no la detecta
 * (vive en "other").
 */

/** Pill ES/EN de los chips flotantes (diccionario local, mixI18n.ts).
 *  El resto del microcopy del módulo sigue en español neutro latino. */
function LangToggle({
  lang,
  onLang,
}: {
  lang: MixLang;
  onLang: (next: MixLang) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Idioma de los chips"
      className="flex items-center rounded-full border px-1 py-0.5 text-[10px] font-bold uppercase tracking-wide"
      style={{ borderColor: "var(--border-subtle)" }}
    >
      {(["es", "en"] as const).map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onLang(opt)}
          aria-pressed={lang === opt}
          className="rounded-full px-2 py-0.5 transition-all duration-200"
          style={{
            color:
              lang === opt ? "var(--text-primary)" : "var(--text-muted)",
            background:
              lang === opt ? "var(--surface-active)" : "transparent",
          }}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

/**
 * Tiempo por etapa según la duración del audio. El backend es una sola
 * request blocking (sin progreso real), así que la UI camina por etapas
 * mientras el fetch está en vuelo:
 *   - ~1 min de audio  → ~7 s por etapa (≈42 s de recorrido) — pruebas
 *     locales rápidas.
 *   - ~3 min de audio  → ~15 s por etapa (≈90 s de recorrido) — cuando la
 *     infraestructura lo admita.
 * Interpola linealmente entre 60 s y 180 s y clampa fuera de ese rango.
 * El porcentaje NUNCA llega a 100 hasta que la promesa resuelve.
 */
function stageMsForDuration(audioDurationSeconds?: number | null): number {
  const clamped = Math.min(Math.max(audioDurationSeconds ?? 60, 60), 180);
  const t = (clamped - 60) / 120; // 0 (1 min) → 1 (3 min)
  return Math.round(7000 + t * 8000); // 7 s → 15 s
}

/** Formatea segundos como mm:ss (o segundos con decimal si es corto). */
function formatDuration(seconds: number): string {
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }
  return `${seconds.toFixed(1)} s`;
}

/* ── Grilla de análisis (tokens semánticos) ──────────────
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
    <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--border-subtle)" }}>
      <p
        className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.16em]"
        style={{ color: "var(--text-secondary)" }}
      >
        Análisis de la mezcla
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {cells.map((cell) => (
          <div
            key={cell.label}
            className="min-w-0 rounded-xl px-3 py-2.5 text-center"
            style={{
              background: "var(--surface-hover)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <p
              className="truncate font-mono text-sm font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              {cell.value}
            </p>
            <p
              className="mt-0.5 text-[9px] uppercase tracking-wider"
              style={{ color: "var(--text-muted)" }}
            >
              {cell.label}
            </p>
          </div>
        ))}
        {qc && (
          <div
            className="flex min-w-0 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold"
            style={{
              background: "var(--surface-hover)",
              border: "1px solid var(--border-subtle)",
              color: qc.summary?.all_ok === false ? "#b45309" : "#10b981",
            }}
            title={
              qc.summary?.all_ok === false &&
              Array.isArray(qc.summary.flagged) &&
              qc.summary.flagged.length > 0
                ? `Checks marcados: ${qc.summary.flagged.join(", ")}`
                : undefined
            }
          >
            <ShieldCheck size={13} />
            QC: {qc.summary?.all_ok === false ? "revisar" : "ok"}
          </div>
        )}
      </div>
    </div>
  );
}

export default function MixPanel({
  sessionId,
  sessionMixPath,
  sessionMixAnalysis,
  audioDurationSeconds,
  disabled,
  genreHint,
  mode,
  onMasterize,
}: MixPanelProps) {
  const [mixing, setMixing] = useState(false);
  const [mixUrl, setMixUrl] = useState<string | null>(null);
  const [mixResult, setMixResult] = useState<MixResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const [progressStage, setProgressStage] = useState(0);
  const [progressPct, setProgressPct] = useState(0);
  // Sesión restaurada con mix ya hecho → el resultado se muestra al abrir;
  // la pill permite ocultarlo/mostrarlo.
  const [showResult, setShowResult] = useState(() => Boolean(sessionMixPath));
  // Idioma de los chips flotantes (solo chips — mixI18n.ts); persiste en
  // localStorage con guard try/catch (bloqueos de privacidad).
  const [lang, setLang] = useState<MixLang>(readMixLang);
  // v6 — dimensión espacial (Delay + Reverb): elección POR MEZCLA, no
  // persistida. ON por defecto (comportamiento actual); OFF = routing
  // Paso 03 (el backend omite dimension_report y el chip "dimension" no
  // aparece). Se deshabilita mientras corre el POST /mix.
  const [dimensionEnabled, setDimensionEnabled] = useState(true);

  const objectUrlRef = useRef<string | null>(null);
  const stageRef = useRef(0);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Lista dinámica de chips (etapas DSP + stems presentes) vista por el
  // ticker; se asigna en cada render para que el intervalo siempre use la
  // longitud actual sin re-crear el timer.
  const chipsRef = useRef<MixChip[]>([]);

  const changeLang = useCallback((next: MixLang) => {
    setLang(next);
    try {
      window.localStorage.setItem(MIX_LANG_STORAGE_KEY, next);
    } catch {
      // Almacenamiento bloqueado (modo privado estricto): el idioma
      // sigue vivo para esta sesión de página sin persistir.
    }
  }, []);

  // Revoca el objectURL local al desmontar (el player lo usa hasta ese
  // momento, por eso NO se revoca en el finally de handleMix), limpia el
  // intervalo si se desmonta a mitad del mix y aborta el fetch en vuelo.
  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      abortRef.current?.abort();
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
    // Re-mezcla: aborta un mix previo si quedó en vuelo.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setMixing(true);
    setError(null);
    setCancelled(false);
    // Re-mezcla: ocultar el resultado previo mientras procesa.
    setShowResult(false);
    stageRef.current = 0;
    setProgressStage(0);
    setProgressPct(0);

    // Progreso por etapas simuladas: el POST /mix del backend es una sola
    // request blocking que devuelve el WAV completo; la UI avanza por etapas
    // mientras el fetch está en vuelo (timing según la duración del audio:
    // ~1 min → etapas de 7 s; ~3 min → etapas de 15 s). El 100% solo llega
    // con la respuesta real — nunca se marca done antes.
    const stageMs = stageMsForDuration(audioDurationSeconds);
    progressIntervalRef.current = setInterval(() => {
      // Rota el ticker con la lista dinámica actual (etapas DSP siempre
      // presentes + stems reales cuando ya hay respuesta/persistido).
      const total = chipsRef.current.length || 1;
      stageRef.current = (stageRef.current + 1) % total;
      setProgressStage(stageRef.current);
      // El % es MONÓTONO creciente: el ticker rota en círculo para los
      // chips, pero el progreso jamás retrocede y nunca llega a 95/100
      // sin la respuesta real del backend.
      setProgressPct((prev) =>
        Math.min(
          95,
          Math.max(prev, Math.round((stageRef.current / total) * 100)),
        ),
      );
    }, stageMs);

    try {
      const { audioUrl, result } = await mixTracks(sessionId, {
        signal: controller.signal,
        dimensionEnabled,
      });
      clearProgressTimer();
      objectUrlRef.current = audioUrl;
      setProgressPct(100);
      setMixUrl(audioUrl);
      setMixResult(result);
      setShowResult(true);
    } catch (e) {
      clearProgressTimer();
      // Cancelación explícita del usuario: estado informativo, NO un fallo.
      // (El backend puede seguir procesando server-side; el cliente deja de
      // esperar y no marca done.)
      if ((e as { name?: string })?.name === "AbortError") {
        setCancelled(true);
      } else {
        setError(e instanceof Error ? e.message : "No se pudo mezclar el audio");
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setMixing(false);
    }
  }, [sessionId, mixing, audioDurationSeconds, clearProgressTimer, dimensionEnabled]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    // El catch del fetch hace el resto: limpia el timer, marca `cancelled`
    // y baja `mixing`.
  }, []);

  // Sesión recargada con mix ya hecho: el player usa la URL estable del
  // backend (nunca se re-mezcla automáticamente).
  const hasMixed = Boolean(mixUrl || sessionMixPath);
  const audioSrc = sessionId
    ? mixUrl ?? (sessionMixPath ? getMixAudioUrl(sessionId) : null)
    : null;
  const analysis = mixResult ?? sessionMixAnalysis ?? null;

  // Chips del progreso (v5 — instrumentos REALES): la cadena DSP siempre;
  // los stems SOLO si el backend los marcó presentes en ``stem_presence``.
  // Primer mix de una sesión sin datos → solo etapas DSP; al llegar la
  // respuesta (``mixResult``) o en sesión recargada (``sessionMixAnalysis``)
  // los stems presentes aparecen. Etiquetas ya traducidas (lang).
  // v6 — honestidad: con ``dimensionEnabled === false`` la etapa
  // "dimension" (Reverb + Delay) NO se aplica → su chip no aparece; el
  // resto de la cadena DSP sigue igual.
  const chips: MixChip[] = useMemo(() => {
    const present = analysis?.stem_presence;
    return [
      ...MIX_CHAIN_STAGES.filter(
        (stage) => dimensionEnabled || stage.id !== "dimension",
      ).map((stage) => ({
        id: stage.id,
        label: stage.label[lang],
        tone: "stage" as const,
      })),
      ...STEM_ROLE_IDS.filter((role) => present?.[role] === true).map(
        (role) => ({
          id: role,
          label: STEM_CHIP_LABELS[role][lang],
          tone: "stem" as const,
        }),
      ),
    ];
  }, [analysis, lang, dimensionEnabled]);
  chipsRef.current = chips;

  // Género real del análisis (chip + panel IA). "other" se normaliza a "Otro".
  const rawGenre =
    genreHint && genreHint !== "other"
      ? genreHint
      : analysis?.genre && analysis.genre !== "other"
        ? analysis.genre
        : null;
  const genreLabel = rawGenre ? rawGenre.replace("_", " ") : "Otro";

  // Recomendaciones del modo IA — SOLO datos reales ya disponibles
  // (análisis de sesión vía genreHint + mixResult/sessionMixAnalysis).
  const qc = analysis?.qc_report as
    | { summary?: { all_ok?: boolean; flagged?: unknown[] } }
    | null
    | undefined;
  const aiCells: { label: string; value: string }[] = [];
  if (rawGenre) aiCells.push({ label: "Género", value: genreLabel });
  if (typeof analysis?.tempo_bpm === "number") {
    aiCells.push({ label: "Tempo", value: `${Math.round(analysis.tempo_bpm)} BPM` });
  }
  if (typeof analysis?.genre_confidence === "number") {
    aiCells.push({
      label: "Confianza",
      value: `${Math.round(analysis.genre_confidence * 100)}%`,
    });
  }
  if (qc) {
    aiCells.push({
      label: "QC",
      value: qc.summary?.all_ok === false ? "Revisar" : "OK",
    });
  }

  return (
    <div style={CARD_STYLE}>
      {/* ── Chips flotantes "pedazos de audio" — SOLO mientras mezcla.
          Decorativos: etapas DSP reales de la cadena + stems presentes;
          el timing es el ticker simulado (cap 95 %). aria-hidden. */}
      {mixing && <MixFloatingChips chips={chips} stageIndex={progressStage} />}

      {/* ── Mini-panel del Asistente IA (datos reales del análisis) ── */}
      {mode === "ai" && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          transition={{ duration: 0.25 }}
          className="overflow-hidden border-b"
          style={{ borderColor: "var(--border-subtle)", background: "var(--surface-hover)" }}
        >
          <div className="px-4 py-3">
            <p
              className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em]"
              style={{ color: "var(--text-secondary)" }}
            >
              Recomendaciones del análisis
            </p>
            {aiCells.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                {aiCells.map((cell) => (
                  <span
                    key={cell.label}
                    className="rounded-full px-3 py-1 text-xs font-semibold"
                    style={{
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--border-subtle)",
                      color: "var(--text-primary)",
                    }}
                  >
                    {cell.value}{" "}
                    <span
                      className="text-[10px] font-medium normal-case"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {cell.label}
                    </span>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Los datos del análisis aparecerán cuando generes la mezcla.
              </p>
            )}
          </div>
        </motion.div>
      )}

      {/* ── Título de sección + badges / acción primaria ── */}
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4">
        <div>
          <h2
            className="text-lg font-bold"
            style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}
          >
            Mezcla de Audio
          </h2>
          <p className="mt-0.5 text-xs" style={{ color: "var(--text-secondary)" }}>
            Separa, ecualiza y mezcla tus stems en un bus unificado
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Toggle ES/EN de los chips flotantes (diccionario local). */}
          <LangToggle lang={lang} onLang={changeLang} />
          {hasMixed ? (
            <>
              {/* Pill de estado: muestra/oculta el panel de resultado.
                  Nunca muestra nada mientras procesa. */}
              <button
                onClick={() => setShowResult((v) => !v)}
                disabled={!hasMixed || mixing}
                aria-pressed={hasMixed && showResult}
                title={
                  hasMixed
                    ? "Mostrar u ocultar el resultado de la mezcla"
                    : "Todavía no hay una mezcla"
                }
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-300 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                style={{
                  background: "rgba(48, 209, 88, 0.12)",
                  border: "1px solid rgba(48, 209, 88, 0.2)",
                  color: "#30d158",
                }}
              >
                <CheckCircle2 size={13} />
                Audio mezclado
              </button>
              {/* Pill "Mezcla lista": re-mezcla permitida (mismo click que
                  el botón primario de v1, ahora como pill verde). */}
              <button
                onClick={handleMix}
                disabled={disabled || mixing}
                title="Volver a mezclar"
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-300 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                style={{
                  background: "rgba(48, 209, 88, 0.12)",
                  border: "1px solid rgba(48, 209, 88, 0.2)",
                  color: "#30d158",
                }}
              >
                {mixing ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    Mezclando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={13} />
                    Mezcla lista
                  </>
                )}
              </button>
            </>
          ) : (
            <button
              onClick={handleMix}
              disabled={disabled || mixing || !sessionId}
              className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white transition-all duration-300 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
              style={{
                background: "linear-gradient(135deg, #10b981, #00d4aa)",
                boxShadow: "0 4px 12px rgba(16, 185, 129, 0.25)",
              }}
            >
              {mixing ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Mezclando...
                </>
              ) : (
                <>
                  <Music2 size={16} /> Mezclar Audio
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* ── Opciones de la mezcla: dimensión espacial (Delay + Reverb).
          v6 — elección por mezcla (no persistida), default ON; se
          deshabilita mientras corre el POST /mix. OFF = routing Paso 03
          (backend omite dimension_report). */}
      <div className="flex flex-wrap items-center gap-2.5 px-4 pt-3">
        <button
          type="button"
          role="switch"
          aria-checked={dimensionEnabled}
          aria-label="Dimensión espacial (Delay + Reverb)"
          onClick={() => setDimensionEnabled((v) => !v)}
          disabled={mixing}
          className="relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-40"
          style={{
            background: dimensionEnabled
              ? "var(--accent-primary)"
              : "var(--surface-active)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <span
            className="absolute left-0.5 top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow transition-transform duration-200"
            style={{
              transform: dimensionEnabled ? "translateX(1rem)" : "translateX(0)",
            }}
          />
        </button>
        <div className="min-w-0">
          <p
            className="text-xs font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            Dimensión espacial (Delay + Reverb)
          </p>
          <p
            className="text-[10px] leading-relaxed"
            style={{ color: "var(--text-muted)" }}
            title="Agrega delay tempo y reverb por stem. Apagada: mezcla seca, routing idéntico al paso de paneo."
          >
            Apagada: mezcla seca, sin delay ni reverb
          </p>
        </div>
      </div>

      {/* ── Círculo de carga por etapas — solo mientras corre el /mix ──
          El anillo avanza con `progressPct` (interpolado por etapas; nunca
          llega a 100 hasta la respuesta real del backend). Las notas
          musicales orbitan sobre el anillo y la etapa rota debajo. */}
      {mixing && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="flex flex-col items-center gap-3 px-4 pt-6"
        >
          <div className="relative flex items-center justify-center">
            {/* Halo suave detrás del anillo */}
            <div
              className="absolute rounded-full"
              style={{
                width: 168,
                height: 168,
                background:
                  "radial-gradient(circle, rgba(0, 212, 170, 0.08) 0%, transparent 70%)",
              }}
              aria-hidden="true"
            />

            {/* Anillo de progreso + notas flotando */}
            <div className="relative">
              <svg width={128} height={128} className="-rotate-90">
                <defs>
                  <linearGradient
                    id="mix-ring-gradient"
                    x1="0%"
                    y1="0%"
                    x2="100%"
                    y2="100%"
                  >
                    <stop offset="0%" stopColor="#00d4aa" />
                    <stop offset="100%" stopColor="#5e5ce6" />
                  </linearGradient>
                </defs>
                {/* Track de fondo */}
                <circle
                  cx={64}
                  cy={64}
                  r={58}
                  fill="none"
                  stroke="var(--border)"
                  strokeWidth={6}
                />
                {/* Arco de progreso (dashoffset según `progressPct` real) */}
                <motion.circle
                  cx={64}
                  cy={64}
                  r={58}
                  fill="none"
                  stroke="url(#mix-ring-gradient)"
                  strokeWidth={6}
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 58}
                  initial={false}
                  animate={{
                    strokeDashoffset: 2 * Math.PI * 58 * (1 - progressPct / 100),
                  }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                />
              </svg>

              {/* Notas musicales flotando sobre el anillo */}
              <motion.span
                aria-hidden="true"
                className="absolute -right-2 -top-3"
                style={{ color: "#00d4aa" }}
                animate={{ y: [-2, -10, -2], opacity: [0.5, 1, 0.5], rotate: [0, 14, 0] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
              >
                <Music2 size={16} />
              </motion.span>
              <motion.span
                aria-hidden="true"
                className="absolute -bottom-3 -left-4"
                style={{ color: "#5e5ce6" }}
                animate={{ y: [2, 10, 2], opacity: [0.4, 1, 0.4], rotate: [0, -12, 0] }}
                transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut", delay: 0.6 }}
              >
                <Music4 size={14} />
              </motion.span>
            </div>

            {/* % real: nunca 100 hasta la respuesta del backend */}
            <span
              className="absolute font-mono text-lg font-bold"
              style={{ color: "var(--text-primary)" }}
              aria-live="polite"
            >
              {progressPct}%
            </span>
          </div>

          {/* Etapa actual rotando (chips dinámicos: DSP + stems reales) */}
          <AnimatePresence mode="wait">
            <motion.p
              key={chips[progressStage % chips.length]?.id ?? "mix"}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="text-xs font-medium"
              style={{ color: "var(--text-secondary)" }}
            >
              {chips[progressStage % chips.length]?.label}
            </motion.p>
          </AnimatePresence>
        </motion.div>
      )}

      {/* ── Error banner ── */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="px-4 pt-4"
        >
          <div
            className="rounded-xl p-3 text-xs font-medium"
            style={{
              background: "rgba(239, 68, 68, 0.06)",
              border: "1px solid rgba(239, 68, 68, 0.2)",
              color: "#dc2626",
            }}
          >
            {error}
          </div>
        </motion.div>
      )}

      {/* ── Cancelación informativa (NO es un fallo) ── */}
      {cancelled && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="px-4 pt-4"
        >
          <div
            className="flex items-center gap-2 rounded-xl p-3 text-xs font-medium"
            style={{
              background: "rgba(245, 158, 11, 0.08)",
              border: "1px solid rgba(245, 158, 11, 0.25)",
              color: "#b45309",
            }}
          >
            <Info size={14} />
            Mezcla cancelada. Puedes volver a intentarlo cuando quieras.
          </div>
        </motion.div>
      )}

      {/* ── Vista A/B dual + análisis ──
          Solo con mix real (nunca mientras procesa) y cuando la pill
          "Audio mezclado" lo tiene visible. La fila de acciones vive
          aparte, permanente bajo el módulo. */}
      {hasMixed && sessionId && audioSrc && !mixing && showResult && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="px-4 pt-4"
        >
          <MixWaveformAB
            originalUrl={getAudioUrl(sessionId, "original")}
            mixedUrl={audioSrc}
            mixedDuration={analysis?.duration_seconds ?? null}
          />

          {analysis && <MixAnalysisGrid result={analysis} />}
        </motion.div>
      )}

      {/* ── Hint inicial ── */}
      {sessionId && !hasMixed && !mixing && !error && !cancelled && (
        <p
          className="px-4 pt-3 text-center text-xs"
          style={{ color: "var(--text-muted)" }}
        >
          La mezcla separa el audio en stems por rol, aplica ecualización
          por banda de frecuencia y los junta en un bus estéreo unificado.
        </p>
      )}
      {!hasMixed && !mixing && !sessionId && (
        <p className="px-4 pt-3 text-sm" style={{ color: "var(--text-secondary)" }}>
          Carga un audio para usar la Mezcla de Audio.
        </p>
      )}

      {/* ── Fila de acciones (permanente bajo el módulo) ──
          Masterizar: primaria verde, habilitada solo con mix terminado
          (onMasterize → vista de mastering). Cancelar mezcla: SIEMPRE
          presente; habilitado solo mientras corre el POST /mix (aborta
          el fetch vía AbortController). Descargar WAV: solo con resultado. */}
      <div
        className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t px-4 pt-3"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
          Mezcla generada: escucha el resultado o descarga el WAV
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={onMasterize}
            disabled={!hasMixed || mixing}
            title={
              hasMixed
                ? "Continuar con el masterizado del audio"
                : "Genera la mezcla primero"
            }
            className="flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold uppercase tracking-wide text-white transition-all duration-200 hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              background: "linear-gradient(135deg, #10b981, #00d4aa)",
              boxShadow: "0 4px 12px rgba(16, 185, 129, 0.3)",
            }}
          >
            <Sparkles size={13} />
            Masterizar
          </button>
          <button
            onClick={handleCancel}
            disabled={!mixing}
            title={
              mixing
                ? "Cancelar la mezcla en curso"
                : "No hay una mezcla en curso"
            }
            className="flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold uppercase tracking-wide text-white transition-all duration-200 hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              background: "#ef4444",
              boxShadow: "0 4px 12px rgba(239, 68, 68, 0.3)",
            }}
          >
            <X size={13} strokeWidth={2.5} />
            Cancelar mezcla
          </button>
          {hasMixed && audioSrc && sessionId && (
            <a
              href={audioSrc}
              download={`${sessionId}_mix.wav`}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all hover:brightness-105"
              style={{
                background: "var(--surface-hover)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-primary)",
                boxShadow: "0 1px 2px rgba(15,23,42,0.05)",
              }}
            >
              <Download size={13} />
              Descargar WAV
            </a>
          )}
        </div>
      </div>

      {/* Air inferior de la tarjeta */}
      <div className="h-4" />
    </div>
  );
}