"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type SessionData,
  type MasteringParameters,
  DEFAULT_PARAMS,
  type VocalChainParams,
  uploadAudio,
  processAudio,
  downloadMastered,
  splitStems,
  processVocalChain,
  resetSession,
  getSession,
  ApiError,
} from "@/lib/api";
import { PLATFORM_DEFAULTS } from "@/components/DeliveryPanel";
import { type StemSplitterState, createDefaultStemState } from "@/components/StemSplitter";
import { genreToParams } from "@/lib/audioUtils";
import { useProcessingProgress } from "./useProcessingProgress";
import { useTranslation } from "@/i18n/useTranslation";
import { useAuth } from "@/features/auth/hooks/useAuth";
import {
  extractAudioMetadata,
  uploadOriginalAudio,
  createTrackRecord,
  updateTrackStatus,
  type Track,
} from "@/features/tracks";

export const ANALYSIS_TIMEOUT_MS = 180_000;
export const PROCESS_TIMEOUT_MS = 600_000;


export async function waitForAnalysis(
  sessionId: string,
  timeoutMs: number,
): Promise<SessionData | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const s = await getSession(sessionId);
      if (s.analysis) return s;
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

interface UseMasteringWorkflowOptions {
  onSessionLoaded?: (s: SessionData) => void;
}

export function useMasteringWorkflow(
  optionsOrCallback?: UseMasteringWorkflowOptions | ((s: SessionData) => void),
) {
  const onSessionLoaded =
    typeof optionsOrCallback === "function"
      ? optionsOrCallback
      : optionsOrCallback?.onSessionLoaded;

  const { t } = useTranslation();
  const { user } = useAuth();

  const [session, setSession] = useState<SessionData | null>(null);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isUploadingToCloud, setIsUploadingToCloud] = useState(false);
  const currentTrackIdRef = useRef<string | null>(null);

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

  // Stem splitter state
  const [stemState, setStemState] = useState<StemSplitterState>(createDefaultStemState());

  // Vocal chain state
  const [vocalProcessing, setVocalProcessing] = useState(false);
  const [vocalProcessed, setVocalProcessed] = useState(false);

  // Abort controller for in-flight processing requests
  const abortRef = useRef<AbortController | null>(null);
  const presetCacheRef = useRef<Map<string, SessionData>>(new Map());

  // Real progress polled from the backend for the ProcessingOverlay
  const { progress, completeProgress } = useProcessingProgress({
    enabled: processing,
    sessionId: session?.session_id ?? null,
    onComplete: () => setProcessing(false),
    onError: () => {
      setProcessing(false);
      setErrorModal({
        title: t("errors.serverRestartTitle", "El servidor se reinició"),
        message: t(
          "errors.serverRestartMessage",
          "La sesión se perdió mientras se procesaba. Recarga la página: si la sesión no se recupera sola, sube el audio de nuevo.",
        ),
      });
    },
  });

  // Burst on master landed
  const wasProcessingRef = useRef(false);
  useEffect(() => {
    if (wasProcessingRef.current && !processing && session?.mastered_path) {
      setMasterBurst((n) => n + 1);
    }
    wasProcessingRef.current = processing;
  }, [processing, session?.mastered_path]);

  // Persist session
  useEffect(() => {
    if (session?.session_id) {
      localStorage.setItem("waveai-session", session.session_id);
    }
  }, [session?.session_id]);

  // Restore saved session on mount
  useEffect(() => {
    const savedId = localStorage.getItem("waveai-session");
    if (!savedId || session) return;
    getSession(savedId)
      .then((s) => {
        setSession(s);
        onSessionLoaded?.(s);
      })
      .catch((err) => {
        localStorage.removeItem("waveai-session");
        if (err instanceof ApiError && err.status === 404) {
          setErrorModal({
            title: t("errors.sessionExpiredTitle", "Tu sesión anterior expiró"),
            message: t(
              "errors.sessionExpiredMessage",
              "El servidor se reinició y no pudo recuperarla. Sube el audio otra vez para continuar.",
            ),
          });
        }
      });
  }, [onSessionLoaded, session, t]);

  /* ── Upload Handler ────────────────────────────────── */
  const handleFileSelected = useCallback(
    async (file: File) => {
      abortRef.current?.abort();
      abortRef.current = null;

      setLoading(true);
      setUploadProgress(0);
      setError(null);

      // 1. Initiate Supabase Storage upload & track record in parallel (non-blocking for audio engine)
      const cloudUploadPromise = (async () => {
        if (!user) {
          currentTrackIdRef.current = null;
          setCurrentTrack(null);
          return null;
        }
        setIsUploadingToCloud(true);
        try {
          const trackId = crypto.randomUUID();
          currentTrackIdRef.current = trackId;
          const meta = await extractAudioMetadata(file);
          const { storagePath } = await uploadOriginalAudio(user.id, file, trackId);
          const savedTrack = await createTrackRecord(user.id, {
            id: trackId,
            title: file.name.replace(/\.[^/.]+$/, ""),
            original_filename: file.name,
            storage_path: storagePath,
            file_size_bytes: file.size,
            duration_seconds: meta.duration || null,
            sample_rate: meta.sampleRate || null,
            channels: meta.channels || null,
            format: meta.format || null,
            status: "analyzing",
          });
          setCurrentTrack(savedTrack);
          return savedTrack;
        } catch (storageErr) {
          console.error("Cloud storage upload error:", storageErr);
          return null;
        } finally {
          setIsUploadingToCloud(false);
        }
      })();

      // 2. Upload to AudioMind engine & process
      try {
        const result = await uploadAudio(file, setUploadProgress);
        setUploadBurst((n) => n + 1);
        setSession(result);
        onSessionLoaded?.(result);
        presetCacheRef.current.clear();

        // Audio uploaded to engine successfully: transition from upload to processing phase
        setLoading(false);
        setProcessing(true);

        // Await cloud storage completion in background
        await cloudUploadPromise;

        await new Promise((r) => setTimeout(r, 400));

        const analyzed = await waitForAnalysis(result.session_id, ANALYSIS_TIMEOUT_MS);
        if (!analyzed?.analysis) {
          setProcessing(false);
          if (currentTrackIdRef.current) {
            updateTrackStatus(currentTrackIdRef.current, "error").catch(() => {});
          }
          const timeoutMsg = t(
            "errors.analysisTimeout",
            "El análisis del audio tardó demasiado. Reintentá subiendo el track de nuevo.",
          );
          setError(timeoutMsg);
          setErrorModal({
            title: t("common.error", "Error"),
            message: timeoutMsg,
          });
          return;
        }
        setSession(analyzed);

        if (currentTrackIdRef.current) {
          updateTrackStatus(currentTrackIdRef.current, "ready").catch(() => {});
        }

        const genre = analyzed.analysis.detected_genre ?? null;
        const mapped = genreToParams(genre);

        if (analyzed.analysis.is_already_mastered) {
          setProcessing(false);
          setOverMasterWarning({
            open: true,
            confidence: analyzed.analysis.mastering_confidence ?? 0.8,
            analyzedSession: analyzed,
            mappedParams: mapped,
          });
          return;
        }

        setParams(mapped);
        if (currentTrackIdRef.current) {
          updateTrackStatus(currentTrackIdRef.current, "mastering").catch(() => {});
        }

        const controller = new AbortController();
        abortRef.current = controller;
        const watchdog = setTimeout(() => controller.abort(), PROCESS_TIMEOUT_MS);

        try {
          const processed = await processAudio(
            analyzed.session_id,
            mapped,
            controller.signal,
          );
          completeProgress();
          await new Promise((r) => setTimeout(r, 300));
          setSession(processed);
          setProcessing(false);
          if (currentTrackIdRef.current) {
            updateTrackStatus(currentTrackIdRef.current, "completed").catch(() => {});
          }
          onSessionLoaded?.(processed);
        } catch (err) {
          setProcessing(false);
          if (currentTrackIdRef.current) {
            updateTrackStatus(currentTrackIdRef.current, "error").catch(() => {});
          }
          if (err instanceof DOMException && err.name === "AbortError") {
            const timeoutRetryMsg = t(
              "errors.processTimeoutRetry",
              'El procesamiento tardó demasiado y se canceló. Apretá "Procesar con estos parámetros" para reintentar.',
            );
            setError(timeoutRetryMsg);
            setErrorModal({
              title: t("common.error", "Error"),
              message: timeoutRetryMsg,
            });
            return;
          }
          const processErrorMsg = err instanceof Error ? err.message : t("common.error", "Processing failed");
          setError(processErrorMsg);
          setErrorModal({
            title: t("common.error", "Error"),
            message: processErrorMsg,
          });
        } finally {
          clearTimeout(watchdog);
          setProcessing(false);
          if (abortRef.current === controller) abortRef.current = null;
        }
      } catch (err) {
        if (currentTrackIdRef.current) {
          updateTrackStatus(currentTrackIdRef.current, "error").catch(() => {});
        }
        let errMsg = t("errors.uploadFailed", "Upload failed");
        if (err instanceof ApiError && err.status === 413) {
          if (err.message.includes("AUDIO_TOO_LONG")) {
            errMsg = t(
              "errors.audioTooLong",
              "El audio es demasiado largo. El límite para masterizar es de 10 minutos por track.",
            );
          } else {
            errMsg = t(
              "errors.fileTooLarge",
              "El archivo es demasiado grande (máximo 50MB). Probá comprimirlo o exportar en WAV 16-bit / MP3 320kbps.",
            );
          }
        } else if (err instanceof Error) {
          errMsg = err.message;
        }
        setError(errMsg);
        setErrorModal({
          title: t("common.error", "Error"),
          message: errMsg,
        });
      } finally {
        setLoading(false);
        setProcessing(false);
      }

    },
    [completeProgress, onSessionLoaded, t, user],
  );



  /* ── Reprocess ─────────────────────────────────────── */
  const handleProcess = useCallback(async () => {
    if (!session) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setProcessing(true);
    setError(null);
    if (currentTrackIdRef.current) {
      updateTrackStatus(currentTrackIdRef.current, "mastering").catch(() => {});
    }
    const watchdog = setTimeout(() => controller.abort(), PROCESS_TIMEOUT_MS);

    try {
      const result = await processAudio(
        session.session_id,
        params,
        controller.signal,
        activePresetId ?? undefined,
      );
      completeProgress();
      await new Promise((r) => setTimeout(r, 600));
      setSession(result);
      if (currentTrackIdRef.current) {
        updateTrackStatus(currentTrackIdRef.current, "completed").catch(() => {});
      }
    } catch (err) {
      if (currentTrackIdRef.current) {
        updateTrackStatus(currentTrackIdRef.current, "error").catch(() => {});
      }
      if (err instanceof DOMException && err.name === "AbortError") {
        setError(
          t(
            "errors.processTimeout",
            "El procesamiento tardó demasiado y se canceló. Prueba de nuevo.",
          ),
        );
        return;
      }
      setError(err instanceof Error ? err.message : t("common.error", "Processing failed"));
    } finally {
      clearTimeout(watchdog);
      setProcessing(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [session, params, activePresetId, completeProgress, t]);


  /* ── Preset Select ─────────────────────────────────── */
  const handlePresetSelect = useCallback(
    async (presetParams: MasteringParameters, presetId?: string) => {
      if (!session) return;

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
      const watchdog = setTimeout(() => controller.abort(), PROCESS_TIMEOUT_MS);

      try {
        const result = await processAudio(
          session.session_id,
          merged,
          controller.signal,
          presetId,
        );
        completeProgress();
        if (presetId && params.processing_mode !== "transparent") {
          presetCacheRef.current.set(presetId, result);
        }
        await new Promise((r) => setTimeout(r, 600));
        setSession(result);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          setError(
            t(
              "errors.processTimeoutPreset",
              "El procesamiento del preset tardó demasiado y se canceló.",
            ),
          );
          return;
        }
        setError(err instanceof Error ? err.message : t("common.error", "Processing failed"));
      } finally {
        clearTimeout(watchdog);
        setProcessing(false);
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [session, params, completeProgress, t],
  );

  /* ── Reset to Original ─────────────────────────────── */
  const handleReset = useCallback(async () => {
    if (!session) return;
    try {
      await resetSession(session.session_id);
    } catch {
      // Backend best-effort
    }
    setParams(DEFAULT_PARAMS);
    setActivePresetId(null);
  }, [session]);

  /* ── Reset Workflow / Back to Upload ───────────────── */
  const handleBackToUpload = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    localStorage.removeItem("waveai-session");
    setSession(null);
    setCurrentTrack(null);
    currentTrackIdRef.current = null;
    setProcessing(false);
    setError(null);
    setOverMasterWarning(null);
    setParams(DEFAULT_PARAMS);
    setStemState(createDefaultStemState());
    presetCacheRef.current.clear();
  }, []);


  /* ── Stem split ────────────────────────────────────── */
  const handleStemSplit = useCallback(async () => {
    if (!session) throw new Error("No session");
    return await splitStems(session.session_id);
  }, [session]);

  /* ── Vocal process ──────────────────────────────────── */
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

  /* ── Download ──────────────────────────────────────── */
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
        const stem = session.original_path?.split("/").pop()?.replace(/\.[^/.]+$/, "") ?? "master";
        const suffix = activePresetId ? `_${activePresetId}` : "_master";
        a.download = `${stem}${suffix}.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Download failed");
      }
    },
    [session, activePresetId],
  );

  /* ── Over-master confirmations ─────────────────────── */
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
      onSessionLoaded?.(processed);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError(
          t(
            "errors.processTimeoutRetry",
            'El procesamiento tardó demasiado y se canceló. Apretá "Procesar con estos parámetros" para reintentar.',
          ),
        );
        return;
      }
      setError(err instanceof Error ? err.message : "Processing failed");
    } finally {
      clearTimeout(watchdog);
      setProcessing(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [overMasterWarning, completeProgress, onSessionLoaded, t]);

  const handleOverMasterCancel = useCallback(() => {
    setOverMasterWarning(null);
  }, []);

  return {
    session,
    setSession,
    currentTrack,
    setCurrentTrack,
    isUploadingToCloud,
    loading,
    uploadProgress,
    uploadBurst,
    masterBurst,
    processing,
    progress,
    error,
    setError,
    errorModal,
    setErrorModal,
    overMasterWarning,
    params,
    setParams,
    activePresetId,
    setActivePresetId,
    stemState,
    setStemState,
    vocalProcessing,
    vocalProcessed,
    handleFileSelected,
    handleProcess,
    handlePresetSelect,
    handleReset,
    handleBackToUpload,
    handleStemSplit,
    handleVocalProcess,
    handleDownload,
    handleOverMasterConfirm,
    handleOverMasterCancel,
  };
}

