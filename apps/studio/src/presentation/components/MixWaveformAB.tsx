"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import {
  CheckCircle2,
  ChevronDown,
  Pause,
  Play,
  SkipBack,
} from "lucide-react";

interface MixWaveformABProps {
  /** URL del audio original (persistido en el backend). */
  originalUrl: string;
  /** URL del WAV mezclado (objectURL local o URL estable de sesión). */
  mixedUrl: string;
  /** Duración total del mix (``mixResult.duration_seconds`` /
   *  ``sessionMixAnalysis``). Si no hay dato, no se muestra.
   */
  mixedDuration?: number | null;
}

/* ── Paleta light del módulo (autocontenida) ───────────── */

const ORIG_COLORS = { wave: "#484855", progress: "#9aa0b5" };
const MIXED_COLORS = { wave: "#00d4aa", progress: "#30d158" };

/* ── Helpers ───────────────────────────────────────────── */

function formatTime(t: number): string {
  if (!Number.isFinite(t) || t < 0) return "0:00";
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function createWS(
  container: HTMLDivElement,
  url: string,
  waveColor: string,
  progressColor: string,
): WaveSurfer {
  const ws = WaveSurfer.create({
    container,
    waveColor,
    progressColor,
    cursorColor: "transparent",
    cursorWidth: 0,
    interact: true,
    barWidth: 2,
    barGap: 1,
    barRadius: 1,
    height: 64,
    normalize: true,
  });

  // Swallow load errors (CORS / URL temporalmente inalcanzable): la UI
  // degrada a controles deshabilitados en vez de romper el panel.
  const p = ws.load(url);
  if (p && typeof p.catch === "function") {
    p.catch(() => {});
  }

  return ws;
}

function destroyWS(ws: WaveSurfer | null) {
  if (!ws) return;
  try {
    ws.unAll();
    ws.pause();
    ws.destroy();
  } catch {
    // Swallow AbortError o doble destroy
  }
}

/* ── Mitad A/B individual ────────────────────────────────
   Cada lado es una instancia WaveSurfer independiente (sin
   sincronización entre ambas): su propio play/pause, ⏮ y
   contador, alimentados por `timeupdate`. Click-to-seek
   nativo vía `interact: true`. */

interface WaveSideProps {
  url: string;
  kind: "original" | "mixed";
  /** Duración total del mix (solo lado mezclado; se omite sin dato). */
  mixedDuration?: number | null;
}

function WaveSide({ url, kind, mixedDuration }: WaveSideProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const isCleaningRef = useRef(false);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [ready, setReady] = useState(false);

  const isMixed = kind === "mixed";
  const colors = isMixed ? MIXED_COLORS : ORIG_COLORS;

  // Crear / destruir la instancia al montar y al cambiar la URL.
  // Solo corre en el cliente (useEffect) — SSR intacto.
  useEffect(() => {
    isCleaningRef.current = false;

    destroyWS(wsRef.current);
    wsRef.current = null;

    const resetTimer = setTimeout(() => {
      setPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      setReady(false);
    }, 0);

    if (!containerRef.current) return;

    const ws = createWS(containerRef.current, url, colors.wave, colors.progress);
    wsRef.current = ws;

    const onReady = () => {
      if (isCleaningRef.current) return;
      setDuration(ws.getDuration());
      setReady(true);
    };
    const onTimeUpdate = (t: number) => {
      if (isCleaningRef.current) return;
      setCurrentTime(t);
    };

    ws.on("ready", onReady);
    ws.on("timeupdate", onTimeUpdate);
    ws.on("play", () => {
      if (!isCleaningRef.current) setPlaying(true);
    });
    ws.on("pause", () => {
      if (!isCleaningRef.current) setPlaying(false);
    });
    ws.on("finish", () => {
      if (!isCleaningRef.current) setPlaying(false);
    });

    return () => {
      clearTimeout(resetTimer);
      isCleaningRef.current = true;
      destroyWS(wsRef.current);
      wsRef.current = null;
    };
    // Solo por cambio de URL
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  const togglePlay = useCallback(() => {
    wsRef.current?.playPause();
  }, []);

  const restart = useCallback(() => {
    wsRef.current?.setTime(0);
    setCurrentTime(0);
  }, []);

  const playheadPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className="flex flex-col rounded-xl border"
      style={{ background: "#fafafa", borderColor: "#e5e7eb" }}
    >
      {/* Etiqueta + insignia */}
      <div className="flex items-center justify-between gap-2 px-3 pt-3">
        <p
          className="text-[10px] font-bold uppercase tracking-[0.14em]"
          style={{ color: isMixed ? "#10b981" : "#6b7280" }}
        >
          {isMixed ? "Audio mezclado (Final)" : "Original (Raw)"}
        </p>
        {isMixed && (
          <span
            className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
            style={{
              background: "rgba(48, 209, 88, 0.12)",
              border: "1px solid rgba(48, 209, 88, 0.2)",
              color: "#30d158",
            }}
          >
            <CheckCircle2 size={11} />
            Audio mezclado
          </span>
        )}
      </div>

      {/* Onda + playhead */}
      <div
        className="relative mx-3 mt-2 overflow-hidden rounded-lg"
        style={{
          height: 72,
          background: "rgba(15, 23, 42, 0.04)",
          cursor: "pointer",
        }}
      >
        {/* Glow verde-azulado por detrás del lado mezclado */}
        {isMixed && (
          <div
            className="pointer-events-none absolute inset-0 transition-opacity duration-300"
            style={{
              background:
                "radial-gradient(ellipse at 50% 50%, rgba(16, 185, 129, 0.10) 0%, transparent 70%)",
              opacity: playing ? 1 : 0.6,
            }}
          />
        )}
        <div ref={containerRef} className="h-full w-full" />
        {ready && duration > 0 && (
          <div
            className="pointer-events-none absolute bottom-0 top-0 w-[2px]"
            style={{
              left: `${playheadPct}%`,
              transform: "translateX(-50%)",
              background: isMixed ? "#10b981" : "#64748b",
              boxShadow: isMixed
                ? "0 0 8px rgba(16, 185, 129, 0.6)"
                : "none",
              transition: "left 60ms linear",
            }}
          />
        )}
      </div>

      {/* Transporte */}
      <div className="flex items-center gap-2 px-3 pb-3">
        <button
          onClick={restart}
          disabled={!ready}
          title="Volver al inicio"
          aria-label="Volver al inicio"
          className="flex h-8 w-8 items-center justify-center rounded-full transition-all hover:bg-[#eceef1] disabled:cursor-not-allowed disabled:opacity-30"
          style={{ color: isMixed ? "#10b981" : "#64748b" }}
        >
          <SkipBack size={15} fill="currentColor" />
        </button>
        <button
          onClick={togglePlay}
          disabled={!ready}
          aria-label={playing ? "Pausar" : "Reproducir"}
          title={playing ? "Pausar" : "Reproducir"}
          className="flex h-8 w-8 items-center justify-center rounded-full text-white transition-all hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30"
          style={{ background: isMixed ? "#10b981" : "#64748b" }}
        >
          {playing ? (
            <Pause size={14} fill="currentColor" />
          ) : (
            <Play size={14} fill="currentColor" />
          )}
        </button>
        <span className="w-10 font-mono text-xs" style={{ color: "#6b7280" }}>
          {formatTime(currentTime)}
        </span>
        {isMixed && (
          <>
            <div className="flex-1" />
            {typeof mixedDuration === "number" && (
              <span
                className="flex items-center gap-1 font-mono text-xs text-[#9ca3af]"
                data-testid="mix-total-duration"
              >
                {formatTime(mixedDuration)}
                <ChevronDown size={12} />
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ── Vista A/B completa ────────────────────────────────── */

export default function MixWaveformAB({
  originalUrl,
  mixedUrl,
  mixedDuration,
}: MixWaveformABProps) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <WaveSide url={originalUrl} kind="original" />
      <WaveSide url={mixedUrl} kind="mixed" mixedDuration={mixedDuration} />
    </div>
  );
}