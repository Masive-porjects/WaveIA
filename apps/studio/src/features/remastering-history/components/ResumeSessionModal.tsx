"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  Music2,
  Sparkles,
  CheckCircle2,
  Clock,
  ArrowRight,
  PlusCircle,
  FolderOpen,
  Radio,
  Sliders,
} from "lucide-react";
import { useTranslation } from "@/i18n/useTranslation";
import { useAuth } from "@/features/auth";
import type { Track } from "@/features/tracks";

interface ResumeSessionModalProps {
  isOpen: boolean;
  track: Track | null;
  onContinue: (track: Track) => void;
  onNewTrack: () => void;
  onOpenLibrary: () => void;
  isLoading?: boolean;
}

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "--:--";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

export default function ResumeSessionModal({
  isOpen,
  track,
  onContinue,
  onNewTrack,
  onOpenLibrary,
  isLoading = false,
}: ResumeSessionModalProps) {
  const { t } = useTranslation();
  const { user, profile } = useAuth();

  if (!isOpen || !track) return null;

  const displayName =
    profile?.display_name ||
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split("@")[0] ||
    "Productor";

  const hasDraft = !!track.draft_parameters;
  const hasMasters = track.masters && track.masters.length > 0;
  const isMastered = track.status === "completed" || hasMasters;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-2xl bg-black/70"
        role="dialog"
        aria-modal="true"
        aria-labelledby="resume-modal-title"
      >
        <motion.div
          initial={{ scale: 0.94, opacity: 0, y: 16 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.94, opacity: 0, y: 16 }}
          transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
          className="relative flex flex-col w-full max-w-lg rounded-3xl border shadow-2xl overflow-hidden p-6 sm:p-7"
          style={{
            background: "var(--bg-glass-elevated)",
            borderColor: "var(--border-strong)",
            boxShadow:
              "0 32px 80px -10px rgba(0, 0, 0, 0.9), inset 0 1px 0 rgba(255, 255, 255, 0.08)",
          }}
        >
          {/* Subtle Ambient Glow behind card */}
          <div
            className="absolute -top-24 -left-24 size-56 rounded-full blur-3xl pointer-events-none opacity-20"
            style={{ background: "var(--accent-primary)" }}
          />

          {/* Header */}
          <div className="flex items-center gap-3.5 mb-5">
            <div className="size-12 rounded-2xl flex items-center justify-center bg-[var(--accent-primary)]/15 border border-[var(--accent-primary)]/30 text-[var(--accent-primary)] shadow-md">
              <Sliders size={22} />
            </div>
            <div>
              <h2
                id="resume-modal-title"
                className="text-lg font-bold tracking-tight text-[var(--text-primary)]"
              >
                {t("resume.title", `¡Hola, ${displayName}!`)}
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                {t("resume.subtitle", "¿Deseas continuar trabajando en tu última producción?")}
              </p>
            </div>
          </div>

          {/* Active Track Highlight Card */}
          <div
            className="relative flex flex-col gap-3 p-4 rounded-2xl border mb-6 bg-[var(--surface-elevated)] border-[var(--border-subtle)] hover:border-[var(--accent-primary)]/40 transition-all shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="size-10 rounded-xl flex items-center justify-center shrink-0 bg-[var(--surface-hover)] border border-[var(--border-subtle)] text-[var(--accent-primary)]">
                  {isMastered ? (
                    <CheckCircle2 size={18} className="text-emerald-400" />
                  ) : hasDraft ? (
                    <Sparkles size={18} className="text-amber-400" />
                  ) : (
                    <Radio size={18} />
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-[var(--text-primary)] truncate">
                    {track.title}
                  </h3>
                  <p className="text-[11px] text-[var(--text-muted)] truncate">
                    {track.original_filename}
                  </p>
                </div>
              </div>

              {/* Status Badge */}
              {hasDraft ? (
                <span className="shrink-0 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 border border-amber-500/30 text-amber-400">
                  <Sparkles size={11} />
                  <span>{t("resume.draftBadge", "Borrador activo")}</span>
                </span>
              ) : isMastered ? (
                <span className="shrink-0 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                  <CheckCircle2 size={11} />
                  <span>{t("resume.masteredBadge", "Master listo")}</span>
                </span>
              ) : null}
            </div>

            {/* Track Specs */}
            <div className="flex items-center gap-2 pt-2 border-t border-[var(--border-subtle)] text-[11px] text-[var(--text-secondary)]">
              <span className="inline-flex items-center gap-1">
                <Clock size={11} className="text-[var(--text-muted)]" />
                {formatDuration(track.duration_seconds)}
              </span>
              <span>•</span>
              {track.sample_rate && (
                <>
                  <span>{(track.sample_rate / 1000).toFixed(1)} kHz</span>
                  <span>•</span>
                </>
              )}
              {track.active_preset && (
                <>
                  <span className="text-[var(--accent-primary)] font-medium">
                    Preset: {track.active_preset}
                  </span>
                  <span>•</span>
                </>
              )}
              <span className="text-[var(--text-muted)]">{formatDate(track.updated_at)}</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-2.5">
            {/* Primary: Continue Last Project */}
            <button
              type="button"
              onClick={() => onContinue(track)}
              disabled={isLoading}
              className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-2xl text-xs font-bold bg-[var(--accent-primary)] text-white hover:brightness-110 active:scale-[0.99] transition-all shadow-lg shadow-[var(--accent-primary)]/20 cursor-pointer disabled:opacity-50"
            >
              <Music2 size={16} />
              <span>{t("resume.continueProject", "Continuar con este proyecto")}</span>
              <ArrowRight size={15} />
            </button>

            {/* Secondary: Start New Audio */}
            <button
              type="button"
              onClick={onNewTrack}
              disabled={isLoading}
              className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-2xl text-xs font-semibold border border-[var(--border-subtle)] bg-[var(--surface-hover)] hover:bg-[var(--surface-active)] text-[var(--text-primary)] hover:border-[var(--accent-primary)]/40 transition-all cursor-pointer"
            >
              <PlusCircle size={15} className="text-[var(--accent-primary)]" />
              <span>{t("resume.newAudio", "Subir un nuevo audio")}</span>
            </button>

            {/* Tertiary: Browse Library */}
            <button
              type="button"
              onClick={onOpenLibrary}
              disabled={isLoading}
              className="mt-1 flex items-center justify-center gap-1.5 py-1 text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            >
              <FolderOpen size={13} />
              <span>{t("resume.openLibrary", "O ver todas mis canciones guardadas")}</span>
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
