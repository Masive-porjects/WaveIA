"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Download,
  Disc3,
  Sliders,
  CheckCircle2,
  X,
  FileAudio,
  Radio,
  Layers,
} from "lucide-react";
import { useTranslation } from "@/i18n/useTranslation";
import type { Track, MasterRecord } from "@/features/tracks";
import type { MasteringParameters } from "@/lib/api";

interface ConsolidateMasterModalProps {
  isOpen: boolean;
  onClose: () => void;
  track: Track | null;
  params: MasteringParameters;
  activePresetId: string | null;
  isConsolidating: boolean;
  onConfirm: (options: { name: string; format: "wav" | "mp3" }) => Promise<MasterRecord | null>;
}

export default function ConsolidateMasterModal({
  isOpen,
  onClose,
  track,
  params,
  activePresetId,
  isConsolidating,
  onConfirm,
}: ConsolidateMasterModalProps) {
  const { t } = useTranslation();

  const [masterName, setMasterName] = useState("");
  const [format, setFormat] = useState<"wav" | "mp3">("wav");
  const [successRecord, setSuccessRecord] = useState<MasterRecord | null>(null);

  useEffect(() => {
    if (track) {
      const presetSuffix = activePresetId ? ` (${activePresetId})` : "";
      setMasterName(`${track.title} - Master Final${presetSuffix}`);
      setSuccessRecord(null);
    }
  }, [track, activePresetId, isOpen]);

  if (!isOpen || !track) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!masterName.trim() || isConsolidating) return;

    const result = await onConfirm({
      name: masterName.trim(),
      format,
    });

    if (result) {
      setSuccessRecord(result);
      setTimeout(() => {
        onClose();
        setSuccessRecord(null);
      }, 1800);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-2xl bg-black/80"
        role="dialog"
        aria-modal="true"
      >
        <motion.div
          initial={{ scale: 0.94, opacity: 0, y: 15 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.94, opacity: 0, y: 15 }}
          transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
          className="relative flex flex-col w-full max-w-lg rounded-3xl border overflow-hidden p-6 sm:p-7"
          style={{
            background:
              "linear-gradient(135deg, rgba(28, 36, 38, 0.96) 0%, rgba(16, 22, 23, 0.98) 100%)",
            borderColor: "rgba(255, 255, 255, 0.12)",
            boxShadow:
              "0 32px 80px -15px rgba(0, 0, 0, 0.9), 0 0 0 1px rgba(255, 255, 255, 0.05)",
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-[var(--border-subtle)]">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-2xl bg-gradient-to-br from-emerald-500/25 to-teal-500/10 border border-emerald-500/30 flex items-center justify-center shadow-lg shadow-emerald-500/10">
                <Disc3 className="size-5 text-emerald-400 animate-spin-slow" />
              </div>
              <div>
                <h3 className="text-base font-bold tracking-tight text-[var(--text-primary)]">
                  {t("mastering.consolidateTitle", "Definir Mezcla Final")}
                </h3>
                <p className="text-xs text-[var(--text-muted)]">
                  {t(
                    "mastering.consolidateSubtitle",
                    "Exporta tu master definitivo a la nube de Supabase"
                  )}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={isConsolidating}
              className="size-8 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              <X size={16} />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            {/* Master Name Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                {t("mastering.masterNameLabel", "Nombre de la Mezcla / Master")}
              </label>
              <input
                type="text"
                value={masterName}
                onChange={(e) => setMasterName(e.target.value)}
                disabled={isConsolidating}
                required
                className="w-full px-4 py-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-hover)] text-sm font-medium text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)] transition-all placeholder:text-[var(--text-muted)] disabled:opacity-50"
                placeholder="ej: Astrosoul - Mezcla Spotify Oficial"
              />
            </div>

            {/* Format Selection */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                {t("mastering.formatLabel", "Formato de Exportación")}
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setFormat("wav")}
                  disabled={isConsolidating}
                  className={`flex items-center gap-3 p-3 rounded-2xl border text-left transition-all ${
                    format === "wav"
                      ? "border-emerald-500/50 bg-emerald-500/10 shadow-sm shadow-emerald-500/10"
                      : "border-[var(--border-subtle)] bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)]"
                  }`}
                >
                  <FileAudio
                    className={`size-5 shrink-0 ${
                      format === "wav" ? "text-emerald-400" : "text-[var(--text-muted)]"
                    }`}
                  />
                  <div>
                    <div className="text-xs font-bold text-[var(--text-primary)]">WAV (24-bit)</div>
                    <div className="text-[10px] text-[var(--text-muted)]">Sin compresión / Estudio</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setFormat("mp3")}
                  disabled={isConsolidating}
                  className={`flex items-center gap-3 p-3 rounded-2xl border text-left transition-all ${
                    format === "mp3"
                      ? "border-emerald-500/50 bg-emerald-500/10 shadow-sm shadow-emerald-500/10"
                      : "border-[var(--border-subtle)] bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)]"
                  }`}
                >
                  <Radio
                    className={`size-5 shrink-0 ${
                      format === "mp3" ? "text-emerald-400" : "text-[var(--text-muted)]"
                    }`}
                  />
                  <div>
                    <div className="text-xs font-bold text-[var(--text-primary)]">MP3 (320 kbps)</div>
                    <div className="text-[10px] text-[var(--text-muted)]">Streaming / Compartir</div>
                  </div>
                </button>
              </div>
            </div>

            {/* Recipe summary badge */}
            <div className="p-3.5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)]/60 text-xs space-y-1.5">
              <div className="flex items-center justify-between text-[var(--text-secondary)] font-medium">
                <span className="flex items-center gap-1.5">
                  <Sliders size={13} className="text-[var(--accent-secondary)]" />
                  <span>Perfil activo:</span>
                </span>
                <span className="font-bold text-[var(--text-primary)] capitalize">
                  {activePresetId || "Ajuste Personalizado"}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)]">
                <span>Objetivo sonoridad:</span>
                <span>{params.target_lufs_db ?? -14} LUFS · Ceiling {params.limiter_ceiling_db ?? -1.0} dB</span>
              </div>
            </div>

            {/* Success banner */}
            {successRecord && (
              <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center gap-2.5 text-xs text-emerald-300 font-semibold animate-in fade-in">
                <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                <span>¡Mezcla final subida a Supabase y descargada con éxito!</span>
              </div>
            )}

            {/* Actions */}
            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isConsolidating}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-[var(--text-secondary)] hover:text-white transition-colors cursor-pointer disabled:opacity-50"
              >
                {t("common.cancel", "Cancelar")}
              </button>

              <button
                type="submit"
                disabled={isConsolidating || !masterName.trim()}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold shadow-lg shadow-emerald-500/20 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isConsolidating ? (
                  <>
                    <span className="size-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                    <span>Guardando en la nube...</span>
                  </>
                ) : (
                  <>
                    <Download size={14} />
                    <span>Consolidar y Guardar</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
