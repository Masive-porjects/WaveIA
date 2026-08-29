"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";

import { PRESET_INFO } from "@/core/presets";

/**
 * Los 3 presets que el agente recomienda, del mas al menos recomendado.
 *
 * El primero se marca como la apuesta del agente, pero los tres se ven igual de
 * clickeables: el usuario compara y elige, no obedece. Por eso el prompt exige
 * que el segundo y el tercero sean alternativas reales y no variaciones.
 */

export interface Recommendation {
  presetId: string;
  why: string;
}

export interface PresetCardsProps {
  recommendations: Recommendation[];
  /** Preset elegido por el usuario, si ya eligió alguno. */
  selected?: string | null;
  onSelect?: (presetId: string) => void;
}

export default function PresetCards({
  recommendations,
  selected,
  onSelect,
}: PresetCardsProps) {
  if (recommendations.length === 0) return null;

  return (
    <ul className="flex flex-col gap-2" aria-label="Presets recomendados">
      {recommendations.map((rec, i) => {
        const info = PRESET_INFO[rec.presetId];
        if (!info) return null; // preset desconocido: no rompemos la UI por eso
        const isSelected = selected === rec.presetId;
        const isTop = i === 0;

        return (
          <motion.li
            key={rec.presetId}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.45, delay: i * 0.04, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <motion.button
              type="button"
              onClick={() => onSelect?.(rec.presetId)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              transition={{ duration: 0.35 }}
              aria-pressed={isSelected}
              className="flex w-full items-start gap-3 rounded-xl border p-3 text-left
                backdrop-blur-xl transition-colors duration-300"
              style={{
                background: isSelected ? "var(--surface-active)" : "var(--surface-hover)",
                borderColor: isSelected
                  ? info.color
                  : isTop
                    ? `color-mix(in srgb, ${info.color} 35%, transparent)`
                    : "var(--border-subtle)",
              }}
            >
              <span
                aria-hidden
                className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: info.color }}
              />

              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span
                    className="text-sm font-medium tracking-tight"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {info.title}
                  </span>
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {info.genre}
                  </span>
                  {isTop && !isSelected && (
                    <span
                      className="ml-auto shrink-0 text-[10px] uppercase tracking-wider"
                      style={{ color: info.color }}
                    >
                      sugerido
                    </span>
                  )}
                </span>
                <span
                  className="mt-1 block text-xs leading-relaxed"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {rec.why}
                </span>
              </span>

              {isSelected && (
                <Check size={15} strokeWidth={2} style={{ color: info.color }} className="mt-1" />
              )}
            </motion.button>
          </motion.li>
        );
      })}
    </ul>
  );
}
