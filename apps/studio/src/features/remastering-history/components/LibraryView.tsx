"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Music2,
  Search,
  X,
  Sliders,
  Download,
  Trash2,
  Clock,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  FileAudio,
  Radio,
  ArrowRight,
  RefreshCw,
  FolderOpen,
} from "lucide-react";
import { useTranslation } from "@/i18n/useTranslation";
import { useTrackHistory } from "../hooks/useTrackHistory";
import Pagination from "@/presentation/components/ui/Pagination";
import type { Track, TrackFilterStatus } from "@/features/tracks";

interface LibraryViewProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTrack: (track: Track) => void;
  onNewUpload: () => void;
}

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "--:--";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatFileSize(bytes: number): string {
  if (!bytes) return "0 MB";
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

export default function LibraryView({
  isOpen,
  onClose,
  onSelectTrack,
  onNewUpload,
}: LibraryViewProps) {
  const { t } = useTranslation();
  const {
    tracks,
    totalCount,
    page,
    pageSize,
    filter,
    search,
    isLoading,
    error,
    handleSearchChange,
    handleFilterChange,
    handlePageChange,
    handlePageSizeChange,
    handleDeleteTrack,
    handleDownloadMaster,
    refresh,
  } = useTrackHistory({ initialPageSize: 8 });

  const [trackToDelete, setTrackToDelete] = useState<Track | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  if (!isOpen) return null;

  const confirmDelete = async () => {
    if (!trackToDelete) return;
    setIsDeleting(true);
    try {
      await handleDeleteTrack(trackToDelete);
      setTrackToDelete(null);
    } catch (err) {
      console.error(err);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDownload = async (track: Track) => {
    if (!track.masters || track.masters.length === 0) return;
    const latestMaster = track.masters[0];
    setDownloadingId(track.id);
    try {
      const filename = `${track.title}_master.${latestMaster.format}`;
      await handleDownloadMaster(latestMaster.storage_path, filename);
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 backdrop-blur-xl bg-black/60"
        role="dialog"
        aria-modal="true"
        aria-labelledby="library-modal-title"
      >
        <motion.div
          initial={{ scale: 0.96, opacity: 0, y: 14 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.96, opacity: 0, y: 14 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="relative flex flex-col w-full max-w-4xl max-h-[90vh] rounded-3xl border shadow-2xl overflow-hidden"
          style={{
            background: "var(--bg-glass-elevated)",
            borderColor: "var(--border-strong)",
            boxShadow:
              "0 32px 80px -12px rgba(0, 0, 0, 0.85), inset 0 1px 0 rgba(255, 255, 255, 0.08)",
          }}
        >
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 sm:px-6 border-b border-[var(--border-subtle)] bg-[var(--surface-elevated)]/60">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-2xl flex items-center justify-center bg-[var(--accent-primary)]/15 border border-[var(--accent-primary)]/30 text-[var(--accent-primary)]">
                <Music2 size={20} />
              </div>
              <div>
                <h2
                  id="library-modal-title"
                  className="text-lg font-bold tracking-tight text-[var(--text-primary)]"
                >
                  {t("library.title", "Mis Canciones")}
                </h2>
                <p className="text-xs text-[var(--text-secondary)]">
                  {t(
                    "library.subtitle",
                    "Historial de producciones, borradores activos y descargas",
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                type="button"
                onClick={onNewUpload}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-[var(--accent-primary)] text-[var(--text-on-accent,white)] hover:brightness-110 active:scale-95 transition-all shadow-md cursor-pointer"
              >
                <FolderOpen size={14} />
                <span>{t("library.newTrack", "Subir nueva")}</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label={t("common.close", "Cerrar")}
                className="size-8 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] border border-[var(--border-subtle)] transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Search & Tabs Toolbar */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-4 sm:px-6 border-b border-[var(--border-subtle)] bg-[var(--surface-elevated)]/30">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder={t("library.searchPlaceholder", "Buscar por título o archivo...")}
                className="w-full pl-9 pr-8 py-1.5 text-xs rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] transition-all"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => handleSearchChange("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1 p-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] self-start md:self-auto">
              {(
                [
                  { id: "all", label: t("library.tabAll", "Todos") },
                  { id: "draft", label: t("library.tabDrafts", "Borradores") },
                  { id: "completed", label: t("library.tabMastered", "Masterizados") },
                ] as const
              ).map(({ id, label }) => {
                const active = filter === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => handleFilterChange(id as TrackFilterStatus)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                      active
                        ? "bg-[var(--accent-primary)]/20 text-[var(--accent-primary)] font-semibold shadow-xs"
                        : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Body / Tracks List */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 min-h-[300px]">
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((n) => (
                  <div
                    key={n}
                    className="h-20 rounded-2xl animate-pulse bg-[var(--surface-hover)] border border-[var(--border-subtle)]"
                  />
                ))}
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center p-8 text-center">
                <AlertCircle size={32} className="text-red-400 mb-2" />
                <p className="text-sm font-semibold text-[var(--text-primary)]">{error}</p>
                <button
                  type="button"
                  onClick={refresh}
                  className="mt-3 flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-xl bg-[var(--surface-hover)] hover:bg-[var(--surface-active)] text-[var(--text-primary)] transition-all"
                >
                  <RefreshCw size={13} />
                  <span>{t("common.retry", "Reintentar")}</span>
                </button>
              </div>
            ) : tracks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <div className="size-16 rounded-full flex items-center justify-center bg-[var(--surface-elevated)] border border-[var(--border-subtle)] text-[var(--text-muted)] mb-3">
                  <FileAudio size={28} />
                </div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  {search
                    ? t("library.noSearchResults", "No se encontraron canciones para esta búsqueda")
                    : filter === "draft"
                      ? t("library.noDrafts", "No tienes borradores activos actualmente")
                      : filter === "completed"
                        ? t("library.noMastered", "Aún no has masterizado ninguna canción")
                        : t("library.emptyTitle", "Tu biblioteca de canciones está vacía")}
                </h3>
                <p className="text-xs text-[var(--text-secondary)] max-w-sm mt-1 mb-4">
                  {t(
                    "library.emptyDesc",
                    "Sube una pista de audio para comenzar a procesar con los presets y motores IA de WaveIA.",
                  )}
                </p>
                <button
                  type="button"
                  onClick={onNewUpload}
                  className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold bg-[var(--accent-primary)] text-white hover:brightness-110 active:scale-95 transition-all shadow-md cursor-pointer"
                >
                  <Sparkles size={14} />
                  <span>{t("library.startMastering", "Subir mi primera pista")}</span>
                </button>
              </div>
            ) : (
              tracks.map((track) => {
                const hasDraft = !!track.draft_parameters;
                const hasMasters = track.masters && track.masters.length > 0;
                const isMastered = track.status === "completed" || hasMasters;

                return (
                  <div
                    key={track.id}
                    className="group relative flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl border transition-all duration-200"
                    style={{
                      backgroundColor: "var(--surface-elevated)",
                      borderColor: "var(--border-subtle)",
                    }}
                  >
                    {/* Track Info */}
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="size-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 bg-[var(--surface-hover)] border border-[var(--border-subtle)] text-[var(--accent-primary)] group-hover:border-[var(--accent-primary)]/40 transition-colors">
                        {isMastered ? (
                          <CheckCircle2 size={18} className="text-emerald-400" />
                        ) : hasDraft ? (
                          <Sparkles size={18} className="text-amber-400" />
                        ) : (
                          <Radio size={18} />
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm font-semibold text-[var(--text-primary)] truncate max-w-xs sm:max-w-sm md:max-w-md">
                            {track.title}
                          </h4>

                          {/* Status badges */}
                          {hasDraft && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 border border-amber-500/30 text-amber-400">
                              <Sparkles size={10} />
                              <span>{t("library.draftBadge", "Borrador")}</span>
                              {track.active_preset && (
                                <span className="opacity-80">· {track.active_preset}</span>
                              )}
                            </span>
                          )}

                          {isMastered && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                              <CheckCircle2 size={10} />
                              <span>{t("library.masteredBadge", "Masterizado")}</span>
                            </span>
                          )}
                        </div>

                        {/* Metadata row */}
                        <div className="flex items-center gap-2.5 mt-1 text-[11px] text-[var(--text-secondary)] flex-wrap">
                          <span className="truncate max-w-[140px] text-[var(--text-muted)]">
                            {track.original_filename}
                          </span>
                          <span>•</span>
                          <span className="inline-flex items-center gap-1">
                            <Clock size={11} className="text-[var(--text-muted)]" />
                            {formatDuration(track.duration_seconds)}
                          </span>
                          <span>•</span>
                          <span>{formatFileSize(track.file_size_bytes)}</span>
                          {track.sample_rate && (
                            <>
                              <span>•</span>
                              <span>{(track.sample_rate / 1000).toFixed(1)} kHz</span>
                            </>
                          )}
                          <span>•</span>
                          <span className="text-[var(--text-muted)]">
                            {formatDate(track.created_at)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                      {/* Download Master Button if mastered */}
                      {hasMasters && (
                        <button
                          type="button"
                          onClick={() => handleDownload(track)}
                          disabled={downloadingId === track.id}
                          title={t("library.downloadMaster", "Descargar Master")}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-hover)] hover:bg-[var(--surface-active)] text-xs font-semibold text-[var(--text-primary)] transition-all cursor-pointer disabled:opacity-50"
                        >
                          <Download size={13} className="text-emerald-400" />
                          <span className="hidden sm:inline">
                            {downloadingId === track.id ? "..." : "Master"}
                          </span>
                        </button>
                      )}

                      {/* Continue Mastering Button */}
                      <button
                        type="button"
                        onClick={() => onSelectTrack(track)}
                        title={t("library.resumeMastering", "Continuar masterizando")}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--accent-primary)]/15 hover:bg-[var(--accent-primary)]/25 border border-[var(--accent-primary)]/30 text-xs font-semibold text-[var(--accent-primary)] hover:text-white transition-all cursor-pointer"
                      >
                        <Sliders size={13} />
                        <span>{t("library.openInStudio", "Abrir")}</span>
                        <ArrowRight size={12} />
                      </button>

                      {/* Delete Button */}
                      <button
                        type="button"
                        onClick={() => setTrackToDelete(track)}
                        title={t("common.delete", "Eliminar")}
                        className="size-8 rounded-xl flex items-center justify-center text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all cursor-pointer"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Pagination Footer */}
          <div className="bg-[var(--surface-elevated)]/60">
            <Pagination
              page={page}
              pageSize={pageSize}
              totalCount={totalCount}
              pageSizeOptions={[5, 8, 15]}
              onPageChange={handlePageChange}
              onPageSizeChange={handlePageSizeChange}
              isLoading={isLoading}
            />
          </div>
        </motion.div>

        {/* Delete Confirmation Modal */}
        {trackToDelete && (
          <div
            className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-dialog-title"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="w-full max-w-sm p-5 rounded-2xl border shadow-2xl bg-[var(--bg-elevated)] border-[var(--border-strong)]"
            >
              <div className="size-10 rounded-full flex items-center justify-center bg-red-500/15 border border-red-500/30 text-red-400 mb-3">
                <Trash2 size={20} />
              </div>
              <h3 id="delete-dialog-title" className="text-base font-bold text-[var(--text-primary)]">
                {t("library.deleteTitle", "¿Eliminar canción?")}
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mt-1.5">
                {t(
                  "library.deleteDesc",
                  "Esta acción eliminará el archivo original de la nube, todos sus borradores y los masters finales exportados permanentemente.",
                )}
              </p>
              <p className="text-xs font-medium text-[var(--text-primary)] mt-2 p-2 rounded-lg bg-[var(--surface-hover)] truncate">
                {trackToDelete.title}
              </p>

              <div className="flex items-center justify-end gap-2 mt-5">
                <button
                  type="button"
                  onClick={() => setTrackToDelete(null)}
                  disabled={isDeleting}
                  className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--surface-hover)] text-[var(--text-secondary)] transition-colors cursor-pointer"
                >
                  {t("common.cancel", "Cancelar")}
                </button>
                <button
                  type="button"
                  onClick={confirmDelete}
                  disabled={isDeleting}
                  className="px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-red-500 hover:bg-red-600 text-white transition-all cursor-pointer shadow-md disabled:opacity-50"
                >
                  {isDeleting
                    ? t("common.deleting", "Eliminando...")
                    : t("common.deleteConfirm", "Eliminar")}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
