"use client";

import { motion } from "framer-motion";
import { Loader2, Mic, MicOff, Square, X } from "lucide-react";

/**
 * Boton de voz: se toca para empezar, se toca para enviar.
 *
 * No es mantener-apretado a proposito. Mantener se corta si el puntero sale
 * del boton, cansa en tomas largas y en movil pelea con el scroll. Tocar es
 * lo que hacen las interfaces de voz reales, y deja las manos libres para
 * hablar tranquilo.
 *
 * Mientras escucha se ve lo que va entendiendo, y hay una salida para
 * descartar sin enviar.
 */

export interface MicButtonProps {
  supported: boolean;
  listening: boolean;
  /** true mientras se transcribe lo grabado (motor Gemini). */
  transcribing?: boolean;
  disabled?: boolean;
  /** Texto parcial mientras habla. */
  transcript?: string;
  onToggle: () => void;
  onCancel?: () => void;
}

export default function MicButton({
  supported,
  listening,
  transcribing = false,
  disabled = false,
  transcript = "",
  onToggle,
  onCancel,
}: MicButtonProps) {
  const inactive = !supported || disabled || transcribing;

  return (
    <div className="flex items-stretch gap-2">
      <motion.button
        type="button"
        disabled={inactive}
        onClick={onToggle}
        whileTap={inactive ? undefined : { scale: 0.985 }}
        className="relative flex h-14 flex-1 select-none items-center justify-center gap-2.5
          overflow-hidden rounded-xl border px-4 text-sm font-medium tracking-tight
          backdrop-blur-xl transition-colors duration-300 disabled:cursor-not-allowed
          disabled:opacity-40"
        style={{
          background: listening ? "var(--surface-active)" : "var(--surface-hover)",
          borderColor: listening ? "var(--accent-primary)" : "var(--border-subtle)",
          color: listening ? "var(--accent-secondary)" : "var(--text-primary)",
        }}
        aria-pressed={listening}
        aria-label={listening ? "Enviar lo que dijiste" : "Empezar a hablar"}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{
            background:
              "linear-gradient(to right, transparent, rgba(255,255,255,0.3), transparent)",
          }}
        />

        {/* Respiracion mientras escucha. Se apaga con prefers-reduced-motion. */}
        {listening && (
          <motion.span
            aria-hidden
            className="absolute inset-0 motion-reduce:hidden"
            style={{ background: "var(--accent-primary)" }}
            initial={{ opacity: 0.05 }}
            animate={{ opacity: [0.05, 0.14, 0.05] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          />
        )}

        <span className="relative flex min-w-0 items-center gap-2.5">
          {!supported ? (
            <MicOff size={17} strokeWidth={1.75} />
          ) : transcribing ? (
            <Loader2 size={16} strokeWidth={1.75} className="animate-spin" />
          ) : listening ? (
            <Square size={15} strokeWidth={2} fill="currentColor" />
          ) : (
            <Mic size={17} strokeWidth={1.75} />
          )}

          <span className="truncate">
            {!supported
              ? "Tu navegador no soporta el micrófono"
              : transcribing
                ? "Entendiendo lo que dijiste…"
                : listening
                ? transcript || "Te escucho…"
                : "Tocá para hablar"}
          </span>
        </span>
      </motion.button>

      {listening && onCancel && (
        <motion.button
          type="button"
          initial={{ opacity: 0, width: 0 }}
          animate={{ opacity: 1, width: "3.5rem" }}
          exit={{ opacity: 0, width: 0 }}
          transition={{ duration: 0.25 }}
          onClick={onCancel}
          aria-label="Descartar"
          className="flex h-14 shrink-0 items-center justify-center rounded-xl border
            transition-colors duration-300 hover:border-[var(--border-hover)]"
          style={{
            background: "var(--surface-hover)",
            borderColor: "var(--border-subtle)",
            color: "var(--text-muted)",
          }}
        >
          <X size={16} strokeWidth={1.75} />
        </motion.button>
      )}
    </div>
  );
}
