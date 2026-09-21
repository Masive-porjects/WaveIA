"use client";

import { useState, useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { motion, AnimatePresence } from "framer-motion";
import { VIEW_TRANSITION, fadeUp } from "@/shared/motion";
import { API_BASE } from "@/adapters/api/config";
import DropZone from "@/components/DropZone";
import AnalysisPanel from "@/components/AnalysisPanel";
import ModulePanel, { PRESETS } from "@/components/ModulePanel";
import { PLATFORM_DEFAULTS } from "@/components/DeliveryPanel";
import FloatingDeliveryPanel from "@/components/FloatingDeliveryPanel";
import FloatingReportCard from "@/components/FloatingReportCard";
import GenreGuide from "@/components/GenreGuide";
import MasteringGuide from "@/components/MasteringGuide";
import FloatingNotes from "@/components/FloatingNotes";
import FloatingGhosts from "@/components/FloatingGhosts";
import BigGhostWithNotes from "@/components/BigGhostWithNotes";
import ProcessingOverlay from "@/components/ProcessingOverlay";
import Player from "@/components/Player";
import WelcomeGate from "@/components/WelcomeGate";
import StemSplitter, {
  createDefaultStemState,
  type StemSplitterState,
} from "@/components/StemSplitter";
import MixPanel from "@/presentation/components/MixPanel";
import AlbumMastering from "@/presentation/components/AlbumMastering";
import VocalChain from "@/components/VocalChain";
import SongStarter from "@/components/SongStarter";
import ThemeToggle from "@/components/ThemeToggle";
import ModuleSheet from "@/components/ModuleSheet";
import PaintedModule from "@/components/PaintedModule";
import ShareCard from "@/components/ShareCard";
import ErrorModal from "@/components/ErrorModal";
import OverMasterWarning from "@/components/OverMasterWarning";
import MobileDrawer from "@/components/MobileDrawer";
import { useIsMobile } from "@/shared/useIsMobile";
import MobilePresetStrip from "@/components/MobilePresetStrip";
import AuthGuard from "@/components/auth/AuthGuard";
import TrackChip from "@/presentation/components/TrackChip";
import { ComingSoonNotice } from "@/components/ComingSoonNotice";
import UserMenu from "@/components/auth/UserMenu";
import type { VocalChainParams } from "@/lib/api";
import SignalChain from "@/components/SignalChain";
import StereoField from "@/components/StereoField";
import {
  uploadAudio,
  processAudio,
  resetSession,
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
  Menu,
  X,
  AudioWaveform,
  Clock,
  Headphones,
  RotateCcw,
  Home as HomeIcon,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import ModuleDock from "@/components/dock/ModuleDock";
import type { MasteringTab } from "@/components/dock/types";

const TABS: { key: MasteringTab; label: string }[] = [
  { key: "mezcla", label: "Mezcla de Audio" },
  { key: "modules", label: "Masterizar Audio" },
  { key: "splitter", label: "Splitter" },
  { key: "vocal", label: "Vocal" },
  { key: "songstarter", label: "Beats" },
  { key: "genres", label: "Guía de Géneros" },
  { key: "pipeline", label: "Cadena de Master" },
  { key: "analysis", label: "Análisis" },
  { key: "stereo", label: "Estéreo" },
  { key: "live", label: "Live Engine" },
  { key: "album", label: "Álbum" },
];

/* ── Active-preset readiness ─────────────────────────
   The mastered URL for the ACTIVE preset may only be requested once that
   preset's master is completed. Guarding with the previous preset's
   `mastered_path` caused 404 races when switching presets during a slow
   render: the fetch asked for `activePresetId` audio that was not ready. */
function isPresetCompleted(
  session: SessionData,
  presetId: string | null | undefined,
): boolean {
  if (!presetId) {
    return Boolean(session.mastered_path);
  }
  return session.preset_masters?.[presetId]?.status === "completed";
}

/* ── Genre-to-params mapping ────────────────────────── */

function genreToParams(genre: string | null): MasteringParameters {
  const p: MasteringParameters = { ...DEFAULT_PARAMS };
  if (!genre) return p;

  switch (genre.toLowerCase()) {
    case "urban":
    case "hip-hop":
    case "reggaeton":
      p.compression_ratio = 4.0;
      p.limiter_ceiling_db = -1.0;
      p.transient_boost_db = 2.0;
      p.haas_delay_ms = 5;
      p.stereo_width = 1.2;
      p.target_lufs_db = -12;
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
    } catch (err) {
      // Session gone (server restarted) — stop waiting right away. A 404
      // here means the in-memory session died; keep polling is pointless.
      if (err instanceof ApiError && err.status === 404) return null;
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
  onError?: () => void,
) {
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollingRef = useRef(false);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);

  // Keep the completion callback current without touching refs during render
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // Same for the session-expired callback
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

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
      } catch (err) {
        // Session expired (backend restarted) — STOP polling instead of
        // flooding the server with 404s, and let the page tell the user.
        if (err instanceof ApiError && err.status === 404) {
          completedRef.current = true;
          clearTimers();
          onErrorRef.current?.();
          return;
        }
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
  const [masteringMode, setMasteringMode] = useState<"manual" | "ai">("manual");

  // Stem splitter state
  const [stemState, setStemState] = useState<StemSplitterState>(
    createDefaultStemState(),
  );

  // Vocal chain state
  const [vocalProcessing, setVocalProcessing] = useState(false);
  const [vocalProcessed, setVocalProcessed] = useState(false);

  // Right panel collapse state — hidden by default until the user opens a tab
  // that needs it (analysis, stereo or live).
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  // Último tab que sincronizó el panel. Patrón oficial React de ajuste de
  // estado durante render (en vez de setState en un effect): el colapso
  // manual del usuario queda intacto, y solo se reabre cuando cambia el tab.
  const [panelSyncTab, setPanelSyncTab] = useState<MasteringTab | null>(null);
  const needsRightPanel =
    currentTab === "analysis" ||
    currentTab === "stereo" ||
    currentTab === "live";
  if (currentTab !== panelSyncTab) {
    setPanelSyncTab(currentTab);
    setRightPanelOpen(needsRightPanel);
  }
  const playerScaleRef = useRef<HTMLDivElement>(null);

  /* ── Player stretch/reposition when a dock tab is toggled */
  useEffect(() => {
    if (!playerScaleRef.current) return;
    const stretch = currentTab === null ? 1 : 1.03;
    gsap.to(playerScaleRef.current, {
      scaleX: stretch,
      scaleY: 1,
      duration: 0.9,
      ease: "power3.inOut",
      overwrite: "auto",
    });
  }, [currentTab]);

  // Abort controller for in-flight processing requests
  const abortRef = useRef<AbortController | null>(null);

  // Real progress polled from the backend for the ProcessingOverlay.
  // When the backend reports "completed", show the check, give the POST
  // response time to resolve (it carries mastered_path), then close.
  const { progress, completeProgress } = useProcessingProgress(
    processing,
    session?.session_id ?? null,
    () => setProcessing(false),
    () => {
      // Session expired mid-poll: close the overlay and stop the 404 flood
      setProcessing(false);
      setErrorModal({
        title: "El servidor se reinició",
        message:
          "La sesión se perdió mientras se procesaba. Recarga la página: si la sesión no se recupera sola, sube el audio de nuevo.",
      });
    },
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
        setCurrentView("mastering");
        setCurrentTab("modules");
      })
      .catch((err) => {
        localStorage.removeItem("waveai-session");
        // 404 definitivo: la sesión murió con un restart del backend (y sin
        // volume persistente no hay forma de recuperarla). Mostralo para que
        // no parezca un bug — el usuario sabe que debe volver a subir.
        if (err instanceof ApiError && err.status === 404) {
          setErrorModal({
            title: "Tu sesión anterior expiró",
            message:
              "El servidor se reinició y no pudo recuperarla. Si el storage persistente está configurado en Railway, recarga de nuevo; si no, sube el audio otra vez — es lo único que falta.",
          });
        }
      });
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
        // Nueva pista = cache de masters por preset INVALIDADA: los entries
        // guardan el SessionData del track anterior y devolverían el audio
        // equivocado al elegir un preset.
        presetCacheRef.current.clear();

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

        // Analysis only prepares the shared controls. Processing remains an
        // explicit action from a preset or the process button.
        setLoading(false);
        setCurrentView("mastering");
        setCurrentTab("modules");

        // Check if audio is already mastered → warn before processing
        if (analyzed.analysis.is_already_mastered) {
          setOverMasterWarning({
            open: true,
            confidence: analyzed.analysis.mastering_confidence ?? 0.8,
            analyzedSession: analyzed,
            mappedParams: mapped,
          });
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
            case 404:
              setErrorModal({
                title: "El servidor se reinició",
                message:
                  "La sesión se perdió durante el procesamiento. Si el servidor tiene el storage persistente, recarga y debería recuperarse; si no, sube el audio de nuevo.",
              });
              break;
            case 422:
              // Demo mode rejects uploads with a "Demo: ..." detail —
              // surface it as a clear modal instead of a raw inline error.
              if (err.message.startsWith("Demo:")) {
                setErrorModal({
                  title: "Límite de la demo",
                  message: err.message,
                });
              } else {
                setError(err.message || "Upload failed");
              }
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
          "El procesamiento tardó demasiado y se canceló. Prueba de nuevo.",
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

  /**
   * Resultados ya procesados, por preset.
   *
   * El motor tarda ~44s por preset con un track cualquiera — el cache de
   * masters pre-construidos del backend solo cubre el track de demo. Comparar
   * dos filtros implicaba esperar dos veces, y volver al primero, una tercera.
   *
   * Guardar la sesion procesada de cada preset hace que volver a uno ya
   * escuchado sea instantaneo. Se limpia al cambiar de track.
   */
  const presetCacheRef = useRef<Map<string, SessionData>>(new Map());

  /* ── Preset select (auto-process) ───────────────── */
  const handlePresetSelect = useCallback(
    async (presetParams: MasteringParameters, presetId?: string) => {
      if (!session) return;

      // Los presets no conocen los campos de entrega (modo, plataforma, SR,
      // QC estricto): conservá los que el usuario ya eligió. El preset dicta
      // el carácter; la entrega sigue siendo decisión del usuario. Si hay una
      // plataforma conocida, re-aplicá su loudness/ceiling para que la UI siga
      // mostrando lo que el backend va a aplicar después del merge.
      const platform = params.platform_target;
      const platformDelivery =
        platform && platform !== "custom" ? PLATFORM_DEFAULTS[platform] : undefined;

      const merged: MasteringParameters = {
        ...presetParams,
        processing_mode: params.processing_mode,
        output_sr: params.output_sr,
        strict_mode: params.strict_mode,
        ...(platform !== undefined ? { platform_target: platform } : {}),
        ...(platformDelivery
          ? {
              target_lufs_db: platformDelivery.lufs,
              limiter_ceiling_db: platformDelivery.ceiling,
            }
          : {}),
      };

      setParams(merged);
      setActivePresetId(presetId ?? null);
      setError(null);

      // La caché por preset solo vale en modo creativo: en modo transparente
      // la cadena del preset no se aplica (todos rinden igual) y devolver el
      // master cacheado de otro preset sería incorrecto — siempre se procesa.
      const cached =
        presetId && params.processing_mode !== "transparent"
          ? presetCacheRef.current.get(presetId)
          : undefined;
      if (cached) {
        abortRef.current?.abort();
        abortRef.current = null;
        setSession(cached);
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setProcessing(true);

      // Watchdog: never let the UI stay stuck if the backend hangs
      const watchdog = setTimeout(() => controller.abort(), PROCESS_TIMEOUT_MS);

      try {
        const result = await processAudio(
          session.session_id,
          merged,
          controller.signal,
          presetId,  // enables pre-built lookup on the backend
        );
        completeProgress();
        await new Promise((r) => setTimeout(r, 600));
        setSession(result);
        if (presetId) presetCacheRef.current.set(presetId, result);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          setError(
            "El procesamiento tardó demasiado y se canceló. Prueba de nuevo.",
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
    [session, completeProgress, params],
  );

  /* ── Reset: revert the current master, leaving only the original ── */
  const handleReset = useCallback(async () => {
    if (!session) return;
    setProcessing(true);
    setError(null);
    try {
      const s = await resetSession(session.session_id);
      setSession(s);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Reset failed";
      setError(msg);
    } finally {
      setProcessing(false);
    }
    // Volvemos parámetros y preset al estado inicial; el backend ya limpió
    // los masters, así el Player queda mostrando solo el original.
    setParams(DEFAULT_PARAMS);
    setActivePresetId(null);
  }, [session]);

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
        const blob = await downloadMastered(
          session.session_id,
          format,
          activePresetId ?? undefined,
        );
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        // Name it after the original upload so the export stays recognizable:
        // "beatRap.wav" → "BeatRapMasterizado.wav" (first letter capitalized).
        const stem = session.original_filename
          ? session.original_filename.replace(/\.[^.]+$/, "")
          : "brikmaster";
        a.download = `${stem.charAt(0).toUpperCase()}${stem.slice(1)}Masterizado.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch {
        // Silently fail — the backend error is already surfaced
      }
    },
    [session, activePresetId],
  );

  /* ── Back to upload ──────────────────────────────── */
  const handleBackToUpload = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setCurrentView("upload");
    setMasteringMode("manual");
    setSession(null);
    setProcessing(false);
    setError(null);
    setOverMasterWarning(null);
    setParams(DEFAULT_PARAMS);
    setStemState(createDefaultStemState());
    // Volver a subir = cambiar de track: la cache de masters por preset
    // pertenece a la sesión anterior.
    presetCacheRef.current.clear();
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
            <p className="text-[var(--text-muted)] text-sm">Carga un audio para empezar.</p>
          );
        }
        return (
          <div className="w-full">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-[var(--text-primary)]" style={{ letterSpacing: "-0.02em" }}>
                  Masterizar <span className="serif-accent">Audio</span>
                </h2>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Selecciona un perfil o ajusta fino abajo
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
              activePresetId={activePresetId}
              onPresetSelect={handlePresetSelect}
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
          <div className="w-full">
            <GenreGuide />
          </div>
        );

      case "splitter": {
        if (!session) {
          return (
            <p className="text-[var(--text-muted)] text-sm">Carga un audio para usar el Splitter.</p>
          );
        }
        return (
          <div className="w-full">
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

      case "mezcla": {
        if (!session) {
          return (
            <p className="text-[var(--text-muted)] text-sm">Carga un audio para usar la Mezcla de Audio.</p>
          );
        }
        return (
          <div className="w-full">
            <MixPanel
              sessionId={session.session_id}
              sessionMixPath={session.mix_path ?? null}
              sessionMixAnalysis={session.mix_analysis ?? null}
              audioDurationSeconds={session.analysis?.duration_seconds ?? null}
              genreHint={session.analysis?.detected_genre ?? null}
              disabled={processing}
            />
          </div>
        );
      }

      case "vocal": {
        if (!session) {
          return (
            <p className="text-[var(--text-muted)] text-sm">Carga un audio para usar VoiceChain Pro.</p>
          );
        }
        return (
          <div className="w-full">
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

            case "album":
              return (
                <div className="w-full">
                  <AlbumMastering />
                </div>
              );

            case "pipeline":
        return (
          <div className="w-full">
            <MasteringGuide />
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <AuthGuard>
    <WelcomeGate>
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

      {/* Floating overlays — la entrega y el reporte viven en elementos
          fijos colapsables (FAB derecho + píldora izquierda) para que el
          lienzo del estudio no se llene: nada crece, todo es overlay. */}
      {currentView === "mastering" && (
        <FloatingDeliveryPanel params={params} onChange={setParams} />
      )}
      {currentView === "mastering" && session?.mastering_report && (
        <FloatingReportCard
          report={session.mastering_report}
          mode={session.parameters?.processing_mode ?? "master"}
          platform={session.parameters?.platform_target ?? null}
        />
      )}
      {/* Background watermark layer: strictly BELOW all content (z-0 < z-[1]),
          heavily dimmed so notes never compete with card text. */}
      <FloatingNotes zIndex={0} className="opacity-25" />
      <FloatingGhosts zIndex={0} className="opacity-25" />

      {/* ── Navbar ─────────────────────────────────── */}
      <nav className="relative z-50 flex items-center justify-between px-4 lg:px-6 pt-safe py-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="rounded-full px-4 py-2 glass">
            <span className="text-base font-semibold tracking-tight text-[var(--text-primary)]">
              Brik<span className="text-[var(--accent-primary)]">master</span>
            </span>
          </div>

          {currentView !== "upload" && session && (
            <TrackChip
              originalPath={session.original_path}
              genre={session.analysis?.detected_genre}
              disabled={processing || loading}
              onChangeTrack={handleBackToUpload}
            />
          )}
        </div>

        {currentView === "mastering" && (
          <div
            className="z-10 flex shrink-0 items-center gap-1 rounded-2xl border p-1.5 shadow-[var(--shadow-card)] backdrop-blur-2xl lg:absolute lg:left-1/2 lg:-translate-x-1/2"
            style={{
              background: "var(--bg-glass-elevated)",
              borderColor: "var(--border-strong)",
            }}
            role="group"
            aria-label="Elige cómo quieres masterizar"
          >
            {([
              {
                id: "manual",
                label: "Manual",
                description: "Control total",
                icon: SlidersHorizontal,
              },
              {
                id: "ai",
                label: "Asistente IA",
                description: "Recomendaciones",
                icon: Sparkles,
              },
            ] as const).map(({ id, label, description, icon: Icon }) => {
              const active = masteringMode === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setMasteringMode(id);
                    if (id === "ai") setSheetTab(null);
                  }}
                  className="group relative flex min-h-10 items-center gap-2 rounded-xl border px-3 py-2 text-left transition-[border-color,color] duration-300 md:min-w-36 lg:min-w-44 lg:px-4"
                  style={{
                    background: active ? "transparent" : "var(--surface-hover)",
                    borderColor: active ? "var(--accent-primary)" : "transparent",
                    color: active ? "var(--text-primary)" : "var(--text-secondary)",
                    // El resplandor activo lo pone la pildora que se desliza.
                    boxShadow: active ? "none" : "inset 0 1px 0 rgba(255,255,255,0.04)",
                  }}
                >
                  {/* El fondo activo es un solo elemento que se desliza entre
                      las dos opciones, en vez de encenderse y apagarse. */}
                  {active && (
                    <motion.span
                      layoutId="mastering-mode-pill"
                      aria-hidden
                      className="absolute inset-0 -z-10 rounded-xl"
                      style={{
                        background:
                          "color-mix(in srgb, var(--accent-primary) 22%, var(--bg-elevated))",
                        boxShadow:
                          "inset 0 1px 0 rgba(255,255,255,0.14), 0 0 20px rgba(98,126,132,0.2)",
                      }}
                      transition={{ type: "spring", stiffness: 380, damping: 32 }}
                    />
                  )}

                  <span
                    className="flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors duration-300"
                    style={{
                      background: active ? "var(--accent-primary)" : "var(--surface-active)",
                      color: active ? "var(--text-primary)" : "var(--text-secondary)",
                    }}
                  >
                    <Icon size={15} strokeWidth={2} aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block whitespace-nowrap text-xs font-semibold tracking-tight lg:text-sm">
                      {id === "ai" ? <><span className="md:hidden">IA</span><span className="hidden md:inline">{label}</span></> : label}
                    </span>
                    <span className="mt-0.5 hidden whitespace-nowrap text-[9px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)] lg:block">
                      {description}
                    </span>
                  </span>
                  {active && (
                    <span
                      className="absolute right-2 top-2 size-1.5 rounded-full bg-[var(--accent-secondary)] shadow-[0_0_8px_rgba(130,156,161,0.8)]"
                      aria-hidden="true"
                    />
                  )}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex items-center gap-2">
          {/* Theme toggle — moved here when the icon sidebar was replaced by the dock */}
          <div className="hidden md:block">
            <ThemeToggle />
          </div>
          {currentView === "mastering" && (
            <button
              onClick={handleBackToUpload}
              title="Inicio"
              aria-label="Inicio"
              className="hidden rounded-full w-9 h-9 md:flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-all"
            >
              <HomeIcon size={18} />
            </button>
          )}
          <div className="hidden sm:block">
            <UserMenu />
          </div>
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
                          WaveIA
                        </span>
                        <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-secondary)]" />
                      </div>

                      <h1 className="text-2xl md:text-4xl font-bold mb-1 text-knockout"
                        style={{ letterSpacing: "-0.04em" }}
                      >
                        Masteriza Tu <span className="serif-accent">Música</span>
                      </h1>

                      <p className="text-[var(--text-muted)] text-sm">
                        Carga tu track, ajusta los módulos y obtén un master profesional
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
          ) : (
            <>
              {/* Both workspaces stay mounted so switching modes preserves
                  the agent conversation and every manual module state. */}
              <div
                className={`${masteringMode === "ai" ? "flex" : "hidden"} flex-1 min-h-0 items-center justify-center overflow-y-auto px-4 py-5 md:px-6 md:py-8`}
                aria-hidden={masteringMode !== "ai"}
              >
                <ComingSoonNotice
                  title="Asistente IA"
                  message="El asistente con recomendaciones llega pronto. Mientras tanto, masterizá en modo Manual con las guías de género."
                />
              </div>

              <div
                className={`${masteringMode === "manual" ? "flex" : "hidden"} flex-1 min-h-0 flex-col`}
                aria-hidden={masteringMode !== "manual"}
              >
              {isMobile ? (
            /* ── MOBILE MASTERING VIEW ──────────────── */
            <>
              {/* Player at top — always visible, except the Mezcla tab:
                  MixPanel's own A/B waves (MixWaveformAB) replace it and sit
                  directly under the module header. */}
              {currentTab !== "mezcla" && sheetTab !== "mezcla" && (
                <div className="relative z-[1] shrink-0 px-4 pt-3 pb-1">
                  {session && (
                    <Player
                      originalUrl={getAudioUrl(session.session_id, "original")}
                      masteredUrl={
                        isPresetCompleted(session, activePresetId)
                          ? getAudioUrl(session.session_id, "mastered", activePresetId ?? undefined)
                          : null
                      }
                      disabled={processing}
                      presetId={activePresetId ?? undefined}
                      sessionId={session.session_id}
                      burstSignal={masterBurst}
                    />
                  )}
                </div>
              )}

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
              {/* Player — bigger and centered when no dock tab is selected.
                  Hidden on the Mezcla tab: MixPanel paints its own A/B
                  waves (MixWaveformAB) right below the module header.
                  Mastering flow (no tab / modules) keeps it exactly as-is. */}
              {currentTab !== "mezcla" && sheetTab !== "mezcla" && (
                <motion.div
                  layout="position"
                  transition={{ type: "spring", stiffness: 40, damping: 12 }}
                  className={`relative z-[1] px-4 lg:px-6 pt-4 pb-2 ${
                    currentTab === null
                      ? "flex-1 flex items-center justify-center min-h-0"
                      : "shrink-0"
                  }`}
                >
                  {session && (
                    <div
                      ref={playerScaleRef}
                      className={`w-full origin-center ${
                        currentTab === null ? "max-w-5xl" : ""
                      }`}
                    >
                      <Player
                        originalUrl={getAudioUrl(session.session_id, "original")}
                        masteredUrl={
                          isPresetCompleted(session, activePresetId)
                            ? getAudioUrl(session.session_id, "mastered", activePresetId ?? undefined)
                            : null
                        }
                        disabled={processing}
                        presetId={activePresetId ?? undefined}
                        sessionId={session.session_id}
                        burstSignal={masterBurst}
                      />
                    </div>
                  )}
                </motion.div>
              )}

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
                        href={`${API_BASE}/session/${session.session_id}/vocal/audio`}
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
                        a.href = `${API_BASE}/session/${session.session_id}/vocal/audio`;
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
                  module sheet is open or when no tab is selected) so module state survives.
                  Extra bottom padding clears the floating dock. */}
              <div className={`relative z-[1] overflow-y-auto px-4 lg:px-6 pt-4 pb-40 ${
                sheetTab !== null || currentTab === null ? "hidden" : "flex-1"
              }`}>
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
            </>
          )}

          </div>
          </div>

          {/* Expand button — visible when a tab that needs the right panel is selected and the panel is collapsed */}
          {currentView === "mastering" && masteringMode === "manual" && (currentTab === "analysis" || currentTab === "stereo" || currentTab === "live") && !rightPanelOpen && (
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
        {currentView === "mastering" && masteringMode === "manual" && !isMobile && (
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
                        ¿Quieres ver el análisis completo y descargar?
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
                      audioUrl={getAudioUrl(session.session_id, "mastered", activePresetId ?? undefined)}
                    />
                  ) : (
                    <div className="rounded-xl border border-dashed border-[var(--border-subtle)] p-4 text-center">
                      <p className="text-xs leading-relaxed text-[var(--text-muted)]">
                        Primero necesitas masterizar un track para ver el campo estéreo.
                      </p>
                    </div>
                  )}
                </>
              ) : currentTab === "live" ? (
                <ComingSoonNotice
                  title="Live Engine"
                  message="El motor de efectos en vivo llega pronto. Por ahora, masterizá y escuchá el resultado en Análisis."
                />
              ) : (
                <div className="rounded-xl border border-dashed border-[var(--border-subtle)] p-4 text-center">
                  <p className="text-xs leading-relaxed text-[var(--text-muted)]">
                    Abre el módulo{" "}
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
                    : sheetTab === "mezcla"
                      ? "Mezclar stems en un bus"
                      : undefined
          }
        >
          {renderTabContent(sheetTab)}
        </ModuleSheet>
      )}
    </main>
    </WelcomeGate>
    </AuthGuard>
  );
}
