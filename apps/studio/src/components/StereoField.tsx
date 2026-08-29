"use client";

import { useRef, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Radio } from "lucide-react";
import { useStereoField } from "@/hooks/useStereoField";

/* ── Stereo Field Visualizer ────────────────────────────────
   Canvas-based goniometer (Lissajous figure) + correlation
   meter + channel level bars.

   Props:
     audioUrl — URL of the mastered audio to analyse
     compact  — shrink for mobile or sidebar placement
   ──────────────────────────────────────────────────────────── */

interface StereoFieldProps {
  audioUrl: string | null;
  compact?: boolean;
}

/* ── Goniometer Canvas ──────────────────────────────────── */

function Goniometer({
  lData,
  rData,
  correlation,
  color,
}: {
  lData: Float32Array | null;
  rData: Float32Array | null;
  correlation: number;
  color: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const prevPointsRef = useRef<Array<{ x: number; y: number }>>([]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !lData || !rData) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const scale = Math.min(cx, cy) * 0.85;

    // Fade previous frame (trail effect)
    ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
    ctx.fillRect(0, 0, w, h);

    // Reference circle
    ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.arc(cx, cy, scale, 0, Math.PI * 2);
    ctx.stroke();

    // Cross-hair
    ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
    ctx.beginPath();
    ctx.moveTo(cx, cy - scale);
    ctx.lineTo(cx, cy + scale);
    ctx.moveTo(cx - scale, cy);
    ctx.lineTo(cx + scale, cy);
    ctx.stroke();

    // Goniometer points (L → X, R → Y, rotated 45°)
    const cos45 = Math.cos(Math.PI / 4);
    const sin45 = Math.sin(Math.PI / 4);
    const points: Array<{ x: number; y: number }> = [];

    for (let i = 0; i < lData.length; i++) {
      const l = lData[i];
      const r = rData[i];

      // Mid/Side encoding for better visualization
      const mid = (l + r) / 2;
      const side = (l - r) / 2;

      // Rotate 45° for standard goniometer orientation
      const x = (mid * cos45 - side * sin45) * scale;
      const y = (mid * sin45 + side * cos45) * scale;

      points.push({ x: cx + x, y: cy - y });
    }

    // Draw trail (fade old points)
    const prev = prevPointsRef.current;
    if (prev.length > 0) {
      const len = Math.min(prev.length, points.length);
      for (let i = 0; i < len; i += 3) {
        const alpha = (i / len) * 0.3;
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.fillRect(prev[i].x - 0.5, prev[i].y - 0.5, 1, 1);
      }
    }

    // Draw current points
    for (let i = 0; i < points.length; i++) {
      const alpha = 0.3 + (i / points.length) * 0.7;
      ctx.fillStyle = `${color}${Math.round(alpha * 255).toString(16).padStart(2, "0")}`;
      ctx.fillRect(points[i].x - 0.8, points[i].y - 0.8, 1.6, 1.6);
    }

    // Bright center core (highest density)
    ctx.fillStyle = `${color}40`;
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();

    prevPointsRef.current = points;
  }, [lData, rData, color]);

  useEffect(() => {
    draw();
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      width={200}
      height={200}
      className="w-full h-full rounded-xl"
      style={{
        background: "rgba(0, 0, 0, 0.4)",
        imageRendering: "auto",
      }}
      aria-label="Goniómetro estéreo — muestra la imagen de campo estéreo en tiempo real"
    />
  );
}

/* ── Correlation Meter ──────────────────────────────────── */

function CorrelationMeter({
  value,
  compact,
}: {
  value: number;
  compact?: boolean;
}) {
  // Map -1..+1 to 0..100%
  const pct = ((value + 1) / 2) * 100;
  const isWide = value < 0.3;
  const isMono = value > 0.9;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[9px] text-[var(--text-muted)] font-mono">
          -1
        </span>
        <span
          className={`text-[9px] font-mono font-medium ${
            isWide
              ? "text-[#4ecdc4]"
              : isMono
                ? "text-[#ffb347]"
                : "text-[var(--text-secondary)]"
          }`}
        >
          {value.toFixed(2)}
        </span>
        <span className="text-[9px] text-[var(--text-muted)] font-mono">
          +1
        </span>
      </div>
      <div
        className="relative h-1.5 rounded-full overflow-hidden"
        style={{ background: "var(--border-subtle)" }}
      >
        {/* Center marker */}
        <div
          className="absolute top-0 bottom-0 w-px bg-[var(--text-muted)] opacity-30"
          style={{ left: "50%" }}
        />
        {/* Value indicator */}
        <motion.div
          className="absolute top-0 bottom-0 rounded-full"
          style={{
            background: isWide
              ? "#4ecdc4"
              : isMono
                ? "#ffb347"
                : "var(--accent-primary)",
          }}
          initial={{ width: "0%" }}
          animate={{
            left: `${Math.max(0, pct - 1)}%`,
            width: "2%",
          }}
          transition={{ duration: 0.1 }}
        />
      </div>
      <div className="flex items-center justify-between mt-0.5">
        <span className="text-[8px] text-[var(--text-muted)]">
          Anti-fase
        </span>
        <span className="text-[8px] text-[var(--text-muted)]">
          Mono
        </span>
        <span className="text-[8px] text-[var(--text-muted)]">
          Estéreo
        </span>
      </div>
    </div>
  );
}

/* ── Channel Level Bars ─────────────────────────────────── */

function ChannelLevels({
  levelL,
  levelR,
  compact,
}: {
  levelL: number;
  levelR: number;
  compact?: boolean;
}) {
  const barHeight = compact ? 40 : 60;

  return (
    <div className="flex items-end gap-1.5" style={{ height: barHeight }}>
      {/* L channel */}
      <div className="flex flex-col items-center gap-0.5">
        <div
          className="rounded-sm transition-all duration-75"
          style={{
            width: compact ? 6 : 8,
            height: `${Math.max(2, levelL * barHeight)}px`,
            background: levelL > 0.8 ? "#ff3b30" : "#4ecdc4",
            opacity: 0.8,
          }}
        />
        <span className="text-[8px] text-[var(--text-muted)] font-mono">L</span>
      </div>
      {/* R channel */}
      <div className="flex flex-col items-center gap-0.5">
        <div
          className="rounded-sm transition-all duration-75"
          style={{
            width: compact ? 6 : 8,
            height: `${Math.max(2, levelR * barHeight)}px`,
            background: levelR > 0.8 ? "#ff3b30" : "#4ecdc4",
            opacity: 0.8,
          }}
        />
        <span className="text-[8px] text-[var(--text-muted)] font-mono">R</span>
      </div>
    </div>
  );
}

/* ── Main Component ─────────────────────────────────────── */

export default function StereoField({ audioUrl, compact }: StereoFieldProps) {
  const {
    active,
    ready,
    error,
    correlation,
    width,
    levelL,
    levelR,
    lData,
    rData,
    start,
    stop,
  } = useStereoField(audioUrl);

  return (
    <div className={`w-full ${compact ? "" : "py-3"}`}>
      {/* Header */}
      {!compact && (
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="flex items-center gap-2">
            <Radio size={13} className="text-[var(--text-muted)]" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
              Campo Estéreo
            </span>
          </div>
          <button
            onClick={active ? stop : start}
            disabled={!ready && !active}
            className="text-[9px] px-2 py-1 rounded-md font-medium transition-all
              text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]
              disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {active ? "Detener" : ready ? "Analizar" : "Cargando…"}
          </button>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="mb-2 px-1">
          <p className="text-[10px] text-[var(--accent-error)] leading-relaxed">
            {error}
          </p>
        </div>
      )}

      {/* Main visualization */}
      <div
        className={`flex ${compact ? "flex-row gap-2" : "flex-row gap-3"}`}
        style={{ minHeight: compact ? 80 : 140 }}
      >
        {/* Goniometer */}
        <div
          className={`relative rounded-xl overflow-hidden ${
            compact ? "w-20 h-20" : "flex-1"
          }`}
          style={{
            minHeight: compact ? 80 : 120,
            background: "rgba(0, 0, 0, 0.3)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          {lData && rData ? (
            <div className="relative w-full h-full">
              <Goniometer
                lData={lData}
                rData={rData}
                correlation={correlation}
                color="#4ecdc4"
              />
              {/* Stop button overlay when active */}
              {active && (
                <button
                  onClick={stop}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full
                    flex items-center justify-center
                    bg-black/40 hover:bg-black/60 transition-colors z-10"
                  aria-label="Detener análisis estéreo"
                >
                  <div className="w-2 h-2 rounded-sm bg-[#ff3b30]" />
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={active ? stop : start}
              disabled={(!ready && !active) || !!error}
              className="absolute inset-0 flex items-center justify-center
                hover:bg-white/5 transition-colors disabled:cursor-not-allowed"
              aria-label={active ? "Detener análisis estéreo" : "Iniciar análisis estéreo"}
            >
              <p className="text-[9px] text-center px-2 pointer-events-none"
                style={{ color: error ? "var(--accent-error)" : "var(--text-muted)" }}
              >
                {error
                  ? "Error"
                  : active
                    ? "Procesando…"
                    : ready
                      ? "▶ Analizar"
                      : "Cargando…"}
              </p>
            </button>
          )}
        </div>

        {/* Right panel: correlation + levels */}
        <div
          className={`flex flex-col gap-2 ${
            compact ? "flex-1 justify-center" : "w-28 justify-between"
          }`}
        >
          {/* Channel levels */}
          <ChannelLevels levelL={levelL} levelR={levelR} compact={compact} />

          {/* Correlation meter */}
          {!compact && <CorrelationMeter value={correlation} />}

          {/* Width indicator */}
          <div className="flex items-center gap-1.5">
            <div
              className="w-1.5 h-1.5 rounded-full"
              style={{
                background:
                  width > 0.5
                    ? "#4ecdc4"
                    : width > 0.2
                      ? "#ffb347"
                      : "var(--text-muted)",
              }}
            />
            <span className="text-[9px] text-[var(--text-muted)] font-mono">
              W: {width.toFixed(2)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
