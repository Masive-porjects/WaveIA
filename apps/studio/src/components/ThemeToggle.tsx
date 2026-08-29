"use client";

import { useState, useEffect, useCallback, useId } from "react";
import { motion, AnimatePresence } from "framer-motion";

const THEME_KEY = "brikmaster-theme";

type Theme = "dark" | "light";

/* ── Ghost (Mente y Alma) ────────────────────────────── */

export function GhostIcon({ size = 18 }: { size?: number }) {
  const maskId = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <mask id={maskId}>
          <rect width="24" height="24" fill="white" />
          <circle cx="9" cy="10" r="1.6" fill="black" />
          <circle cx="15" cy="10" r="1.6" fill="black" />
          <rect x="10.4" y="13" width="3.2" height="2.4" rx="1.2" fill="black" />
        </mask>
      </defs>
      <path
        d="M2 12a10 10 0 0 1 20 0v10l-2 1.5-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5z"
        fill="currentColor"
        mask={`url(#${maskId})`}
      />
    </svg>
  );
}

/* ── Music note (dark — estudio) ─────────────────────── */

function MusicNote({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  );
}

/* ── AI spark (light — dev) ──────────────────────────── */

function AISpark({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 3c.3 4 1.7 5.7 6 6-4 .3-5.7 1.7-6 6-.3-4-1.7-5.7-6-6 4-.3 5.7-1.7 6-6z" />
    </svg>
  );
}

/* ── Toggle ──────────────────────────────────────────── */

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  // The anti-FOUC script in layout.tsx already set data-theme
  // before hydration — sync state with it once mounted.
  useEffect(() => {
    const syncTimer = setTimeout(() => {
      const current = document.documentElement.dataset.theme;
      setTheme(current === "light" ? "light" : "dark");
    }, 0);
    return () => clearTimeout(syncTimer);
  }, []);

  const handleToggle = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {
        // Private mode — theme still applies for this session
      }
      return next;
    });
  }, []);

  const isDark = theme === "dark";

  return (
    <button
      onClick={handleToggle}
      className="relative w-10 h-10 rounded-full flex items-center justify-center shrink-0
        bg-[var(--bg-glass)] backdrop-blur-xl
        border border-[var(--border-subtle)] hover:border-[var(--border-strong)]
        text-[var(--accent-primary)]
        transition-all duration-200 hover:brightness-110 active:scale-95"
      aria-label={isDark ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
      title={isDark ? "Modo estudio" : "Modo dev"}
    >
      {/* Ambient float + playful pop on theme change */}
      <motion.span
        className="flex"
        animate={{ y: [0, -1.2, 0] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={theme}
            className="flex"
            initial={{ y: 4, opacity: 0, rotate: -14, scale: 0.6 }}
            animate={{ y: 0, opacity: 1, rotate: 0, scale: 1 }}
            exit={{ y: -6, opacity: 0, rotate: 14, scale: 0.5 }}
            transition={{ type: "spring", stiffness: 320, damping: 16 }}
          >
            <GhostIcon size={18} />
          </motion.span>
        </AnimatePresence>
      </motion.span>

      {/* Badge: music note (dark) / AI spark (light) */}
      <span
        className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center
          bg-[var(--bg-glass-elevated)] border border-[var(--border-strong)]
          text-[var(--accent-primary)]"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={theme}
            initial={{ opacity: 0, rotate: -50, scale: 0.4 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, rotate: 50, scale: 0.4 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="flex"
          >
            {isDark ? <MusicNote size={12} /> : <AISpark size={12} />}
          </motion.span>
        </AnimatePresence>
      </span>
    </button>
  );
}
