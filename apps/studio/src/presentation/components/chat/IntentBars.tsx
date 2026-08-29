"use client";

import { motion } from "framer-motion";

/**
 * Los nueve ejes del IntentProfile como medidores.
 *
 * 0.5 es el centro y significa "sin cambios", asi que la barra se dibuja desde
 * el centro hacia afuera: lo que el usuario tiene que leer de un vistazo no es
 * el valor absoluto sino cuanto y hacia donde se movio.
 */

export const AXES = [
  "warmth",
  "punch",
  "clarity",
  "brightness",
  "width",
  "bass_weight",
  "vocal_focus",
  "vintage",
  "loudness",
] as const;

export type Axis = (typeof AXES)[number];

const LABELS: Record<Axis, string> = {
  warmth: "Calidez",
  punch: "Pegada",
  clarity: "Claridad",
  brightness: "Brillo",
  width: "Amplitud",
  bass_weight: "Graves",
  vocal_focus: "Voz",
  vintage: "Vintage",
  loudness: "Volumen",
};

export interface IntentBarsProps {
  profile: Record<string, number | string>;
  /** Ejes que cambiaron en el último turno: se resaltan. */
  changed?: string[];
}

export default function IntentBars({ profile, changed = [] }: IntentBarsProps) {
  return (
    <ul className="flex flex-col gap-2.5" aria-label="Perfil de intención">
      {AXES.map((axis) => {
        const value = Number(profile[axis] ?? 0.5);
        const offset = value - 0.5;
        const isChanged = changed.includes(axis);
        const isNeutral = Math.abs(offset) < 0.01;

        return (
          <li key={axis} className="flex items-center gap-3 text-xs">
            <span
              className="w-20 shrink-0 tracking-tight"
              style={{ color: isChanged ? "var(--accent-secondary)" : "var(--text-secondary)" }}
            >
              {LABELS[axis]}
            </span>

            <span
              className="relative h-1.5 flex-1 overflow-hidden rounded-full"
              style={{ background: "var(--knob-track)" }}
              role="meter"
              aria-valuenow={value}
              aria-valuemin={0}
              aria-valuemax={1}
              aria-label={LABELS[axis]}
            >
              {/* Marca del centro: la referencia de "sin cambios". */}
              <span
                className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2"
                style={{ background: "var(--border-strong)" }}
              />
              <motion.span
                className="absolute inset-y-0 rounded-full"
                style={{
                  background: isChanged ? "var(--knob-fill)" : "var(--text-muted)",
                  left: offset >= 0 ? "50%" : undefined,
                  right: offset < 0 ? "50%" : undefined,
                }}
                initial={false}
                animate={{ width: `${Math.abs(offset) * 100}%` }}
                transition={{ duration: 0.45, ease: [0.25, 0.1, 0.25, 1] }}
              />
            </span>

            <span
              className="w-9 shrink-0 text-right tabular-nums"
              style={{ color: isNeutral ? "var(--text-muted)" : "var(--text-primary)" }}
            >
              {value.toFixed(2)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
