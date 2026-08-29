"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { X } from "lucide-react";

interface ModuleSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

/* ── Module Modal (centered crystal glass) ─────────────
   Half-screen glass panel replaced by a centered modal
   with pronounced glassmorphism: heavy blur, saturation,
   frosted highlight edge. Opens when a module tab is
   clicked; closes via backdrop, ESC, or the X button. */

export default function ModuleSheet({
  open,
  onClose,
  title,
  subtitle,
  children,
}: ModuleSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  /* Close on ESC */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  /* ── Entrance: curtain reveal + sequenced content ──
     Replaces the plain opacity/scale spring. The panel
     uncovers like a curtain (clip-path), then the header
     drops in, then the content follows. ModulePanel already
     staggers its own preset cards, so the content is
     revealed as one block to avoid double-stagger. Framer
     keeps the exit (AnimatePresence). */
  useGSAP(
    () => {
      const panel = panelRef.current;
      const header = headerRef.current;
      const content = contentRef.current;
      if (!panel || !header || !content) return;
      if (!open) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return;
      }

      const tl = gsap.timeline();
      tl.fromTo(
        panel,
        { clipPath: "inset(0 0 100% 0)" },
        { clipPath: "inset(0 0 0% 0)", duration: 0.55, ease: "power3.inOut" },
      )
        .fromTo(
          header,
          { y: 12, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 0.4,
            ease: "power2.out",
            clearProps: "y,opacity",
          },
          "-=0.25",
        )
        .fromTo(
          content,
          { y: 16, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 0.45,
            ease: "power2.out",
            clearProps: "y,opacity",
          },
          "-=0.2",
        );
    },
    { dependencies: [open] },
  );

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="modal-backdrop"
            className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            onClick={onClose}
          />

          {/* Centered wrapper — pointer-events-none so the
              backdrop catches clicks outside the panel */}
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-8 pointer-events-none">
            <motion.div
              key="modal-panel"
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-label={title}
              className="pointer-events-auto relative w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden rounded-2xl
                border shadow-[var(--shadow-heavy)]
                backdrop-blur-2xl backdrop-saturate-150"
              style={{
                background: "var(--bg-glass-elevated)",
                borderColor: "var(--border-strong)",
              }}
              initial={false}
              exit={{ opacity: 0, scale: 0.96, y: 10, transition: { duration: 0.2, ease: "easeOut" } }}
            >
              {/* Frosted highlight edge (crystal rim light) */}
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
              <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-white/[0.07] to-transparent" />

              {/* Header */}
              <div
                ref={headerRef}
                className="relative shrink-0 flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)]"
              >
                <div>
                  <h2
                    className="text-base font-semibold text-[var(--text-primary)]"
                    style={{ letterSpacing: "-0.02em" }}
                  >
                    {title}
                  </h2>
                  {subtitle && (
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">{subtitle}</p>
                  )}
                </div>
                <button
                  onClick={onClose}
                  aria-label="Cerrar panel"
                  className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--text-secondary)]
                    hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-all"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Content */}
              <div ref={contentRef} className="relative flex-1 overflow-y-auto px-6 py-5">{children}</div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
