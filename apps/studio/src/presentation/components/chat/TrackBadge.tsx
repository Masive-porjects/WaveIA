"use client";

import { motion } from "framer-motion";

/**
 * Lo que el sistema escuchó del track, en el idioma del usuario.
 *
 * Es lo primero que ve al llegar al chat: demuestra que la app ya entendió algo
 * de su música antes de pedirle nada. Sin esto la pantalla arranca en frío.
 */

/** Los generos que devuelve el analizador de AudioMind. */
const GENRE_LABELS: Record<string, string> = {
  reggaeton: "reggaetón",
  hip_hop: "hip hop",
  electronic: "electrónica",
  acoustic: "acústico",
  classical: "clásica",
  metal: "metal",
  jazz: "jazz",
  pop: "pop",
  rock: "rock",
  other: "",
};

export interface TrackBadgeProps {
  genre?: string;
  tempoBpm?: number;
  durationSeconds?: number;
}

export default function TrackBadge({ genre, tempoBpm, durationSeconds }: TrackBadgeProps) {
  const label = genre ? (GENRE_LABELS[genre] ?? genre) : "";

  const facts: string[] = [];
  if (label) facts.push(label);
  if (tempoBpm) facts.push(`${Math.round(tempoBpm)} BPM`);
  if (durationSeconds) {
    const m = Math.floor(durationSeconds / 60);
    const s = Math.round(durationSeconds % 60);
    facts.push(`${m}:${String(s).padStart(2, "0")}`);
  }

  // Sin analisis todavia no hay nada honesto que mostrar.
  if (facts.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
      className="flex items-center gap-2"
    >
      <span
        aria-hidden
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: "var(--accent-primary)" }}
      />
      <span
        className="text-xs tracking-wide"
        style={{ color: "var(--accent-secondary)" }}
      >
        {facts.join(" · ")}
      </span>
    </motion.div>
  );
}
