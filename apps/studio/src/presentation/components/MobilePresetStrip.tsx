"use client";

import { useRef } from "react";
import { motion } from "framer-motion";
import { PRESET_COLORS, DEFAULT_PRESET_COLOR } from "@/lib/presets";
import { type MasteringParameters, DEFAULT_PARAMS } from "@/lib/api";
import {
  Sparkles,
  Flame,
  Sun,
  AudioLines,
  Leaf,
  Orbit,
  Music2,
  Zap,
} from "lucide-react";

interface MobilePresetStripProps {
  activePresetId: string | null;
  onSelect: (params: MasteringParameters, presetId: string) => void;
  disabled?: boolean;
}

interface PresetItem {
  id: string;
  title: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  params: MasteringParameters;
}

const PRESETS: PresetItem[] = [
  { id: "universal", title: "Pulido", icon: Sparkles, params: { ...DEFAULT_PARAMS } },
  {
    id: "fuego", title: "Brutal", icon: Flame,
    params: { ...DEFAULT_PARAMS, compression_ratio: 5.0, transient_boost_db: 3.0, saturation_drive_db: 2.0, limiter_ceiling_db: -0.3 },
  },
  {
    id: "claridad", title: "Cristalino", icon: Sun,
    params: { ...DEFAULT_PARAMS, clarity_wet: 0.35, clarity_brightness_db: 4.0, compression_ratio: 2.0, transient_boost_db: 2.0, stereo_width: 1.3, haas_delay_ms: 6 },
  },
  {
    id: "cinta", title: "Vintage", icon: AudioLines,
    params: { ...DEFAULT_PARAMS, saturation_drive_db: 3.0, saturation_warmth_db: 4.0, compression_ratio: 2.0, limiter_ceiling_db: -1.5, clarity_brightness_db: -0.5 },
  },
  {
    id: "natural", title: "Crudo", icon: Leaf,
    params: { ...DEFAULT_PARAMS, compression_ratio: 1.5, limiter_ceiling_db: -2.0, clarity_wet: 0.05 },
  },
  {
    id: "espacial", title: "Envolvente", icon: Orbit,
    params: { ...DEFAULT_PARAMS, stereo_width: 1.8, haas_delay_ms: 15, clarity_brightness_db: 2.0, clarity_wet: 0.3, compression_ratio: 2.0 },
  },
  {
    id: "cinematico", title: "Épico", icon: Music2,
    params: { ...DEFAULT_PARAMS, stereo_width: 1.6, haas_delay_ms: 12, clarity_brightness_db: 2.5, saturation_warmth_db: 2.5, compression_ratio: 2.5, transient_boost_db: 2.5 },
  },
  {
    id: "empuje", title: "Muro", icon: Zap,
    params: { ...DEFAULT_PARAMS, compression_ratio: 8.0, limiter_ceiling_db: -0.1, transient_boost_db: 4.0, saturation_drive_db: 4.0 },
  },
];

/**
 * Horizontal scrollable preset strip for mobile.
 * Compact cards with icon + title, scrollable on X axis.
 */
export default function MobilePresetStrip({
  activePresetId,
  onSelect,
  disabled,
}: MobilePresetStripProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 mb-2 px-1">
        <span className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-widest">
          Elegí un preset
        </span>
        {activePresetId && (
          <span
            className="text-[10px] font-medium px-2 py-0.5 rounded-full"
            style={{
              background: `color-mix(in srgb, ${PRESET_COLORS[activePresetId]?.wave ?? DEFAULT_PRESET_COLOR.wave} 15%, transparent)`,
              color: PRESET_COLORS[activePresetId]?.wave ?? DEFAULT_PRESET_COLOR.wave,
            }}
          >
            {PRESETS.find((p) => p.id === activePresetId)?.title}
          </span>
        )}
      </div>

      <div
        ref={scrollRef}
        className="flex gap-2 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {PRESETS.map((preset) => {
          const active = activePresetId === preset.id;
          const color = PRESET_COLORS[preset.id]?.wave ?? DEFAULT_PRESET_COLOR.wave;
          const Icon = preset.icon;

          return (
            <motion.button
              key={preset.id}
              onClick={() => !disabled && onSelect(preset.params, preset.id)}
              disabled={disabled}
              whileTap={{ scale: 0.95 }}
              className="flex-shrink-0 flex flex-col items-center gap-1.5 p-3 rounded-xl
                snap-start transition-all duration-200
                disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                minWidth: 72,
                background: active
                  ? `color-mix(in srgb, ${color} 12%, transparent)`
                  : "var(--bg-glass)",
                border: active
                  ? `1.5px solid ${color}`
                  : "1px solid var(--border-subtle)",
                boxShadow: active
                  ? `0 0 12px ${color}20`
                  : "none",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
              }}
            >
              <span style={{ color: active ? color : "var(--text-secondary)" }}>
                <Icon size={18} />
              </span>
              <span
                className="text-[10px] font-medium leading-tight text-center"
                style={{ color: active ? color : "var(--text-secondary)" }}
              >
                {preset.title}
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
