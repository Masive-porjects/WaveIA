"use client";

import { useState, useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { motion, AnimatePresence } from "framer-motion";
import { VIEW_TRANSITION, fadeUp } from "@/lib/motion";
import DropZone from "@/components/DropZone";
import AnalysisPanel from "@/components/AnalysisPanel";
import ModulePanel from "@/components/ModulePanel";
import PlatformSelector from "@/components/PlatformSelector";
import GenreGuide from "@/components/GenreGuide";
import MasteringGuide from "@/components/MasteringGuide";
import FloatingNotes from "@/components/FloatingNotes";
import FloatingGhosts from "@/components/FloatingGhosts";
import BigGhostWithNotes from "@/components/BigGhostWithNotes";
import ProcessingOverlay from "@/components/ProcessingOverlay";
import Player from "@/components/Player";
import LicenseGuard from "@/components/LicenseGuard";
import StemSplitter, {
  createDefaultStemState,
  type StemSplitterState,
} from "@/components/StemSplitter";
import VocalChain from "@/components/VocalChain";
import SongStarter from "@/components/SongStarter";
import ThemeToggle from "@/components/ThemeToggle";
import ModuleSheet from "@/components/ModuleSheet";
import PaintedModule from "@/components/PaintedModule";
import ShareCard from "@/components/ShareCard";
import ErrorModal from "@/components/ErrorModal";
import OverMasterWarning from "@/components/OverMasterWarning";
import MobileDrawer from "@/components/MobileDrawer";
import { useIsMobile } from "@/lib/useIsMobile";
import MobilePresetStrip from "@/components/MobilePresetStrip";
import AuthGuard from "@/components/auth/AuthGuard";
import UserMenu from "@/components/auth/UserMenu";
import type { VocalChainParams } from "@/lib/api";
import SignalChain from "@/components/SignalChain";
import StereoField from "@/components/StereoField";
import {
  uploadAudio,
  processAudio,
  getAudioUrl,
  getSession,
  downloadMastered,
  splitStems,
  processVocalChain,
  getProcessingProgress,
  ApiError,
  type SessionData,
  type MasteringParameters,
  DEFAULT_PARAMS,
} from "@/lib/api";
import {
  Search,
  Menu,
  X,
  AudioWaveform,
  Clock,
  Headphones,
  RotateCcw,
  Home as HomeIcon,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import ModuleDock from "@/components/dock/ModuleDock";
import type { MasteringTab } from "@/components/dock/types";
import { LiveView } from "@/components/live/LiveView";

const TABS: { key: MasteringTab; label: string }[] = [
  { key: "modules", label: "Módulos" },
  { key: "splitter", label: "Splitter" },
  { key: "vocal", label: "Vocal" },
  { key: "songstarter", label: "Beats" },
  { key: "genres", label: "Guía de Géneros" },
  { key: "pipeline", label: "Cadena de Master" },
  { key: "analysis", label: "Análisis" },
  { key: "stereo", label: "Estéreo" },
  { key: "live", label: "Live Engine" },
];

/* ── Genre-to-params mapping ────────────────────────── */

function genreToParams(genre: string | null): MasteringParameters {
  const p: MasteringParameters = { ...DEFAULT_PARAMS };
  if (!genre) return p;

  switch (genre.toLowerCase()) {
    case "urban":
    case "hip-hop":
    case "reggaeton":
      p.compression_ratio = 4.0;
      p.limiter_ceiling_db = -0.5;
      p.transient_boost_db = 2.0;
      p.haas_delay_ms = 5;
      p.stereo_width = 1.2;
      break;
    case "rock":
    case "indie":
      p.compression_ratio = 2.5;
      p.transient_boost_db = 1.0;
      p.saturation_drive_db = 3.0;
      p.saturation_warmth_db = 2.0;
      p.stereo_width = 1.2;
      break;
    case "pop":
    case "electronic":
    case "electrónica":
      p.clarity_brightness_db = 2.0;
      p.compression_ratio = 3.0;
      p.stereo_width = 1.4;
      p.haas_delay_ms = 8;
      break;
    case "jazz":
    case "classical":
    case "clásica":
      p.compression_ratio = 1.5;
      p.limiter_ceiling_db = -2.0;
      p.clarity_wet = 0.25;
      break;
    case "latin":
    case "latino":
    case "fusion":
      p.compression_ratio = 3.0;
      p.transient_boost_db = 1.5;
      p.saturation_drive_db = 2.0;
      p.stereo_width = 1.1;
      break;
  }
  return p;
}

/* ── Analysis wait + process watchdog ─────────────────── */

// Bounded time the auto-process waits for the background analysis
// (the backend now analyzes after the upload response, not inside it).
const ANALYSIS_TIMEOUT_MS = 90_000;
// Watchdog for /process: abort the request so `processing` can never
// stay true forever if the backend hangs or dies mid-job.
// 10 min — large WAVs (up to ~50 MB ≈ 4+ min stereo) with 8× oversampling
// in the true-peak limiter and 16× in the clipper can take several minutes.
const PROCESS_TIMEOUT_MS = 600_000;

async function waitForAnalysis(
  sessionId: string,
  timeoutMs: number,
): Promise<SessionData | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const s = await getSession(sessionId);
      if (s.analysis) return s;
    } catch {
      // Backend hiccup — keep polling
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

/* ── Real progress (polls the backend while processing) ── */

function useProcessingProgress(
  enabled: boolean,
  sessionId: string | null,
  onComplete?: () => void,
) {
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollingRef = useRef(false);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);

  // Keep the completion callback current without touching refs during render
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const clearTimers = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const completeProgress = useCallback(() => {
    clearTimers();
    progressRef.current = 100;
    setProgress(100);
  }, [clearTimers]);

  const startProgress = useCallback(() => {
    clearTimers();
    progressRef.current = 0;
    completedRef.current = false;
    setProgress(0);

    intervalRef.current = setInterval(async () => {
      if (!sessionId) return;
      if (pollingRef.current) return; // skip overlapping polls
      pollingRef.current = true;
      try {
        const p = await getProcessingProgress(sessionId);
        const pct = Math.round(Math.max(0, Math.min(100, p.progress * 100)));
        progressRef.current = pct;
        setProgress(pct);

        // Backend reports the job done — freeze at 100 with the check,
        // then let the POST response resolve (it carries mastered_path)
        // before the overlay closes. The close timer is a watchdog so it
        // can NEVER stay stuck even if the POST hangs.
        if (!completedRef.current && (p.status === "completed" || pct >= 100)) {
          completedRef.current = true;
          clearTimers();
          progressRef.current = 100;
          setProgress(100);
          closeTimerRef.current = setTimeout(() => {
            onCompleteRef.current?.();
          }, 1200);
        }
      } catch {
        // Best-effort: keep the last known value
      } finally {
        pollingRef.current = false;
      }
    }, 500);
  }, [sessionId, clearTimers]);

  const resetProgress = useCallback(() => {
    clearTimers();
    progressRef.current = 0;
    setProgress(0);
  }, [clearTimers]);

  useEffect(() => {
    // Defer the state write out of the effect's synchronous body so we
    // don't cascade renders (react-hooks/set-state-in-effect).
    const t = setTimeout(() => {
      if (enabled && sessionId) startProgress();
      else resetProgress();
    }, 0);
    return () => {
      clearTimeout(t);
      clearTimers();
    };
  }, [enabled, sessionId, startProgress, resetProgress, clearTimers]);

  return { progress, completeProgress };
}

/* ── Note burst colors (reused for the upload animation) ── */
const NOTE_COLORS = ["#ff5a5f", "#ffb347", "#4ecdc4", "#7b68ee", "#ff6b9d"];

/* ── Hydration-safe client detector ──────────────────── */

function useIsClient(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

/* ── Waveform decoration (GSAP live motion) ─────────── */

function WaveformBars({ isPlaying }: { isPlaying: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const barRefs = useRef<(HTMLDivElement | null)[]>([]);
  const tweensRef = useRef<gsap.core.Tween[]>([]);
  const isClient = useIsClient();
  const bars = 32;

  /* Live flowing motion — each bar undulates on its own
     phase/amplitude so the wave feels alive instead of a
     single synchronized pulse. */
  useGSAP(
    () => {
      const els = barRefs.current.filter(
        (el): el is HTMLDivElement => el !== null,
      );
      tweensRef.current = els.map((el, i) =>
        gsap.to(el, {
          scaleY: gsap.utils.random(0.35, 1.45),
          duration: gsap.utils.random(0.9, 1.8),
          ease: "sine.inOut",
          repeat: -1,
          yoyo: true,
          delay: (i % 8) * 0.12,
        }),
      );
      // timeScale is a method on the animation instance, not a config property.
      tweensRef.current.forEach((t) => t.timeScale(isPlaying ? 1.6 : 0.7));
      return () => {
        tweensRef.current.forEach((t) => t.kill());
        tweensRef.current = [];
      };
    },
    { scope: containerRef, dependencies: [isClient] },
  );

  /* Playback energy — speed the wave up while playing */
  useEffect(() => {
    tweensRef.current.forEach((t) => t.timeScale(isPlaying ? 1.6 : 0.7));
  }, [isPlaying]);

  if (!isClient) return <div className="waveform-container" />;
  return (
    <div ref={containerRef} className="waveform-container">
      {Array.from({ length: bars }).map((_, i) => {
        const height = 12 + Math.sin(i * 0.5) * 18 + Math.cos(i * 0.3) * 8;
        return (
          <div
            key={i}
            ref={(el) => {
              barRefs.current[i] = el;
            }}
            className="waveform-bar"
            style={{
              height: `${height}px`,
              background: `linear-gradient(to top, var(--accent-primary), var(--accent-secondary))`,
              opacity: isPlaying ? 0.9 : 0.25,
              transition: "opacity 300ms",
            }}
          />
        );
      })}
    </div>
  );
}

/* ── Main page ────────────────────────────────────────── */

export default function Home() {
  const isMobile = useIsMobile();

  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadBurst, setUploadBurst] = useState(0);
  const [masterBurst, setMasterBurst] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorModal, setErrorModal] = useState<{ title: string; message: string } | null>(null);
  const [overMasterWarning, setOverMasterWarning] = useState<{
    open: boolean;
    confidence: number;
    analyzedSession: SessionData;
    mappedParams: MasteringParameters;
  } | null>(null);

  const [params, setParams] = useState<MasteringParameters>(DEFAULT_PARAMS);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [currentTab, setCurrentTab] = useState<MasteringTab | null>(null);
  const [sheetTab, setSheetTab] = useState<MasteringTab | null>(null);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currentView, setCurrentView] = useState<"upload" | "mastering">("upload");

  // Stem splitter state
  const [stemState, setStemState] = useState<StemSplitterState>(
    createDefaultStemState(),
  );

  // Vocal chain state
  const [vocalProcessing, setVocalProcessing] = useState(false);
  const [vocalProcessed, setVocalProcessed] = useState(false);

  // Right panel collapse state — hidden by default until the user asks for analysis
  const [rightPanelOpen, setRightPanelOpen] = useState(false);

  // Abort controller for in-flight processing requests
  const abortRef = useRef<AbortController | null>(null);

  // Real progress polled from the backend for the ProcessingOverlay.
  // When the backend reports "completed", show the check, give the POST
  // response time to resolve (it carries mastered_path), then close.
  const { progress, completeProgress } = useProcessingProgress(
    processing,
    session?.session_id ?? null,
    () => setProcessing(false),
  );

  // Fire the note burst over the waveform every time a master lands
  // (auto-process, reprocess, or preset change).
  const wasProcessingRef = useRef(false);
  useEffect(() => {
    if (wasProcessingRef.current && !processing && session?.mastered_path) {
      setMasterBurst((n) => n + 1);
    }
    wasProcessingRef.current = processing;
  }, [processing, session?.mastered_path]);

  // Persist the active session so reload doesn't lose the uploaded song.
  useEffect(() => {
    if (session?.session_id) {
      localStorage.setItem("waveai-session", session.session_id);
    }
  }, [session?.session_id]);

  // Restore the saved session on mount.
  useEffect(() => {
    const savedId = localStorage.getItem("waveai-session");
    if (!savedId || session) return;
    getSession(savedId)
      .then((s) => {
        setSession(s);
        setCurrentView(s.mastered_path ? "mastering" : "upload");
      })
      .catch(() => localStorage.removeItem("waveai-session"));
  }, []);

  // Ambient float for the upload card — keeps the first screen alive.
  // Re-runs when the view toggles so the tween always targets the
  // currently mounted card.
  const uploadCardRef = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      if (!uploadCardRef.current) return;
      gsap.to(uploadCardRef.current, {
        y: -6,
        duration: 2.6,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
      });
    },
    { scope: uploadCardRef, dependencies: [currentView] },
  );

  /* ── Upload ──────────────────────────────────────── */
  const handleFileSelected = useCallback(
    async (file: File) => {
      // Abort any in-flight processing before starting fresh
      abortRef.current?.abort();
      abortRef.current = null;

      setLoading(true);
      setUploadProgress(0);
      setError(null);
      try {
        const result = await uploadAudio(file, setUploadProgress);

        // Fire the musical note burst the moment the upload lands
        setUploadBurst((n) => n + 1);
        setSession(result);

        // The studio view will be revealed only when the track is fully
        // processed, keeping the overlay as the only visible surface.
        await new Promise((r) => setTimeout(r, 650));

        // The backend analyzes in the background now, so the studio is
        // usable immediately. Wait for the analysis (genre → params)
        // before the auto-process so the flow matches the old behavior.
        const analyzed = await waitForAnalysis(
          result.session_id,
          ANALYSIS_TIMEOUT_MS,
        );
        if (!analyzed?.analysis) {
          setError(
            "El análisis del audio tardó demasiado. Reintentá subiendo el track de nuevo.",
          );
          return;
        }
        setSession(analyzed);

        const genre = analyzed.analysis.detected_genre ?? null;
        const mapped = genreToParams(genre);
        setParams(mapped);

        // Check if audio is already mastered → warn before processing
        if (analyzed.analysis.is_already_mastered) {
          setOverMasterWarning({
            open: true,
            confidence: analyzed.analysis.mastering_confidence ?? 0.8,
            analyzedSession: analyzed,
            mappedParams: mapped,
          });
          return; // Wait for user decision
        }

        // Auto-process with overlay (unchanged flow)
        setProcessing(true);
        const controller = new AbortController();
        abortRef.current = controller;
        // Watchdog: never let the UI stay stuck if the backend hangs
        const watchdog = setTimeout(() => controller.abort(), PROCESS_TIMEOUT_MS);
        try {
          const processed = await processAudio(
            result.session_id,
            mapped,
            controller.signal,
          );
          completeProgress();
          // Brief pause so the user sees 100% before the overlay exits
          await new Promise((r) => setTimeout(r, 300));
          setSession(processed);

          // Reveal the dashboard only after processing is done.
          setCurrentView("mastering");
          setCurrentTab(null);
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") {
            setError(
              'El procesamiento tardó demasiado y se canceló. Apretá "Procesar con estos parámetros" para reintentar.',
            );
            return;
          }
          setError(
            err instanceof Error ? err.message : "Auto-process failed",
          );
        } finally {
          clearTimeout(watchdog);
          setProcessing(false);
          if (abortRef.current === controller) abortRef.current = null;
        }
      } catch (err) {
        // Map backend status codes to friendly messages
        if (err instanceof ApiError) {
          switch (err.status) {
            case 413:
              setErrorModal({
                title: "Archivo demasiado grande",
                message: "Por favor, sube un archivo que pese menos de 50MB. ¡Mantengamos el estudio ágil!",
              });
              break;
            case 415:
              setErrorModal({
                title: "Formato no soportado",
                message: "Solo aceptamos WAV o MP3. ¡Verificá el formato de tu archivo!",
              });
              break;
            default:
              if (err.status >= 500) {
                setErrorModal({
                  title: "Algo salió mal en el estudio",
                  message: "El estudio está saturado o hubo un problema procesando tu audio. Intentá de nuevo en unos segundos.",
                });
              } else {
                setError(err.message || "Upload failed");
              }
          }
        } else {
          setError(err instanceof Error ? err.message : "Upload failed");
        }
      } finally {
        setLoading(false);
      }
    },
    [completeProgress],
  );

  /* ── Reprocess ───────────────────────────────────── */
  const handleProcess = useCallback(async () => {
    if (!session) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setProcessing(true);
    setError(null);

    // Watchdog: never let the UI stay stuck if the backend hangs
    const watchdog = setTimeout(() => controller.abort(), PROCESS_TIMEOUT_MS);

    try {
      const result = await processAudio(
        session.session_id,
        params,
        controller.signal,
        activePresetId ?? undefined,  // pre-built lookup when a preset is active
      );
      completeProgress();
      await new Promise((r) => setTimeout(r, 600));
      setSession(result);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError(
          "El procesamiento tardó demasiado y se canceló. Probá de nuevo.",
        );
        return;
      }
      const msg = err instanceof Error ? err.message : "Processing failed";
      setError(msg);
    } finally {
      clearTimeout(watchdog);
      setProcessing(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [session, params, activePresetId, completeProgress]);

  /* ── Preset select (auto-process) ───────────────── */
  const handlePresetSelect = useCallback(
    async (presetParams: MasteringParameters, presetId?: string) => {
      if (!session) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setParams(presetParams);
      setActivePresetId(presetId ?? null);
      setProcessing(true);
      setError(null);

      // Watchdog: never let the UI stay stuck if the backend hangs
      const watchdog = setTimeout(() => controller.abort(), PROCESS_TIMEOUT_MS);

      try {
        const result = await processAudio(
          session.session_id,
          presetParams,
          controller.signal,
          presetId,  // enables pre-built lookup on the backend
        );
        completeProgress();
        await new Promise((r) => setTimeout(r, 600));
        setSession(result);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          setError(
            "El procesamiento tardó demasiado y se canceló. Probá de nuevo.",
          );
          return;
        }
        const msg = err instanceof Error ? err.message : "Processing failed";
        setError(msg);
      } finally {
        clearTimeout(watchdog);
        setProcessing(false);
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [session, completeProgress],
  );

  /* ── Reset modules to defaults ──────────────────── */
  const handleReset = useCallback(() => {
    setParams(DEFAULT_PARAMS);
  }, []);

  /* ── Stem split ────────────────────────────────── */
  const handleStemSplit = useCallback(async () => {
    if (!session) throw new Error("No session");
    return await splitStems(session.session_id);
  }, [session]);

  /* ── Vocal process ──────────────────────────────── */
  const handleVocalProcess = useCallback(
    async (vocalParams: VocalChainParams) => {
      if (!session) return;

      setVocalProcessing(true);
      setError(null);

      try {
        await processVocalChain(session.session_id, vocalParams);
        setVocalProcessed(true);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Vocal processing failed";
        setError(msg);
      } finally {
        setVocalProcessing(false);
      }
    },
    [session],
  );

  /* ── Download (with license header) ──────────────── */
  const handleDownload = useCallback(
    async (format: "wav" | "mp3") => {
      if (!session) return;
      try {
        const blob = await downloadMastered(session.session_id, format);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `waveai_${session.session_id}.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch {
        // Silently fail — the backend error is already surfaced
      }
    },
    [session],
  );

  /* ── Back to upload ──────────────────────────────── */
  const handleBackToUpload = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setCurrentView("upload");
    setSession(null);
    setProcessing(false);
    setError(null);
    setOverMasterWarning(null);
    setParams(DEFAULT_PARAMS);
    setStemState(createDefaultStemState());
  }, []);

  /* ── Over-master warning: user confirms processing ── */
  const handleOverMasterConfirm = useCallback(async () => {
    if (!overMasterWarning) return;
    const { analyzedSession, mappedParams } = overMasterWarning;
    setOverMasterWarning(null);

    setProcessing(true);
    const controller = new AbortController();
    abortRef.current = controller;
    const watchdog = setTimeout(() => controller.abort(), PROCESS_TIMEOUT_MS);

    try {
      const processed = await processAudio(
        analyzedSession.session_id,
        mappedParams,
        controller.signal,
      );
      completeProgress();
      await new Promise((r) => setTimeout(r, 300));
      setSession(processed);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError(
          'El procesamiento tardó demasiado y se canceló. Apretá "Procesar con estos parámetros" para reintentar.',
        );
        return;
      }
      setError(
        err instanceof Error ? err.message : "Processing failed",
      );
    } finally {
      clearTimeout(watchdog);
      setProcessing(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [overMasterWarning, completeProgress]);

  /* ── Over-master warning: user cancels ───────────── */
  const handleOverMasterCancel = useCallback(() => {
    setOverMasterWarning(null);
  }, []);

  /* ── Module selection (dock) ────────────────────────
     The dock is THE module navigator: selecting paints the
     module onto the canvas via PaintedModule (key remount).
     Clicking the already-active tab closes it. */
  const handleModuleClick = useCallback((tab: MasteringTab) => {
    setCurrentTab((prev) => (prev === tab ? null : tab));
    setSheetTab(null);
  }, []);

  /* ── Tab content: rendered in the central column or
       inside the ModuleSheet (one live instance at a time
       per render site) ─────────────────────────────── */
  const renderTabContent = (tab: MasteringTab) => {
    switch (tab) {
      case "modules":
        if (!session) {
          return (
            <p className="text-[var(--text-muted)] text-sm">Subí un audio para empezar.</p>
          );
        }
        return (
          <div className="w-full">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-[var(--text-primary)]" style={{ letterSpacing: "-0.02em" }}>
                  Macro-<span className="serif-accent">Carácter</span>
                </h2>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Seleccioná un perfil o ajustá fino abajo
                </p>
              </div>
              <button
                onClick={handleReset}
                disabled={processing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                  text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]
                  disabled:opacity-30 disabled:cursor-not-allowed
                  transition-all duration-200"
              >
                <RotateCcw size={13} />
                Restablecer
              </button>
            </div>

            <ModulePanel
              params={params}
              onChange={setParams}
              disabled={processing}
              onPresetSelect={handlePresetSelect}
            />

            <PlatformSelector
              value={params.target_lufs_db}
              onChange={(t) => setParams((prev) => ({ ...prev, target_lufs_db: t }))}
            />

            {/* Process button */}
            <button
              onClick={handleProcess}
              disabled={processing}
              className="w-full mt-4 py-3 rounded-2xl text-sm font-semibold
                transition-all duration-300 ease-out
                disabled:opacity-40 disabled:cursor-not-allowed
                hover:brightness-110"
              style={{
                background: processing
                  ? "rgba(98, 126, 132, 0.06)"
                  : "linear-gradient(135deg, rgba(98,126,132,0.15), rgba(98,126,132,0.06))",
                border: "1px solid rgba(98,126,132,0.2)",
                color: "var(--accent-primary)",
              }}
            >
              {processing ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Procesando...
                </span>
              ) : (
                "Procesar con estos parámetros"
              )}
            </button>
          </div>
        );

      case "genres":
        return (
          <div className="max-w-4xl">
            <GenreGuide />
          </div>
        );

      case "splitter": {
        if (!session) {
          return (
            <p className="text-[var(--text-muted)] text-sm">Subí un audio para usar el Splitter.</p>
          );
        }
        return (
          <div className="max-w-4xl">
            <StemSplitter
              state={stemState}
              onChange={setStemState}
              onSplit={handleStemSplit}
              sessionId={session.session_id}
              disabled={processing}
            />
          </div>
        );
      }

      case "vocal": {
        if (!session) {
          return (
            <p className="text-[var(--text-muted)] text-sm">Subí un audio para usar VoiceChain Pro.</p>
          );
        }
        return (
          <div className="max-w-4xl">
            <VocalChain
              sessionId={session.session_id}
              disabled={processing}
              processing={vocalProcessing}
              processed={vocalProcessed}
              onProcess={handleVocalProcess}
            />
          </div>
        );
      }

      case "songstarter":
        return (
          <div className="w-full">
            <SongStarter
              sessionId={session?.session_id ?? null}
              disabled={processing}
            />
          </div>
        );

      case "pipeline":
        return (
          <div className="max-w-4xl">
            <MasteringGuide />
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <AuthGuard>
    <LicenseGuard>
    <main className="h-dvh w-screen overflow-hidden overflow-x-hidden bg-[var(--bg-app)] text-[var(--text-primary)] flex flex-col antialiased">
      {/* ═══════════════════════════════════════════════
           Processing Overlay (global)
           ═══════════════════════════════════════════════ */}
      <ProcessingOverlay
        progress={processing ? progress : uploadProgress}
        visible={loading || processing}
        phase={processing ? "process" : "upload"}
      />
      <ErrorModal
        open={errorModal !== null}
        title={errorModal?.title ?? ""}
        message={errorModal?.message ?? ""}
        onClose={() => setErrorModal(null)}
      />
      <OverMasterWarning
        open={overMasterWarning?.open ?? false}
        confidence={overMasterWarning?.confidence ?? 0}
        onConfirm={handleOverMasterConfirm}
        onCancel={handleOverMasterCancel}
      />
      {/* Background watermark layer: strictly BELOW all content (z-0 < z-[1]),
          heavily dimmed so notes never compete with card text. */}
      <FloatingNotes zIndex={0} className="opacity-25" />
      <FloatingGhosts zIndex={0} className="opacity-25" />

      {/* ── Navbar ─────────────────────────────────── */}
      <nav className="relative z-50 flex items-center justify-between px-4 lg:px-6 pt-safe py-3 shrink-0">
        <div className="rounded-full px-4 py-2 glass">
          <span className="text-base font-semibold tracking-tight text-[var(--text-primary)]">
            Wave<span className="text-[var(--accent-primary)]">AI</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Theme toggle — moved here when the icon sidebar was replaced by the dock */}
          <ThemeToggle />
          {currentView === "mastering" && (
            <button
              onClick={handleBackToUpload}
              title="Inicio"
              aria-label="Inicio"
              className="rounded-full w-9 h-9 flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-all"
            >
              <HomeIcon size={18} />
            </button>
          )}
          <button className="rounded-full w-9 h-9 flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-all">
            <Search size={18} />
          </button>
          <UserMenu />
          <button
            className="lg:hidden rounded-full w-9 h-9 flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-all"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <span className="transition-transform duration-300 inline-flex"
              style={{ transform: mobileMenuOpen ? "rotate(180deg)" : "rotate(0deg)" }}
            >
              {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
            </span>
          </button>
        </div>
      </nav>

      {/* Mobile Drawer — slides from left */}
      <MobileDrawer
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        session={session}
        onBackToUpload={handleBackToUpload}
      />

      {/* ── Three-column layout ────────────────────── */}
      <div className="flex-1 flex min-h-0">
        {/* ═══════════════════════════════════════════════
             (The old dead-icon sidebar was replaced by the
              floating ModuleDock at the bottom — module
              navigation now lives there.)
             ═══════════════════════════════════════════════ */}

        {/* ═══════════════════════════════════════════════
             COLUMN 2 — Central Area (Lienzo del Estudio)
             ═══════════════════════════════════════════════ */}
        <main className="flex-1 h-full flex flex-col min-w-0 relative">
          <div className="flex flex-1 min-h-0 relative">
            <div className="flex-1 flex flex-col min-w-0 relative">
          {currentView === "upload" ? (
            /* ── UPLOAD VIEW ─────────────────────────── */
            <div className="flex-1 flex items-center justify-center px-6 py-8 overflow-y-auto relative">
              {/* Large ghost with orbiting notes — behind the upload card */}
              <BigGhostWithNotes className="left-1/2 -top-8" />
              <AnimatePresence mode="wait">
                <motion.div
                  key="upload"
                  className="w-full max-w-2xl flex flex-col items-center"
                  initial={VIEW_TRANSITION.initial}
                  animate={VIEW_TRANSITION.animate}
                  exit={VIEW_TRANSITION.exit}
                  transition={VIEW_TRANSITION.transition}
                >
                  {/* Glass card */}
                  <div
                    ref={uploadCardRef}
                    className="relative w-full rounded-3xl p-4 md:p-6 text-center glass-elevated"
                    style={{ boxShadow: "var(--shadow-heavy)" }}
                  >
                    <div className="mb-2">
                      <div className="inline-flex items-center gap-2 mb-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)]" />
                        <span className="text-[10px] font-medium tracking-widest uppercase text-[var(--text-secondary)]">
                          WaveAI Studio
                        </span>
                        <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-secondary)]" />
                      </div>

                      <h1 className="text-2xl md:text-4xl font-bold mb-1 text-knockout"
                        style={{ letterSpacing: "-0.04em" }}
                      >
                        Masterizá Tu <span className="serif-accent" style={{ color: "hsl(var(--foreground))", WebkitTextFillColor: "hsl(var(--foreground))" }}>Música</span>
                      </h1>

                      <p className="text-[var(--text-muted)] text-sm">
                        Subí tu track, ajustá los módulos y obtené un master profesional
                      </p>
                    </div>

                    <DropZone
                      onFileSelected={handleFileSelected}
                      onError={(title, message) => setErrorModal({ title, message })}
                      disabled={loading}
                    />

                    {/* Musical note burst fires when the upload completes */}
                    {uploadBurst > 0 && (
                      <div className="pointer-events-none absolute inset-0 overflow-hidden">
                        {NOTE_COLORS.map((c, i) => {
                          const dx =
                            ((i * 37 + uploadBurst * 7) % 70) - 35;
                          const delay = ((i * 29 + uploadBurst) % 20) / 100;
                          const dur = 1 + ((i * 13 + uploadBurst) % 6) / 10;
                          return (
                            <motion.span
                              key={i}
                              className="absolute"
                              style={{ left: "50%", bottom: "10px", x: dx }}
                              initial={{
                                y: 0,
                                opacity: 0,
                                scale: 0.3,
                                rotate: -20,
                              }}
                              animate={{
                                y: -140,
                                opacity: [0, 1, 1, 0],
                                scale: 1.2,
                                rotate: 24,
                              }}
                              transition={{ duration: dur, delay, ease: "easeOut" }}
                            >
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke={c}
                                strokeWidth={2.4}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                              >
                                <path d="M9 18V5l12-2v13" />
                                <circle cx="6" cy="18" r="3" />
                                <circle cx="18" cy="16" r="3" />
                              </svg>
                            </motion.span>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Metadata pills */}
                  <div className="flex flex-wrap items-center justify-center gap-3 mt-3">
                    <span className="flex items-center gap-1 text-[var(--text-muted)] text-xs">
                      <Clock size={12} />
                      -14 LUFS Standard
                    </span>
                    <span className="flex items-center gap-1 text-[var(--text-muted)] text-xs">
                      <Headphones size={12} />
                      4 Módulos DSP
                    </span>
                    <span className="flex items-center gap-1 text-[var(--text-muted)] text-xs">
                      <AudioWaveform size={12} />
                      Calidad Profesional
                    </span>
                  </div>

                  {/* Decorative waveform */}
                  <div className="mt-3 opacity-15 pointer-events-none">
                    <WaveformBars isPlaying />
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          ) : isMobile ? (
            /* ── MOBILE MASTERING VIEW ──────────────── */
            <>
              {/* Player at top — always visible */}
              <div className="relative z-[1] shrink-0 px-4 pt-3 pb-1">
                {session && (
                  <Player
                    originalUrl={getAudioUrl(session.session_id, "original")}
                    masteredUrl={
                      session.mastered_path
                        ? getAudioUrl(session.session_id, "mastered")
                        : null
                    }
                    disabled={processing}
                    presetId={activePresetId ?? undefined}
                    sessionId={session.session_id}
                    burstSignal={masterBurst}
                  />
                )}
              </div>

              {/* Mobile content — switch between tab content and default flow */}
              {currentTab !== null && currentTab !== "modules" ? (
                /* Dock tab active → show tab content (Analysis, Pipeline, etc.) */
                <div className="relative z-[1] flex-1 overflow-y-auto px-4 pt-3 pb-28 pb-safe">
                  {renderTabContent(currentTab)}
                </div>
              ) : (
                /* Default mobile one-tap flow */
                <div className="relative z-[1] flex-1 overflow-y-auto px-4 pt-3 pb-8 pb-safe">
                  {/* Error banner */}
                  {error && (
                    <motion.div className="mb-3" {...fadeUp(0)}>
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

                  {/* Preset strip — horizontal scroll */}
                  <div className="mb-4">
                    <MobilePresetStrip
                      activePresetId={activePresetId}
                      onSelect={handlePresetSelect}
                      disabled={processing}
                    />
                  </div>

                  {/* Process button — prominent on mobile */}
                  <button
                    onClick={handleProcess}
                    disabled={processing || !session}
                    className="w-full py-3.5 rounded-2xl text-sm font-semibold
                      transition-all duration-300 ease-out
                      disabled:opacity-40 disabled:cursor-not-allowed
                      hover:brightness-110 active:scale-[0.98]"
                    style={{
                      background: processing
                        ? "rgba(98, 126, 132, 0.06)"
                        : "linear-gradient(135deg, rgba(98,126,132,0.2), rgba(98,126,132,0.08))",
                      border: "1px solid rgba(98,126,132,0.25)",
                      color: "var(--accent-primary)",
                    }}
                  >
                    {processing ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Procesando...
                      </span>
                    ) : (
                      "Procesar con este preset"
                    )}
                  </button>

                  {/* Download buttons — only when mastered */}
                  {session?.mastered_path && (
                    <div className="mt-4 space-y-2">
                      <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest text-center">
                        Descargar master
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleDownload("wav")}
                          className="flex-1 py-2.5 rounded-xl text-xs font-medium text-center
                            text-[var(--text-secondary)] hover:text-[var(--text-primary)]
                            bg-[var(--surface-hover)] hover:bg-[var(--surface-active)]
                            transition-all border border-[var(--border-subtle)]"
                        >
                          WAV (24-bit)
                        </button>
                        <button
                          onClick={() => handleDownload("mp3")}
                          className="flex-1 py-2.5 rounded-xl text-xs font-medium text-center
                            text-[var(--text-secondary)] hover:text-[var(--text-primary)]
                            bg-[var(--surface-hover)] hover:bg-[var(--surface-active)]
                            transition-all border border-[var(--border-subtle)]"
                        >
                          MP3 (320kbps)
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Analysis summary — compact on mobile */}
                  {session?.analysis && (
                    <div className="mt-4 p-3 rounded-xl" style={{
                      background: "var(--bg-glass)",
                      border: "1px solid var(--border-subtle)",
                      backdropFilter: "blur(12px)",
                      WebkitBackdropFilter: "blur(12px)",
                    }}>
                      <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest mb-2">
                        Análisis
                      </p>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="min-w-0">
                          <p className="text-xs font-mono text-[var(--text-primary)]">
                            {session.analysis.integrated_lufs.toFixed(1)}
                          </p>
                          <p className="text-[9px] text-[var(--text-muted)]">LUFS</p>
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-mono text-[var(--text-primary)]">
                            {session.analysis.tempo_bpm.toFixed(0)}
                          </p>
                          <p className="text-[9px] text-[var(--text-muted)]">BPM</p>
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-mono text-[var(--text-primary)] truncate">
                            {session.analysis.detected_genre !== "other"
                              ? session.analysis.detected_genre.replace("_", " ")
                              : "—"}
                          </p>
                          <p className="text-[9px] text-[var(--text-muted)]">Género</p>
                        </div>
                      </div>
                      {session.analysis.is_already_mastered && (
                        <div className="mt-2 p-2 rounded-lg text-[10px] leading-relaxed" style={{
                          background: "rgba(255,159,10,0.08)",
                          border: "1px solid rgba(255,159,10,0.2)",
                          color: "#fbbf24",
                        }}>
                          ⚠️ Audio ya masterizado — riesgo de sobremasterización
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Back to default flow button — visible when a tab is active */}
              {(currentTab !== null && currentTab !== "modules") && (
                <button
                  onClick={() => setCurrentTab("modules")}
                  className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50
                    px-4 py-2 rounded-full text-xs font-medium
                    bg-[var(--bg-glass-elevated)] border border-[var(--border-strong)]
                    text-[var(--text-secondary)] hover:text-[var(--text-primary)]
                    shadow-lg backdrop-blur-md transition-all"
                >
                  ← Volver al flujo principal
                </button>
              )}
            </>
          ) : (
            /* ── DESKTOP MASTERING VIEW ───────────────── */
            <>
              {/* Player at top */}
              <div className="relative z-[1] shrink-0 px-4 lg:px-6 pt-4 pb-2">
                {session && (
                  <Player
                    originalUrl={getAudioUrl(session.session_id, "original")}
                    masteredUrl={
                      session.mastered_path
                        ? getAudioUrl(session.session_id, "mastered")
                        : null
                    }
                    disabled={processing}
                    presetId={activePresetId ?? undefined}
                    sessionId={session.session_id}
                    burstSignal={masterBurst}
                  />
                )}
              </div>

              {/* Vocal result bar — visible from any tab */}
              {vocalProcessed && session && (
                <div className="shrink-0 px-4 lg:px-6 py-2">
                  <div
                    className="flex items-center gap-3 rounded-xl px-4 py-2"
                    style={{
                      background: "rgba(94, 92, 230, 0.06)",
                      border: "1px solid rgba(94, 92, 230, 0.12)",
                    }}
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-[#5e5ce6] shadow-lg shadow-[rgba(94,92,230,0.3)]" />
                    <span className="text-xs text-[var(--text-secondary)]">
                      Voz procesada —{" "}
                      <a
                        href={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api"}/session/${session.session_id}/vocal/audio`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#5e5ce6] hover:underline"
                      >
                        escuchar resultado vocal
                      </a>
                    </span>
                    <button
                      onClick={() => {
                        const a = document.createElement("a");
                        a.href = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api"}/session/${session.session_id}/vocal/audio`;
                        a.download = `${session.session_id}_vocal.wav`;
                        a.click();
                      }}
                      className="ml-auto text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                    >
                      Descargar WAV
                    </button>
                  </div>
                </div>
              )}

              {/* Scrollable tab content — stays mounted (hidden while the
                  module sheet is open) so module state survives.
                  Extra bottom padding clears the floating dock. */}
              <div className={`relative z-[1] flex-1 overflow-y-auto px-4 lg:px-6 pt-4 pb-40 ${sheetTab !== null ? "hidden" : ""}`}>
                {/* Error banner */}
                {error && (
                  <motion.div className="mb-4" {...fadeUp(0)}>
                    <div
                      className="p-4 rounded-2xl text-sm"
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

                <AnimatePresence mode="wait">
                  {currentTab !== null && (
                    <PaintedModule key={currentTab}>
                      {renderTabContent(currentTab)}
                    </PaintedModule>
                  )}
                </AnimatePresence>
              </div>

              {/* Floating ModuleDock — THE module navigator (fixed bottom-center).
                  Fully unmounted while a module sheet is open so its icons and
                  tooltips cannot bleed through the sheet's translucent backdrop. */}
              {sheetTab === null && (
                <ModuleDock
                  activeTab={currentTab}
                  onSelect={handleModuleClick}
                  processingProgress={processing ? progress : 0}
                  lufs={
                    session?.master_result?.integrated_lufs ??
                    session?.analysis?.integrated_lufs ??
                    null
                  }
                />
              )}
            </>
          )}

          </div>
          </div>

          {/* Expand button — visible when the analysis tab is selected and the right panel is collapsed */}
          {currentView === "mastering" && currentTab === "analysis" && !rightPanelOpen && (
            <button
              onClick={() => setRightPanelOpen(true)}
              className="absolute top-4 right-4 z-30 w-8 h-8 rounded-full bg-[var(--bg-elevated)] border border-[var(--border-hover)] flex items-center justify-center hover:bg-[var(--bg-tertiary)] transition-all shadow-lg cursor-pointer"
            >
              <ChevronLeft size={14} className="text-[var(--text-secondary)]" />
            </button>
          )}
        </main>

        {/* ═══════════════════════════════════════════════
             COLUMN 3 — Right Panel (Análisis Colapsable)
             Hidden on mobile — analysis shown inline in mobile flow. */}
        {currentView === "mastering" && !isMobile && (
        <aside
          className={`shrink-0 border-l border-[var(--border-subtle)] bg-[var(--bg-app)]/80 backdrop-blur-md transition-all duration-300 ease-out overflow-hidden ${
            rightPanelOpen ? "w-80 lg:w-96" : "w-0"
          }`}
        >
          <div className="w-80 lg:w-96 h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)] shrink-0">
              <span className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-widest">
                Panel de Análisis
              </span>
              <button
                onClick={() => setRightPanelOpen(false)}
                className="w-6 h-6 rounded-md hover:bg-[var(--surface-hover)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all cursor-pointer"
              >
                <ChevronRight size={14} />
              </button>
            </div>

            {/* Content — scrollable.
                Product decision: the general-analysis panel (and the
                master downloads that live in this same block) belong to
                the Cadena de Master tab only. Other tabs see a hint +
                shortcut instead; "Subir otro track" stays always. */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {currentTab === "pipeline" ? (
                <>
                  {/* Signal Chain Visualizer */}
                  <SignalChain params={params} />

                  {/* Link to analysis */}
                  {session?.mastered_path && (
                    <div className="rounded-xl border border-dashed border-[var(--border-subtle)] p-3 text-center mt-4">
                      <p className="text-[10px] text-[var(--text-muted)]">
                        ¿Querés ver el análisis completo y descargar?
                      </p>
                      <button
                        onClick={() => handleModuleClick("analysis")}
                        className="mt-1 text-[10px] font-medium text-[var(--accent-primary)] hover:underline"
                      >
                        Abrir Análisis →
                      </button>
                    </div>
                  )}
                </>
              ) : currentTab === "analysis" ? (
                <>
                  <AnalysisPanel
                    analysis={session?.analysis ?? null}
                    presetId={activePresetId ?? undefined}
                    masterResult={session?.master_result ?? null}
                    validation={session?.validation ?? null}
                  />

                  {/* Download buttons */}
                  {session?.mastered_path && (
                    <div className="space-y-2">
                      <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest">
                        Descargar
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleDownload("wav")}
                          className="flex-1 py-2.5 rounded-lg text-xs font-medium text-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--surface-hover)] hover:bg-[var(--surface-active)] transition-all border border-[var(--border-subtle)]"
                        >
                          WAV
                        </button>
                        <button
                          onClick={() => handleDownload("mp3")}
                          className="flex-1 py-2.5 rounded-lg text-xs font-medium text-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--surface-hover)] hover:bg-[var(--surface-active)] transition-all border border-[var(--border-subtle)]"
                        >
                          MP3
                        </button>
                        <ShareCard
                          sessionId={session.session_id}
                          originalPath={session.original_path}
                          presetId={activePresetId}
                          analysis={session.analysis}
                          masterResult={session.master_result ?? null}
                        />
                      </div>
                    </div>
                  )}
                </>
              ) : currentTab === "stereo" ? (
                <>
                  {/* Stereo Field Visualizer — dedicated tab */}
                  {session?.mastered_path ? (
                    <StereoField
                      audioUrl={getAudioUrl(session.session_id, "mastered")}
                    />
                  ) : (
                    <div className="rounded-xl border border-dashed border-[var(--border-subtle)] p-4 text-center">
                      <p className="text-xs leading-relaxed text-[var(--text-muted)]">
                        Primero necesitás masterizar un track para ver el campo estéreo.
                      </p>
                    </div>
                  )}
                </>
              ) : currentTab === "live" ? (
                <>
                  {!session?.mastered_path ? (
                    <div className="rounded-xl border border-dashed border-[var(--border-subtle)] p-8 text-center">
                      <p className="text-lg text-[var(--text-secondary)] mb-2">Live Engine</p>
                      <p className="text-xs leading-relaxed text-[var(--text-muted)]">
                        Primero necesitás masterizar un track para activar el motor en vivo.
                      </p>
                    </div>
                  ) : (
                    <LiveView
                      masterAudioUrl={getAudioUrl(session.session_id, "mastered")}
                      masterAudioBuffer={null}
                      isActive={currentTab === "live" || sheetTab === "live"}
                    />
                  )}
                </>
              ) : (
                <div className="rounded-xl border border-dashed border-[var(--border-subtle)] p-4 text-center">
                  <p className="text-xs leading-relaxed text-[var(--text-muted)]">
                    Abrí el módulo{" "}
                    <span className="text-[var(--text-secondary)]">Análisis</span>{" "}
                    desde el dock para ver los resultados y descargar tu master.
                  </p>
                  <button
                    onClick={() => handleModuleClick("analysis")}
                    className="mt-2 text-xs font-medium text-[var(--accent-primary)] hover:underline cursor-pointer"
                  >
                    Abrir Análisis
                  </button>
                </div>
              )}

              {/* Re-upload */}
              <div>
                <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest mb-2">
                  Subir otro track
                </p>
                <DropZone
                  onFileSelected={handleFileSelected}
                  onError={(title, message) => setErrorModal({ title, message })}
                  disabled={loading}
                  compact
                />
              </div>
            </div>
          </div>
        </aside>
        )}
      </div>

      {/* Module sheet — half-screen glass panel */}
      {sheetTab !== null && (
        <ModuleSheet
          open={sheetTab !== null}
          onClose={() => setSheetTab(null)}
          title={TABS.find((t) => t.key === sheetTab)?.label ?? "Módulo"}
          subtitle={
            sheetTab === "splitter"
              ? "Separar en stems"
              : sheetTab === "vocal"
                ? "Cadena vocal pro"
                : sheetTab === "songstarter"
                  ? "Generador de ideas"
                  : sheetTab === "genres"
                    ? "Guía de géneros"
                    : undefined
          }
        >
          {renderTabContent(sheetTab)}
        </ModuleSheet>
      )}
    </main>
    </LicenseGuard>
    </AuthGuard>
  );
}
