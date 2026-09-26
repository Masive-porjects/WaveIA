"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Menu,
  X,
  Home as HomeIcon,
  SlidersHorizontal,
  Sparkles,
  Music2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Disc3,
  Pencil,
  Check,
} from "lucide-react";
import TrackChip from "@/presentation/components/TrackChip";
import LanguageSwitcher from "@/presentation/components/LanguageSwitcher";
import ThemeToggle from "@/presentation/components/ThemeToggle";
import { UserMenu } from "@/features/auth";
import { useTranslation } from "@/i18n/useTranslation";
import type { SessionData } from "@/lib/api";
import type { AutosaveStatus } from "../hooks/useAutosaveDraft";

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
  autosaveStatus?: AutosaveStatus;
  onOpenLibrary?: () => void;
  onConsolidate?: () => void;
  draftName?: string | null;
  onRenameDraft?: (newName: string) => void;
  hasSavedTracks?: boolean;
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
  autosaveStatus,
  onOpenLibrary,
  onConsolidate,
  draftName,
  onRenameDraft,
  hasSavedTracks = false,
}: MasteringHeaderProps) {
  const { t } = useTranslation();
  const [isEditingDraftName, setIsEditingDraftName] = useState(false);
  const [tempDraftName, setTempDraftName] = useState("");

  const handleSaveDraftName = () => {
    if (tempDraftName.trim() && tempDraftName.trim() !== draftName) {
      onRenameDraft?.(tempDraftName.trim());
    }
    setIsEditingDraftName(false);
  };

  return (
    <nav className="relative z-50 flex items-center justify-between px-4 lg:px-6 pt-safe py-3 shrink-0">
      <div className="flex items-center gap-2.5 flex-wrap">
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

        {/* Editable Draft Version Chip */}
        {currentView === "mastering" && session && (
          <div className="hidden sm:flex items-center gap-1 px-3 py-1 rounded-full text-xs border border-[var(--border-subtle)] bg-[var(--surface-elevated)] backdrop-blur-md">
            <span className="text-[var(--text-muted)] text-[10px] uppercase font-bold tracking-wider mr-1">
              Borrador:
            </span>
            {isEditingDraftName ? (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={tempDraftName}
                  onChange={(e) => setTempDraftName(e.target.value)}
                  onBlur={handleSaveDraftName}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveDraftName()}
                  autoFocus
                  className="bg-transparent border-b border-[var(--accent-primary)] text-xs text-[var(--text-primary)] focus:outline-none px-1 w-28"
                />
                <button
                  type="button"
                  onClick={handleSaveDraftName}
                  className="p-0.5 text-emerald-400 hover:text-white"
                >
                  <Check size={11} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setTempDraftName(draftName || "Mezcla Principal");
                  setIsEditingDraftName(true);
                }}
                title="Clic para renombrar este borrador"
                className="flex items-center gap-1.5 text-[var(--text-primary)] font-semibold hover:text-[var(--accent-primary)] transition-colors cursor-pointer"
              >
                <span className="truncate max-w-[130px]">
                  {draftName || "Mezcla Principal"}
                </span>
                <Pencil size={11} className="text-[var(--text-muted)]" />
              </button>
            )}
          </div>
        )}

        {/* Real-time Draft Autosave Indicator */}
        {currentView === "mastering" && autosaveStatus && autosaveStatus !== "idle" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium backdrop-blur-md transition-all select-none"
            style={{
              backgroundColor:
                autosaveStatus === "saved"
                  ? "rgba(16, 185, 129, 0.1)"
                  : autosaveStatus === "saving"
                    ? "rgba(98, 126, 132, 0.12)"
                    : "rgba(245, 158, 11, 0.12)",
              borderColor:
                autosaveStatus === "saved"
                  ? "rgba(16, 185, 129, 0.25)"
                  : autosaveStatus === "saving"
                    ? "rgba(98, 126, 132, 0.25)"
                    : "rgba(245, 158, 11, 0.25)",
              borderWidth: 1,
            }}
          >
            {autosaveStatus === "saving" ? (
              <>
                <Loader2 size={11} className="animate-spin text-[var(--accent-primary)]" />
                <span className="text-[var(--text-secondary)]">
                  {t("mastering.savingDraft", "Guardando borrador...")}
                </span>
              </>
            ) : autosaveStatus === "saved" ? (
              <>
                <CheckCircle2 size={11} className="text-emerald-400" />
                <span className="text-emerald-400 font-medium">
                  {t("mastering.draftSaved", "Borrador en nube")}
                </span>
              </>
            ) : (
              <>
                <AlertCircle size={11} className="text-amber-400" />
                <span className="text-amber-400">
                  {t("mastering.draftError", "Error al guardar")}
                </span>
              </>
            )}
          </motion.div>
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
        {currentView === "mastering" && onConsolidate && (
          <button
            type="button"
            onClick={onConsolidate}
            disabled={processing || loading}
            title={t("mastering.defineFinalMix", "Definir Mezcla Final")}
            aria-label={t("mastering.defineFinalMix", "Definir Mezcla Final")}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-emerald-500/40 hover:border-emerald-400 text-emerald-300 hover:text-white transition-all shadow-sm shadow-emerald-500/10 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Disc3 size={14} className="text-emerald-400" />
            <span className="hidden sm:inline">{t("mastering.defineFinalMix", "Definir Mezcla Final")}</span>
          </button>
        )}

        {onOpenLibrary && hasSavedTracks && (
          <button
            type="button"
            onClick={onOpenLibrary}
            title={t("nav.myTracks", "Mis Canciones")}
            aria-label={t("nav.myTracks", "Mis Canciones")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border border-[var(--border-subtle)] bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)] hover:border-[var(--accent-primary)] text-[var(--text-primary)] transition-all shadow-xs cursor-pointer"
          >
            <Music2 size={14} className="text-[var(--accent-primary)]" />
            <span className="hidden sm:inline">{t("nav.myTracks", "Mis Canciones")}</span>
          </button>
        )}

        <ThemeToggle />
        <LanguageSwitcher />
        <UserMenu onOpenLibrary={hasSavedTracks ? onOpenLibrary : undefined} />

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
