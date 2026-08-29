"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, ShieldAlert, X } from "lucide-react";

interface OverMasterWarningProps {
  open: boolean;
  confidence: number; // 0.0 – 1.0
  onConfirm: () => void; // "Procesar de todas formas"
  onCancel: () => void; // Volver atrás
}

/**
 * Prominent warning modal shown when the analysis detects the uploaded
 * audio is already mastered. Warns about over-mastering risk and asks
 * the user to confirm before proceeding.
 */
export default function OverMasterWarning({
  open,
  confidence,
  onConfirm,
  onCancel,
}: OverMasterWarningProps) {
  /* Close on ESC → cancel */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  const pct = Math.round(confidence * 100);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="overmaster-backdrop"
            className="fixed inset-0 z-[130] bg-black/60 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            onClick={onCancel}
          />

          {/* Centered wrapper */}
          <div className="fixed inset-0 z-[140] flex items-center justify-center p-4 sm:p-8 pointer-events-none">
            <motion.div
              key="overmaster-panel"
              role="alertdialog"
              aria-modal="true"
              aria-label="Advertencia de sobremasterización"
              className="pointer-events-auto relative w-full max-w-md flex flex-col overflow-hidden rounded-2xl
                border shadow-[var(--shadow-heavy)]
                backdrop-blur-2xl backdrop-saturate-150"
              style={{
                background: "var(--bg-glass-elevated)",
                borderColor: "var(--border-strong)",
              }}
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              {/* Frosted highlight edge */}
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
              <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-white/[0.07] to-transparent" />

              {/* Content */}
              <div className="px-6 py-6 flex flex-col items-center text-center">
                {/* Icon */}
                <div
                  className="w-14 h-14 rounded-xl flex items-center justify-center mb-4"
                  style={{
                    background:
                      "linear-gradient(135deg, rgba(255,159,10,0.15) 0%, rgba(255,159,10,0.06) 100%)",
                    boxShadow: "0 4px 20px rgba(255,159,10,0.12)",
                  }}
                >
                  <ShieldAlert size={28} className="text-amber-400" />
                </div>

                {/* Title */}
                <h2
                  className="text-lg font-semibold text-[var(--text-primary)] mb-2"
                  style={{ letterSpacing: "-0.02em" }}
                >
                  Este audio ya cuenta con mastering
                </h2>

                {/* Confidence badge */}
                <div
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium mb-3"
                  style={{
                    background: "rgba(255,159,10,0.1)",
                    border: "1px solid rgba(255,159,10,0.25)",
                    color: "#fbbf24",
                  }}
                >
                  <AlertTriangle size={12} />
                  {pct}% de confianza en la detección
                </div>

                {/* Message */}
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed max-w-xs mb-1">
                  Procesarlo de nuevo puede causar{" "}
                  <span className="font-medium text-amber-400">
                    sobremasterización
                  </span>
                  : compresión excesiva, pérdida de dinámica y distorsión no
                  deseada.
                </p>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed max-w-xs">
                  Si decidís continuar, se aplicará una cadena reducida al 80%
                  para preservar la calidad original.
                </p>

                {/* Actions */}
                <div className="flex gap-3 mt-6 w-full max-w-xs">
                  <button
                    onClick={onCancel}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium
                      transition-all duration-200 hover:bg-[var(--surface-hover)] active:scale-[0.98]"
                    style={{
                      border: "1px solid var(--border-subtle)",
                      color: "var(--text-secondary)",
                      backdropFilter: "blur(8px)",
                      WebkitBackdropFilter: "blur(8px)",
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={onConfirm}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium
                      transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
                    style={{
                      background:
                        "linear-gradient(135deg, rgba(255,159,10,0.25), rgba(255,159,10,0.1))",
                      border: "1px solid rgba(255,159,10,0.35)",
                      color: "#fbbf24",
                    }}
                  >
                    Procesar de todas formas
                  </button>
                </div>
              </div>

              {/* Close X */}
              <button
                onClick={onCancel}
                aria-label="Cerrar"
                className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center
                  text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]
                  transition-all"
              >
                <X size={16} />
              </button>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
