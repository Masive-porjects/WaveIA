"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Upload, X, Loader2, Download, AlertCircle, CheckCircle, Minus, Plus, Settings, Music } from "lucide-react";
import { negotiateAlbum, processAlbum, type AlbumNegotiationTrack, type AlbumProcessTrack, type AlbumNegotiateResponse, type AlbumProcessResponse } from "@/adapters/api/album";
import { uploadAudio, downloadMastered, type SessionData } from "@/adapters/api/client";
import JSZip from "jszip";

interface AlbumTrackState {
  file: File;
  sessionId: string | null;
  uploadProgress: number;
  uploadStatus: "pending" | "uploading" | "completed" | "error";
  uploadError: string | null;
  analysis: AlbumNegotiationTrack | null;
  masteringResult: AlbumProcessTrack | null;
}

export default function AlbumMastering() {
  const [tracks, setTracks] = useState<AlbumTrackState[]>([]);
  const [albumTargetLufs, setAlbumTargetLufs] = useState<number | null>(null);
  const [preserveDynamics, setPreserveDynamics] = useState(true);
  const [maxGainAdjustment, setMaxGainAdjustment] = useState(3.0);
  const [platformTarget, setPlatformTarget] = useState<"spotify" | "apple_music" | "youtube" | "tidal" | "custom">("spotify");
  const [processingMode, setProcessingMode] = useState<"master" | "transparent">("master");
  const [outputSr, setOutputSr] = useState<"same_as_input" | "44100" | "48000" | "96000">("same_as_input");
  const [outputBitDepth, setOutputBitDepth] = useState<16 | 24 | 32>(24);
  const [strictMode, setStrictMode] = useState(false);

  const [phase, setPhase] = useState<"idle" | "uploading" | "analyzing" | "processing" | "completed" | "error">("idle");
  const [albumReport, setAlbumReport] = useState<AlbumProcessResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [processingProgress, setProcessingProgress] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(async (files: FileList) => {
    const newTracks: AlbumTrackState[] = Array.from(files).map((file, index) => ({
      file,
      sessionId: null,
      uploadProgress: 0,
      uploadStatus: "pending" as const,
      uploadError: null,
      analysis: null,
      masteringResult: null,
    }));

    setTracks(prev => [...prev, ...newTracks]);
    setPhase("uploading");
    setError(null);

    // Upload all tracks in parallel
    const uploadPromises = newTracks.map(async (track, index) => {
      const trackIndex = tracks.length + index;
      setTracks(prev => {
        const updated = [...prev];
        updated[trackIndex] = { ...updated[trackIndex], uploadStatus: "uploading" };
        return updated;
      });

      try {
        const session = await uploadAudio(track.file, (pct) => {
          setTracks(prev => {
            const updated = [...prev];
            updated[trackIndex] = { ...updated[trackIndex], uploadProgress: pct };
            return updated;
          });
        });

        setTracks(prev => {
          const updated = [...prev];
          updated[trackIndex] = { 
            ...updated[trackIndex], 
            sessionId: session.session_id, 
            uploadStatus: "completed",
            uploadProgress: 100,
          };
          return updated;
        });
      } catch (err) {
        setTracks(prev => {
          const updated = [...prev];
          updated[trackIndex] = { 
            ...updated[trackIndex], 
            uploadStatus: "error",
            uploadError: err instanceof Error ? err.message : "Error al subir",
          };
          return updated;
        });
      }
    });

    await Promise.all(uploadPromises);

    // Check if all uploads succeeded
    const allCompleted = newTracks.every(t => t.uploadStatus === "completed");
    if (allCompleted) {
      setPhase("analyzing");
      await analyzeAlbum();
    }
  }, [tracks.length]);

  const analyzeAlbum = async () => {
    const sessionIds = tracks.map(t => t.sessionId).filter((s): s is string => s !== null);
    if (sessionIds.length === 0) return;

    try {
      const response = await negotiateAlbum({
        session_ids: sessionIds,
        target_lufs_db: albumTargetLufs ?? undefined,
      });

      setTracks(prev => prev.map((track, index) => ({
        ...track,
        analysis: response.tracks[index] ?? null,
      })));

      setAlbumTargetLufs(response.target_base_lufs_db);
      setPhase("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al analizar el álbum");
      setPhase("error");
    }
  };

  const processAlbumMaster = async () => {
    const sessionIds = tracks.map(t => t.sessionId).filter((s): s is string => s !== null);
    if (sessionIds.length === 0) return;

    abortControllerRef.current = new AbortController();
    setPhase("processing");
    setProcessingProgress(0);
    setError(null);

    try {
      const response = await processAlbum({
        session_ids: sessionIds,
        platform_target: platformTarget,
        target_lufs_db: albumTargetLufs ?? undefined,
        preserve_relative_dynamics: preserveDynamics,
        max_gain_adjustment_db: maxGainAdjustment,
        processing_mode: processingMode,
        output_sr: outputSr,
        output_bit_depth: outputBitDepth,
        strict_mode: strictMode,
      });

      // The backend returns AlbumProcessResponse with target_base_lufs_db, not album_id
      // For download, we need to construct the album_id or use a different approach
      // Since the backend process endpoint doesn't return album_id, we'll need to adjust
      setAlbumReport(response);
      setTracks(prev => prev.map((track, index) => ({
        ...track,
        masteringResult: response.tracks[index] ?? null,
      })));

      setPhase("completed");
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Error al masterizar el álbum");
      setPhase("error");
    }
  };

  const handleDownload = async () => {
    if (!albumReport) return;
    try {
      const zip = new JSZip();
      
      for (let i = 0; i < albumReport.tracks.length; i++) {
        const track = albumReport.tracks[i];
        const sessionTrack = tracks[i];
        
        if (!sessionTrack?.sessionId) continue;
        
        try {
          const blob = await downloadMastered(sessionTrack.sessionId, "wav");
          const filename = sessionTrack.file.name.replace(/\.[^/.]+$/, "") + "_mastered.wav";
          zip.file(filename, blob);
        } catch (trackErr) {
          console.warn(`Failed to download track ${i}:`, trackErr);
        }
      }
      
      // Add album report JSON
      zip.file("album_report.json", JSON.stringify(albumReport, null, 2));
      
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `album_master_${Date.now()}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al descargar");
    }
  };

  const removeTrack = (index: number) => {
    setTracks(prev => prev.filter((_, i) => i !== index));
  };

  const clearAll = () => {
    setTracks([]);
    setAlbumReport(null);
    setAlbumTargetLufs(null);
    setPhase("idle");
    setError(null);
  };

  const triggerFileInput = () => fileInputRef.current?.click();

  const allUploaded = tracks.length > 0 && tracks.every(t => t.uploadStatus === "completed");
  const allAnalyzed = tracks.length > 0 && tracks.every(t => t.analysis !== null);
  const canProcess = allAnalyzed && phase !== "processing";

  const platformLabels: Record<string, string> = {
    spotify: "Spotify (-14 LUFS, -1.0 dBTP)",
    apple_music: "Apple Music (-16 LUFS, -1.0 dBTP)",
    youtube: "YouTube (-13 LUFS, -1.0 dBTP)",
    tidal: "Tidal (-14 LUFS, -1.0 dBTP)",
    custom: "Personalizado",
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 lg:p-6 gap-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <Music size={24} className="text-[var(--accent-primary)]" />
            Mastering de Álbum / EP
          </h2>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Carga múltiples tracks, analiza el álbum completo y masteriza con targets relativos coherentes.
          </p>
        </div>
        {tracks.length > 0 && (
          <button
            onClick={clearAll}
            className="px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors flex items-center gap-1"
          >
            <X size={14} /> Limpiar todo
          </button>
        )}
      </div>

      {/* Dropzone / Track List */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
        {/* Dropzone when empty */}
        {tracks.length === 0 && (
          <div
            className="relative p-8 lg:p-12 text-center border-2 border-dashed border-[var(--border)] rounded-xl hover:border-[var(--accent-primary)] transition-colors cursor-pointer"
            onClick={triggerFileInput}
            onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add("border-[var(--accent-primary)]", "bg-[var(--surface-hover)]"); }}
            onDragLeave={e => { e.currentTarget.classList.remove("border-[var(--accent-primary)]", "bg-[var(--surface-hover)]"); }}
            onDrop={e => {
              e.preventDefault();
              e.currentTarget.classList.remove("border-[var(--accent-primary)]", "bg-[var(--surface-hover)]");
              if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
            }}
          >
            <input ref={fileInputRef} type="file" accept="audio/*" multiple className="hidden" onChange={e => e.target.files && handleFiles(e.target.files)} />
            <Upload size={48} className="mx-auto mb-4 text-[var(--text-muted)]" />
            <p className="text-lg font-medium text-[var(--text-primary)] mb-1">Arrastra tus tracks aquí</p>
            <p className="text-sm text-[var(--text-muted)]">O hacé click para seleccionar múltiples archivos (WAV, MP3, FLAC — máx 50MB c/u)</p>
          </div>
        )}

        {/* Track list when files added */}
        {tracks.length > 0 && (
          <div className="divide-y divide-[var(--border)]">
            {/* Table header */}
            <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-3 px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)] bg-[var(--bg-glass)]">
              <span>#</span>
              <span>Track</span>
              <span className="text-right">LUFS</span>
              <span className="text-right">TP</span>
              <span className="text-right">LRA</span>
              <span className="text-right">Target</span>
              <span></span>
            </div>

            {/* Track rows */}
            {tracks.map((track, index) => (
              <div key={index} className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-3 px-4 py-3 items-center">
                <span className="text-sm text-[var(--text-muted)]">{index + 1}</span>
                
                <div className="min-w-0 flex items-center gap-3">
                  {track.uploadStatus === "uploading" && (
                    <div className="w-32 h-2 bg-[var(--border)] rounded-full overflow-hidden flex-1">
                      <div 
                        className="h-full bg-[var(--accent-primary)] transition-all duration-200" 
                        style={{ width: `${track.uploadProgress}%` }}
                      />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--text-primary)] truncate">{track.file.name}</p>
                    <p className="text-[10px] text-[var(--text-muted)]">
                      {(track.file.size / 1024 / 1024).toFixed(1)} MB
                    </p>
                  </div>
                </div>

                {track.analysis ? (
                  <>
                    <span className="text-sm text-[var(--text-primary)] tabular-nums text-right w-16">
                      {track.analysis.input_lufs_db?.toFixed(1) ?? "—"}
                    </span>
                    <span className="text-sm text-[var(--text-secondary)] tabular-nums text-right w-16">
                      {track.analysis.input_true_peak_dbtp?.toFixed(1) ?? "—"}
                    </span>
                    <span className="text-sm text-[var(--text-secondary)] tabular-nums text-right w-16">
                      {track.analysis.input_lra_lu?.toFixed(1) ?? "—"}
                    </span>
                    <span className="text-sm text-[var(--accent-primary)] tabular-nums text-right w-20 font-medium">
                      {track.analysis.negotiated_target_lufs_db?.toFixed(1) ?? "—"}
                    </span>
                    <button
                      onClick={() => removeTrack(index)}
                      className="text-[var(--text-muted)] hover:text-[var(--accent-error)] transition-colors p-1"
                      aria-label="Eliminar track"
                    >
                      <X size={16} />
                    </button>
                  </>
                ) : track.uploadStatus === "error" ? (
                  <>
                    <div className="col-span-4 text-sm text-[var(--accent-error)]">Error: {track.uploadError}</div>
                    <div className="col-span-2 text-right"></div>
                    <button onClick={() => removeTrack(index)} className="text-[var(--text-muted)] hover:text-[var(--accent-error)]"><X size={16} /></button>
                  </>
                ) : (
                  <>
                    <div className="col-span-4 text-sm text-[var(--text-muted)]">
                      {track.uploadStatus === "completed" ? "Analizando..." : "Subiendo..."}
                    </div>
                    <div className="col-span-2 text-right"></div>
                    <button onClick={() => removeTrack(index)} className="text-[var(--text-muted)] hover:text-[var(--accent-error)]"><X size={16} /></button>
                  </>
                )}
              </div>
            ))}

            {/* Add more tracks row */}
            <div className="px-4 py-3">
              <button
                onClick={triggerFileInput}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-[var(--border)] rounded-lg text-[var(--text-secondary)] hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)] transition-colors"
              >
                <Plus size={18} /> Agregar más tracks
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Album Settings Panel */}
      {(allUploaded || allAnalyzed) && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 lg:p-6 space-y-4">
          <h3 className="font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <Settings size={20} className="text-[var(--accent-primary)]" />
            Configuración del Álbum
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Platform Target */}
            <div>
              <label className="block text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wide mb-1">
                Plataforma destino
              </label>
              <select
                value={platformTarget}
                onChange={e => setPlatformTarget(e.target.value as typeof platformTarget)}
                className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
              >
                <option value="spotify">Spotify (-14 LUFS, -1.0 dBTP)</option>
                <option value="apple_music">Apple Music (-16 LUFS, -1.0 dBTP)</option>
                <option value="youtube">YouTube (-13 LUFS, -1.0 dBTP)</option>
                <option value="tidal">Tidal (-14 LUFS, -1.0 dBTP)</option>
                <option value="custom">Personalizado</option>
              </select>
            </div>

            {/* Album Target LUFS */}
            <div>
              <label className="block text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wide mb-1">
                Target LUFS álbum
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.5"
                  min="-24"
                  max="-6"
                  value={albumTargetLufs ?? ""}
                  onChange={e => setAlbumTargetLufs(e.target.value ? parseFloat(e.target.value) : null)}
                  placeholder="Auto (mediana)"
                  className="flex-1 px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                />
                <span className="text-sm text-[var(--text-muted)]">LUFS</span>
              </div>
            </div>

            {/* Max Gain Adjustment */}
            <div>
              <label className="block text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wide mb-1">
                Max ajuste gain
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="6"
                  value={maxGainAdjustment}
                  onChange={e => setMaxGainAdjustment(parseFloat(e.target.value) || 0)}
                  className="flex-1 px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                />
                <span className="text-sm text-[var(--text-muted)]">dB</span>
              </div>
            </div>

            {/* Preserve Dynamics Toggle */}
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer w-full">
                <input
                  type="checkbox"
                  checked={preserveDynamics}
                  onChange={e => setPreserveDynamics(e.target.checked)}
                  className="w-4 h-4 accent-[var(--accent-primary)] border-[var(--border)] rounded"
                />
                <span className="text-sm text-[var(--text-primary)]">Preservar dinámica relativa</span>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-[var(--border)]">
            <div>
              <label className="block text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wide mb-1">
                Modo procesamiento
              </label>
              <select
                value={processingMode}
                onChange={e => setProcessingMode(e.target.value as typeof processingMode)}
                className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
              >
                <option value="master">Master (DSP completo)</option>
                <option value="transparent">Transparente (solo gain/LUFS/TP)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wide mb-1">
                Sample rate salida
              </label>
              <select
                value={outputSr}
                onChange={e => setOutputSr(e.target.value as typeof outputSr)}
                className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
              >
                <option value="same_as_input">Igual al original</option>
                <option value="44100">44.1 kHz</option>
                <option value="48000">48 kHz</option>
                <option value="96000">96 kHz</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wide mb-1">
                Bit depth
              </label>
              <select
                value={outputBitDepth}
                onChange={e => setOutputBitDepth(parseInt(e.target.value) as 16 | 24 | 32)}
                className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
              >
                <option value="16">16-bit (con dither)</option>
                <option value="24">24-bit</option>
                <option value="32">32-bit float</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="strict-mode"
              checked={strictMode}
              onChange={e => setStrictMode(e.target.checked)}
              className="w-4 h-4 accent-[var(--accent-primary)] border-[var(--border)] rounded"
            />
            <label htmlFor="strict-mode" className="text-sm text-[var(--text-secondary)]">
              Strict mode (rechaza tracks con clipping/TP alto)
            </label>
          </div>
        </div>
      )}

      {/* Analyze Button */}
      {allUploaded && phase !== "analyzing" && phase !== "processing" && (
        <button
          onClick={analyzeAlbum}
          className="w-full sm:w-auto px-6 py-3 bg-[var(--accent-primary)] text-[var(--bg-primary)] font-semibold rounded-lg hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <Loader2 size={18} className="animate-spin" />
          Analizar álbum
        </button>
      )}

      {/* Process Button */}
      {canProcess && (
        <button
          onClick={processAlbumMaster}
          className="w-full sm:w-auto px-6 py-3 bg-[var(--accent-primary)] text-[var(--bg-primary)] font-semibold rounded-lg hover:brightness-110 transition-all flex items-center justify-center gap-2"
        >
          <Loader2 size={18} className="animate-spin" />
          Masterizando... {Math.round(processingProgress * 100)}%
        </button>
      )}

      {/* Progress Bar During Processing */}
      {phase === "processing" && (
        <div className="w-full h-2 bg-[var(--border)] rounded-full overflow-hidden">
          <div
            className="h-full bg-[var(--accent-primary)] transition-all duration-300"
            style={{ width: `${processingProgress * 100}%` }}
          />
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="p-4 bg-[var(--accent-error)]/10 border border-[var(--accent-error)]/30 rounded-lg flex items-start gap-3">
          <AlertCircle size={20} className="text-[var(--accent-error)] mt-0.5" />
          <div>
            <p className="font-medium text-[var(--accent-error)]">Error</p>
            <p className="text-sm text-[var(--text-secondary)]">{error}</p>
          </div>
        </div>
      )}

      {/* Results / Download */}
      {phase === "completed" && albumReport && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 lg:p-6 space-y-4 animate-fade-up">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2">
                <CheckCircle size={22} className="text-[var(--accent-primary)]" />
                Álbum masterizado correctamente
              </h3>
              <p className="text-sm text-[var(--text-muted)] mt-1">
                {albumReport.tracks.length} tracks · Album LUFS target: {albumReport.target_base_lufs_db?.toFixed(1) ?? "—"} · LRA mediana: {albumReport.lra_median_lu?.toFixed(1) ?? "—"}
              </p>
            </div>
            <button
              onClick={handleDownload}
              className="px-6 py-3 bg-[var(--accent-primary)] text-[var(--bg-primary)] font-semibold rounded-lg hover:brightness-110 transition-all flex items-center gap-2"
            >
              <Download size={18} />
              Descargar ZIP
            </button>
          </div>

          {/* Results Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)] border-b border-[var(--border)]">
                  <th className="pb-2">#</th>
                  <th className="pb-2">Track</th>
                  <th className="pb-2 text-right">Target LUFS</th>
                  <th className="pb-2 text-right">LUFS Out</th>
                  <th className="pb-2 text-right">Gain</th>
                  <th className="pb-2 text-right">TP Out</th>
                  <th className="pb-2">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {albumReport.tracks.map((track, index) => (
                  <tr key={index} className="hover:bg-[var(--surface-hover)]">
                    <td className="py-3 text-[var(--text-muted)]">{index + 1}</td>
                    <td className="py-3 font-medium text-[var(--text-primary)]">
                      {tracks[index]?.file.name ?? `Track ${index + 1}`}
                    </td>
                    <td className="py-3 text-right tabular-nums text-[var(--text-secondary)]">
                      {track.negotiated_target_lufs_db?.toFixed(1) ?? "—"}
                    </td>
                    <td className="py-3 text-right tabular-nums text-[var(--text-primary)] font-medium">
                      {track.output_lufs_db?.toFixed(1) ?? "—"}
                    </td>
                    <td className="py-3 text-right tabular-nums">
                      <span className={track.lufs_deviation_db !== null && track.lufs_deviation_db > 0 ? "text-[var(--accent-primary)]" : track.lufs_deviation_db !== null && track.lufs_deviation_db < 0 ? "text-[var(--accent-error)]" : "text-[var(--text-muted)]"}>
                        {track.lufs_deviation_db !== null ? (track.lufs_deviation_db >= 0 ? "+" : "") + track.lufs_deviation_db.toFixed(1) : "—"} dB
                      </span>
                    </td>
                    <td className="py-3 text-right tabular-nums text-[var(--text-secondary)]">
                      {track.output_true_peak_dbtp?.toFixed(2) ?? "—"}
                    </td>
                    <td className="py-3">
                      {track.warnings && track.warnings.length > 0 ? (
                        <span className="text-[var(--accent-error)] flex items-center gap-1">
                          <AlertCircle size={12} /> {track.warnings[0]}
                        </span>
                      ) : (
                        <span className="text-[var(--accent-primary)] flex items-center gap-1">
                          <CheckCircle size={12} /> OK
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Album Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-[var(--bg-glass)] rounded-lg">
            <div className="text-center">
              <p className="text-2xl font-bold text-[var(--accent-primary)] tabular-nums">
                {albumReport.target_base_lufs_db?.toFixed(1) ?? "—"}
              </p>
              <p className="text-[11px] text-[var(--text-muted)] uppercase tracking-wide">Target LUFS</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-[var(--text-primary)] tabular-nums">
                {albumReport.lra_median_lu?.toFixed(1) ?? "—"}
              </p>
              <p className="text-[11px] text-[var(--text-muted)] uppercase tracking-wide">LRA Mediana</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-[var(--text-primary)] tabular-nums">
                {albumReport.tracks.length}
              </p>
              <p className="text-[11px] text-[var(--text-muted)] uppercase tracking-wide">Tracks</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}