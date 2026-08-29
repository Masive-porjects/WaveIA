"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, AlertTriangle } from "lucide-react";

interface ErrorModalProps {
  open: boolean;
  title: string;
  message: string;
  onClose: () => void;
}

/**
 * Centered glassmorphism error modal — same crystal style as ModuleSheet.
 * Shows a friendly title, descriptive message, and a close button.
 */
export default function ErrorModal({
  open,
  title,
  message,
  onClose,
}: ErrorModalProps) {
  /* Close on ESC */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="error-backdrop"
            className="fixed inset-0 z-[130] bg-black/60 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            onClick={onClose}
          />

          {/* Centered wrapper */}
          <div className="fixed inset-0 z-[140] flex items-center justify-center p-4 sm:p-8 pointer-events-none">
            <motion.div
              key="error-panel"
              role="alertdialog"
              aria-modal="true"
              aria-label={title}
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
              {/* Frosted highlight edge (crystal rim light) */}
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
              <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-white/[0.07] to-transparent" />

              {/* Content */}
              <div className="px-6 py-6 flex flex-col items-center text-center">
                {/* Icon */}
                <div
                  className="w-14 h-14 rounded-xl flex items-center justify-center mb-4"
                  style={{
                    background:
                      "linear-gradient(135deg, rgba(220,38,38,0.12) 0%, rgba(220,38,38,0.06) 100%)",
                    boxShadow: "0 4px 20px rgba(220,38,38,0.1)",
                  }}
                >
                  <AlertTriangle
                    size={26}
                    className="text-[var(--accent-error)]"
                  />
                </div>

                {/* Title */}
                <h2
                  className="text-lg font-semibold text-[var(--text-primary)] mb-2"
                  style={{ letterSpacing: "-0.02em" }}
                >
                  {title}
                </h2>

                {/* Message */}
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed max-w-xs">
                  {message}
                </p>

                {/* Close button */}
                <button
                  onClick={onClose}
                  className="mt-6 px-6 py-2.5 rounded-xl text-sm font-medium
                    transition-all duration-200
                    hover:brightness-110 active:scale-[0.98]"
                  style={{
                    background:
                      "linear-gradient(135deg, rgba(98,126,132,0.2), rgba(98,126,132,0.08))",
                    border: "1px solid rgba(98,126,132,0.25)",
                    color: "var(--accent-primary)",
                  }}
                >
                  Entendido
                </button>
              </div>

              {/* Close X (top-right) */}
              <button
                onClick={onClose}
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
