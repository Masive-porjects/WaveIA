"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Music4, RefreshCw } from "lucide-react";
import { useState } from "react";

/**
 * Qué track está sonando, y cómo cambiarlo.
 *
 * Hasta ahora la única salida para subir otro track vivía en el menú móvil y en
 * el panel de análisis, que está oculto por defecto: en escritorio no había
 * forma de cambiar de canción sin recargar.
 *
 * El botón pide confirmación porque cambiar de track descarta el master y los
 * ajustes actuales, y eso no se deshace.
 */

export interface TrackChipProps {
  /** Ruta del archivo original que devolvió el backend. */
  originalPath?: string | null;
  /** Género detectado por el análisis, si ya llegó. */
  genre?: string | null;
  disabled?: boolean;
  onChangeTrack: () => void;
}

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
};

/** El backend devuelve una ruta; al usuario le importa el nombre. */
function fileName(path?: string | null): string {
  if (!path) return "Tu track";
  const base = path.split(/[\\/]/).pop() ?? path;
  return base.replace(/\.[^.]+$/, "");
}

export default function TrackChip({
  originalPath,
  genre,
  disabled = false,
  onChangeTrack,
}: TrackChipProps) {
  const [confirming, setConfirming] = useState(false);
  const label = genre ? GENRE_LABELS[genre] : undefined;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.25, 0.1, 0.25, 1] }}
      className="flex items-center gap-2 rounded-full border px-3 py-1.5 backdrop-blur-xl"
      style={{
        background: "var(--bg-glass)",
        borderColor: "var(--border-subtle)",
      }}
    >
      <Music4
        size={13}
        strokeWidth={1.75}
        aria-hidden
        style={{ color: "var(--accent-primary)" }}
      />

      <span className="flex min-w-0 items-baseline gap-1.5">
        <span
          className="max-w-[10rem] truncate text-xs font-medium tracking-tight"
          style={{ color: "var(--text-primary)" }}
        >
          {fileName(originalPath)}
        </span>
        {label && (
          <span className="hidden text-[10px] sm:inline" style={{ color: "var(--text-muted)" }}>
            {label}
          </span>
        )}
      </span>

      <AnimatePresence mode="wait" initial={false}>
        {confirming ? (
          <motion.span
            key="confirm"
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: "auto" }}
            exit={{ opacity: 0, width: 0 }}
            transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
            className="flex shrink-0 items-center gap-1 overflow-hidden whitespace-nowrap"
          >
            <button
              type="button"
              onClick={onChangeTrack}
              className="rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors duration-200"
              style={{ background: "var(--accent-primary)", color: "var(--text-primary)" }}
            >
              Sí, cambiar
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-full px-2 py-0.5 text-[11px] transition-colors duration-200"
              style={{ color: "var(--text-muted)" }}
            >
              No
            </button>
          </motion.span>
        ) : (
          <motion.button
            key="change"
            type="button"
            disabled={disabled}
            onClick={() => setConfirming(true)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            whileHover={disabled ? undefined : { rotate: -35 }}
            transition={{ duration: 0.25 }}
            aria-label="Cambiar de track"
            title="Cambiar de track"
            className="flex size-6 shrink-0 items-center justify-center rounded-full transition-colors
              duration-300 disabled:opacity-30"
            style={{ color: "var(--text-muted)" }}
          >
            <RefreshCw size={13} strokeWidth={1.75} />
          </motion.button>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
