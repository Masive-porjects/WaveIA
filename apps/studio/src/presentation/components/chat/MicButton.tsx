"use client";

import { motion } from "framer-motion";
import { Mic, MicOff } from "lucide-react";

/**
 * Botón de mantener-para-hablar.
 *
 * Es push-to-talk y no manos libres a propósito: la app reproduce audio, y con
 * el micrófono siempre abierto el master se cuela en la transcripción. Además
 * evita que el agente se escuche a sí mismo cuando responde con voz.
 */

export interface MicButtonProps {
  supported: boolean;
  listening: boolean;
  disabled?: boolean;
  onStart: () => void;
  onStop: () => void;
}

export default function MicButton({
  supported,
  listening,
  disabled = false,
  onStart,
  onStop,
}: MicButtonProps) {
  const inactive = !supported || disabled;

  return (
    <motion.button
      type="button"
      disabled={inactive}
      onPointerDown={onStart}
      onPointerUp={onStop}
      onPointerLeave={onStop}
      whileTap={inactive ? undefined : { scale: 0.97 }}
      className="relative flex h-14 w-full select-none items-center justify-center gap-2.5
        overflow-hidden rounded-xl border text-sm font-medium tracking-tight
        backdrop-blur-xl transition-colors duration-300 disabled:cursor-not-allowed
        disabled:opacity-40"
      style={{
        background: listening ? "var(--surface-active)" : "var(--surface-hover)",
        borderColor: listening ? "var(--accent-primary)" : "var(--border-subtle)",
        color: listening ? "var(--accent-secondary)" : "var(--text-primary)",
      }}
      aria-pressed={listening}
      aria-label={listening ? "Escuchando, soltá para enviar" : "Mantené apretado para hablar"}
    >
      <span
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background:
            "linear-gradient(to right, transparent, rgba(255,255,255,0.3), transparent)",
        }}
      />

      {/* Pulso de grabación. Se apaga con prefers-reduced-motion. */}
      {listening && (
        <motion.span
          aria-hidden
          className="absolute inset-0 motion-reduce:hidden"
          style={{ background: "var(--accent-primary)" }}
          initial={{ opacity: 0.05 }}
          animate={{ opacity: [0.05, 0.14, 0.05] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        />
      )}

      <span className="relative flex items-center gap-2.5">
        {supported ? <Mic size={17} strokeWidth={1.75} /> : <MicOff size={17} strokeWidth={1.75} />}
        {!supported
          ? "Tu navegador no soporta el micrófono"
          : listening
            ? "Escuchando… soltá para enviar"
            : "Mantené apretado para hablar"}
      </span>
    </motion.button>
  );
}
