"use client";

import { motion } from "framer-motion";
import {
  Menu,
  X,
  Home as HomeIcon,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import TrackChip from "@/presentation/components/TrackChip";
import LanguageSwitcher from "@/presentation/components/LanguageSwitcher";
import ThemeToggle from "@/presentation/components/ThemeToggle";
import { UserMenu } from "@/features/auth";
import { useTranslation } from "@/i18n/useTranslation";
import type { SessionData } from "@/lib/api";

interface MasteringHeaderProps {
  currentView: "upload" | "mastering";
  session: SessionData | null;
  processing: boolean;
  loading: boolean;
  masteringMode: "manual" | "ai";
  setMasteringMode: (mode: "manual" | "ai") => void;
  onBackToUpload: () => void;
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
  onClearSheet?: () => void;
}

export default function MasteringHeader({
  currentView,
  session,
  processing,
  loading,
  masteringMode,
  setMasteringMode,
  onBackToUpload,
  mobileMenuOpen,
  setMobileMenuOpen,
  onClearSheet,
}: MasteringHeaderProps) {
  const { t } = useTranslation();

  return (
    <nav className="relative z-50 flex items-center justify-between px-4 lg:px-6 pt-safe py-3 shrink-0">
      <div className="flex items-center gap-2">
        <div className="rounded-full px-4 py-2 glass">
          <span className="text-base font-semibold tracking-tight text-[var(--text-primary)]">
            Wave<span className="text-[var(--accent-primary)]">IA</span>
          </span>
        </div>

        {currentView !== "upload" && session && (
          <TrackChip
            originalPath={session.original_path}
            genre={session.analysis?.detected_genre}
            disabled={processing || loading}
            onChangeTrack={onBackToUpload}
          />
        )}
      </div>

      {currentView === "mastering" && (
        <div
          className="z-10 flex shrink-0 items-center gap-1 rounded-2xl border p-1.5 shadow-[var(--shadow-card)] backdrop-blur-2xl lg:absolute lg:left-1/2 lg:-translate-x-1/2"
          style={{
            background: "var(--bg-glass-elevated)",
            borderColor: "var(--border-strong)",
          }}
          role="group"
          aria-label={t("nav.masteringModeAria", "Elige cómo quieres masterizar")}
        >
          {([
            {
              id: "manual",
              label: t("nav.manualMode", "Manual"),
              description: t("nav.manualDesc", "Control total"),
              icon: SlidersHorizontal,
            },
            {
              id: "ai",
              label: t("nav.aiMode", "Asistente IA"),
              description: t("nav.aiDesc", "Recomendaciones"),
              icon: Sparkles,
            },
          ] as const).map(({ id, label, description, icon: Icon }) => {
            const active = masteringMode === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setMasteringMode(id);
                  if (id === "ai") onClearSheet?.();
                }}
                className="group relative flex min-h-10 items-center gap-2 rounded-xl border px-3 py-2 text-left transition-[border-color,color] duration-300 md:min-w-36 lg:min-w-44 lg:px-4"
                style={{
                  background: active ? "transparent" : "var(--surface-hover)",
                  borderColor: active ? "var(--accent-primary)" : "transparent",
                  color: active ? "var(--text-primary)" : "var(--text-secondary)",
                  boxShadow: active ? "none" : "inset 0 1px 0 rgba(255,255,255,0.04)",
                }}
              >
                {active && (
                  <motion.span
                    layoutId="mastering-mode-pill"
                    aria-hidden
                    className="absolute inset-0 -z-10 rounded-xl"
                    style={{
                      background:
                        "color-mix(in srgb, var(--accent-primary) 22%, var(--bg-elevated))",
                      boxShadow:
                        "inset 0 1px 0 rgba(255,255,255,0.14), 0 0 20px rgba(98,126,132,0.2)",
                    }}
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}

                <span
                  className="flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors duration-300"
                  style={{
                    background: active ? "var(--accent-primary)" : "var(--surface-active)",
                    color: active ? "var(--text-primary)" : "var(--text-secondary)",
                  }}
                >
                  <Icon size={15} strokeWidth={2} aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block whitespace-nowrap text-xs font-semibold tracking-tight lg:text-sm">
                    {id === "ai" ? (
                      <>
                        <span className="md:hidden">IA</span>
                        <span className="hidden md:inline">{label}</span>
                      </>
                    ) : (
                      label
                    )}
                  </span>
                  <span className="mt-0.5 hidden whitespace-nowrap text-[9px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)] lg:block">
                    {description}
                  </span>
                </span>
                {active && (
                  <span
                    className="absolute right-2 top-2 size-1.5 rounded-full bg-[var(--accent-secondary)] shadow-[0_0_8px_rgba(130,156,161,0.8)]"
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-2">
        <ThemeToggle />
        <LanguageSwitcher />
        <UserMenu />

        {currentView === "mastering" && (
          <button
            onClick={onBackToUpload}
            title={t("nav.home", "Inicio")}
            aria-label={t("nav.home", "Inicio")}
            className="hidden rounded-full w-9 h-9 md:flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-all"
          >
            <HomeIcon size={18} />
          </button>
        )}

        <button
          className="lg:hidden rounded-full w-9 h-9 flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-all"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          <span
            className="transition-transform duration-300 inline-flex"
            style={{ transform: mobileMenuOpen ? "rotate(180deg)" : "rotate(0deg)" }}
          >
            {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </span>
        </button>
      </div>
    </nav>
  );
}
