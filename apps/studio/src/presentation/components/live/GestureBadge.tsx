/**
 * GestureBadge — Shows which physical gesture controls a parameter.
 * Animated indicator with gesture icon and label.
 */

'use client';

import { motion } from 'framer-motion';

interface GestureBadgeProps {
  /** Parameter name */
  param: 'filter_cutoff' | 'filter_res' | 'reverb_mix' | 'delay_time' | 'echo_feedback' | 'drive' | 'fx_preset' | 'output_level';
  /** Compact mode (icon only) */
  compact?: boolean;
  /** Custom className */
  className?: string;
}

const GESTURE_MAP: Record<string, { icon: string; label: string; description: string }> = {
  filter_cutoff: {
    icon: '☝️',
    label: 'Pulgar Derecho',
    description: 'X position → Cutoff (log)',
  },
  filter_res: {
    icon: '🎚️',
    label: 'Resonancia',
    description: 'Filtro Q',
  },
  reverb_mix: {
    icon: '👍',
    label: 'Pulgar Izquierdo',
    description: 'X position → Reverb Mix',
  },
  delay_time: {
    icon: '⬆️',
    label: 'Altura Mano',
    description: 'Y position → Delay Time',
  },
  echo_feedback: {
    icon: '🤲',
    label: 'Apertura Mano',
    description: 'Spread → Echo Feedback',
  },
  drive: {
    icon: '↔️',
    label: 'Posición X',
    description: 'X center → Drive',
  },
  fx_preset: {
    icon: '👏',
    label: 'Palmada',
    description: 'Clap zone → FX Preset',
  },
  output_level: {
    icon: '🔊',
    label: 'Nivel Salida',
    description: 'Gain master',
  },
};

export function GestureBadge({ param, compact = false, className = '' }: GestureBadgeProps) {
  const gesture = GESTURE_MAP[param];
  if (!gesture) return null;

  if (compact) {
    return (
      <span
        className={`gesture-badge-compact ${className}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '2px 8px',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 20,
          fontSize: 11,
          color: '#8a8a8a',
        }}
        title={gesture.description}
      >
        <span style={{ fontSize: 12 }}>{gesture.icon}</span>
        <span>{gesture.label}</span>
      </span>
    );
  }

  return (
    <motion.div
      className={`gesture-badge ${className}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        padding: '10px 14px',
        background: 'rgba(18,18,22,0.8)',
        border: '1px solid rgba(255,255,255,0.05)',
        borderRadius: 12,
        backdropFilter: 'blur(8px)',
        minWidth: 140,
      }}
    >
      <span style={{ fontSize: 24, lineHeight: 1 }}>{gesture.icon}</span>
      <span style={{ fontWeight: 600, fontSize: 13, color: '#e8e8e8' }}>
        {gesture.label}
      </span>
      <span style={{ fontSize: 10, color: '#627e84', letterSpacing: '0.05em' }}>
        {gesture.description}
      </span>
    </motion.div>
  );
}

/**
 * GestureLegend — Shows all active gesture mappings at once.
 */
export function GestureLegend() {
  const params = ['filter_cutoff', 'reverb_mix', 'delay_time', 'echo_feedback', 'drive', 'fx_preset'] as const;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
        gap: 8,
      }}
      role="list"
      aria-label="Gesture mappings"
    >
      {params.map((param) => (
        <GestureBadge key={param} param={param} compact />
      ))}
    </div>
  );
}