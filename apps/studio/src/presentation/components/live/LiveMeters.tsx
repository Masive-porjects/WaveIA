/**
 * LiveMeters — Real-time spectrum analyzer + VU/Peak meters.
 * Uses Canvas for 60fps rendering from AnalyserNode data.
 */

'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import type { ConnectionState } from '@/lib/live/liveSocket';

interface LiveMetersProps {
  /** Analyser data from audio graph */
  analyserData: { frequency: Uint8Array; timeDomain: Uint8Array } | null;
  /** Current output level (RMS 0-1) */
  outputLevel: number;
  /** Latency in ms */
  latency?: number;
  /** Connection state */
  connectionState?: ConnectionState;
  /** Width in px */
  width?: number;
  /** Height in px */
  height?: number;
}

const METER_COLORS = {
  safe: '#34c759',
  warn: '#ff9500',
  clip: '#ff3b30',
};

export function LiveMeters({
  analyserData,
  outputLevel,
  latency,
  connectionState = 'disconnected',
  width = 280,
  height = 320,
}: LiveMetersProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [vuLevel, setVuLevel] = useState(0);
  const [peakLevel, setPeakLevel] = useState(0);
  const peakHoldRef = useRef(0);

  // VU meter smoothing + peak hold (rAF loop — setState en callback de
  // animación, no síncrono en el efecto; patrón correcto para meters).
  useEffect(() => {
    let raf = 0;
    let holdUntil = 0;

    const tick = () => {
      const target = outputLevel;

      // Peak hold logic
      if (target > peakHoldRef.current) {
        peakHoldRef.current = target;
        holdUntil = performance.now() + 1500;
      } else if (performance.now() > holdUntil) {
        peakHoldRef.current = 0;
      }
      setPeakLevel(peakHoldRef.current);

      // VU smoothing (converge al target)
      setVuLevel((prev) => {
        const next = prev + (target - prev) * 0.15;
        return Math.abs(next - prev) < 0.0005 ? target : next;
      });

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [outputLevel]);

  // Spectrum rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analyserData) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { frequency, timeDomain } = analyserData;
    const w = canvas.width;
    const h = canvas.height;

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Draw spectrum bars
    const barCount = Math.min(frequency.length, 128);
    const barWidth = w / barCount;
    const maxBarHeight = h * 0.85;

    for (let i = 0; i < barCount; i++) {
      const value = frequency[i] / 255; // 0-1
      const barHeight = value * maxBarHeight;
      const x = i * barWidth;
      const y = h - barHeight;

      // Color gradient based on frequency
      const hue = 170 - (i / barCount) * 40; // Teal to cyan
      const saturation = 60 + value * 30;
      const lightness = 35 + value * 40;
      ctx.fillStyle = `hsl(${hue}, ${saturation}%, ${lightness}%)`;

      // Rounded bar
      const radius = Math.max(1, barWidth * 0.3);
      ctx.beginPath();
      ctx.roundRect(x + 1, y, barWidth - 2, barHeight, radius);
      ctx.fill();
    }

    // Draw center line (time domain waveform overlay - subtle)
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const midY = h / 2;
    for (let i = 0; i < timeDomain.length; i++) {
      const x = (i / timeDomain.length) * w;
      const y = midY + ((timeDomain[i] - 128) / 128) * (h * 0.15);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }, [analyserData, width, height]);

  // Canvas resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.scale(dpr, dpr);
  }, [width, height]);

  return (
    <div
      style={{
        width,
        height,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        padding: 16,
        background: 'rgba(18,18,22,0.6)',
        border: '1px solid rgba(255,255,255,0.05)',
        borderRadius: 16,
        backdropFilter: 'blur(12px)',
      }}
    >
      {/* Spectrum Canvas */}
      <div style={{ flex: 1, position: 'relative', minHeight: 180 }}>
        <canvas
          ref={canvasRef}
          width={width}
          height={height - 100}
          style={{ width: '100%', height: '100%', display: 'block' }}
        />
        {/* Frequency labels */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'space-between',
            padding: '0 8px 4px',
            fontSize: 9,
            color: '#555555',
            pointerEvents: 'none',
          }}
        >
          <span>20Hz</span>
          <span>250Hz</span>
          <span>1kHz</span>
          <span>4kHz</span>
          <span>12kHz+</span>
        </div>
      </div>

      {/* VU / Peak Meters */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {/* Stereo VU Meters */}
        <div style={{ display: 'flex', gap: 8 }}>
          {['L', 'R'].map((ch) => (
            <div
              key={ch}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span style={{ fontSize: 10, color: '#8a8a8a', textTransform: 'uppercase' }}>{ch}</span>
              <div
                style={{
                  width: 24,
                  height: 140,
                  background: 'rgba(0,0,0,0.4)',
                  border: '1px solid rgba(255,255,255,0.05)',
                  borderRadius: 12,
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: `${vuLevel * 100}%`,
                    background: `linear-gradient(to top, ${METER_COLORS.safe}, ${METER_COLORS.warn}, ${METER_COLORS.clip})`,
                    borderRadius: 12,
                    transition: 'height 0.05s linear',
                  }}
                />
                {/* Peak indicator */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: `${peakLevel * 100}%`,
                    left: 0,
                    right: 0,
                    height: 2,
                    background: METER_COLORS.clip,
                    boxShadow: `0 0 8px ${METER_COLORS.clip}`,
                    opacity: peakLevel > 0.01 ? 1 : 0,
                    transition: 'opacity 0.1s, bottom 0.05s',
                  }}
                />
              </div>
              <span style={{ fontSize: 11, color: '#e8e8e8', fontWeight: 600, fontFamily: 'Inter, monospace' }}>
                {Math.round(vuLevel * 100)}%
              </span>
            </div>
          ))}
        </div>

        {/* Master Output Level */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '10px 14px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.05)',
            borderRadius: 10,
          }}
        >
          <span style={{ fontSize: 11, color: '#8a8a8a', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Master
          </span>
          <div
            style={{
              flex: 1,
              height: 8,
              background: 'rgba(0,0,0,0.3)',
              borderRadius: 4,
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${outputLevel * 100}%`,
                background: `linear-gradient(90deg, ${METER_COLORS.safe}, ${METER_COLORS.warn}, ${METER_COLORS.clip})`,
                borderRadius: 4,
                transition: 'width 0.05s linear',
              }}
            />
          </div>
          <span style={{ fontSize: 12, color: '#e8e8e8', fontWeight: 600, fontFamily: 'Inter, monospace', minWidth: 48 }}>
            {Math.round(outputLevel * 100)}%
          </span>
        </div>

        {/* Status & Latency */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '8px 12px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.05)',
            borderRadius: 10,
            fontSize: 11,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: connectionState === 'connected' ? METER_COLORS.safe :
                            connectionState === 'connecting' ? METER_COLORS.warn :
                            connectionState === 'stale' ? METER_COLORS.clip : '#8a8a8a',
                animation: connectionState === 'connecting' ? 'pulse 1s infinite' : 'none',
              }}
            />
            <span
              style={{
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: connectionState === 'connected' ? METER_COLORS.safe :
                       connectionState === 'connecting' ? METER_COLORS.warn :
                       connectionState === 'stale' ? METER_COLORS.clip : '#8a8a8a',
              }}
            >
              {connectionState}
            </span>
          </div>
          {latency !== undefined && (
            <span style={{ color: '#627e84', fontFamily: 'Inter, monospace' }}>
              RTT: {latency.toFixed(1)}ms
            </span>
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}