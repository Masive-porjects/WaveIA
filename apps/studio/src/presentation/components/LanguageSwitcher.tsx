"use client";

import React, { useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Globe } from "lucide-react";
import { useTranslation, type Locale } from "@/i18n/useTranslation";

interface LanguageSwitcherProps {
  className?: string;
  compact?: boolean;
}

export default function LanguageSwitcher({
  className = "",
}: LanguageSwitcherProps) {
  const { locale, setLocale, isEs } = useTranslation();

  const toggleLanguage = useCallback(() => {
    const next: Locale = isEs ? "en" : "es";
    setLocale(next);
  }, [isEs, setLocale]);

  const label = isEs
    ? "Cambiar a idioma inglés (EN)"
    : "Switch to Spanish language (ES)";

  const title = isEs
    ? "Idioma: Español (Clic para English)"
    : "Language: English (Click for Español)";

  return (
    <button
      type="button"
      onClick={toggleLanguage}
      className={`relative w-9 h-9 rounded-full flex items-center justify-center shrink-0
        bg-[var(--bg-glass)] backdrop-blur-xl
        border border-[var(--border-subtle)] hover:border-[var(--border-strong)]
        text-[var(--accent-primary)]
        transition-all duration-200 hover:brightness-110 active:scale-95 ${className}`}
      aria-label={label}
      title={title}
    >
      {/* Ambient float + playful pop on locale change */}
      <motion.span
        className="flex"
        animate={{ y: [0, -1.2, 0] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={locale}
            className="flex items-center justify-center"
            initial={{ y: 4, opacity: 0, rotate: -25, scale: 0.6 }}
            animate={{ y: 0, opacity: 1, rotate: 0, scale: 1 }}
            exit={{ y: -6, opacity: 0, rotate: 25, scale: 0.5 }}
            transition={{ type: "spring", stiffness: 320, damping: 16 }}
          >
            <Globe size={18} strokeWidth={2} />
          </motion.span>
        </AnimatePresence>
      </motion.span>

      {/* Badge: ES (Spanish) / EN (English) */}
      <span
        className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center
          bg-[var(--bg-glass-elevated)] border border-[var(--border-strong)]
          text-[var(--accent-primary)] text-[8.5px] font-bold tracking-tight shadow-sm select-none"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={locale}
            initial={{ opacity: 0, rotate: -50, scale: 0.4 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, rotate: 50, scale: 0.4 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="flex items-center justify-center"
          >
            {locale.toUpperCase()}
          </motion.span>
        </AnimatePresence>
      </span>
    </button>
  );
}
