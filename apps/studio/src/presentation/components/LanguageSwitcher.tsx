"use client";

import React from "react";
import { useTranslation, type Locale } from "@/i18n/useTranslation";
import { Globe } from "lucide-react";

interface LanguageSwitcherProps {
  compact?: boolean;
  className?: string;
}

export default function LanguageSwitcher({
  compact = false,
  className = "",
}: LanguageSwitcherProps) {
  const { locale, setLocale, t } = useTranslation();

  const handleToggle = (lang: Locale) => {
    if (lang !== locale) {
      setLocale(lang);
    }
  };

  return (
    <div
      role="group"
      aria-label={t("common.language")}
      className={`inline-flex items-center gap-1 rounded-full p-1 transition-all ${className}`}
      style={{
        background: "var(--bg-tertiary)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      {!compact && (
        <Globe
          size={13}
          className="ml-1.5 opacity-60"
          style={{ color: "var(--text-secondary)" }}
        />
      )}
      <button
        type="button"
        onClick={() => handleToggle("es")}
        className="rounded-full px-2.5 py-0.5 text-xs font-medium transition-all"
        style={{
          background: locale === "es" ? "var(--bg-elevated)" : "transparent",
          color: locale === "es" ? "#00d4aa" : "var(--text-secondary)",
          border: locale === "es" ? "1px solid rgba(0, 212, 170, 0.25)" : "1px solid transparent",
          boxShadow: locale === "es" ? "0 1px 4px rgba(0, 212, 170, 0.15)" : "none",
        }}
        title="Español"
      >
        ES
      </button>
      <button
        type="button"
        onClick={() => handleToggle("en")}
        className="rounded-full px-2.5 py-0.5 text-xs font-medium transition-all"
        style={{
          background: locale === "en" ? "var(--bg-elevated)" : "transparent",
          color: locale === "en" ? "#00d4aa" : "var(--text-secondary)",
          border: locale === "en" ? "1px solid rgba(0, 212, 170, 0.25)" : "1px solid transparent",
          boxShadow: locale === "en" ? "0 1px 4px rgba(0, 212, 170, 0.15)" : "none",
        }}
        title="English"
      >
        EN
      </button>
    </div>
  );
}
