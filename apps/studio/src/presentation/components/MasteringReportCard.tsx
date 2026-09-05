"use client";

import type { ReactNode } from "react";
import type { MasteringReport } from "@/lib/api";
import { AlertTriangle, Info } from "lucide-react";

/* ── MasteringReportCard ────────────────────────────────────
   Makes the engine's delivery work VISIBLE: the mode + platform
   used, the measured delivery metrics and any input-QC warnings.
   Compact by design (badges + numeric grid) — same typographic
   language as the rest of the studio (tiny uppercase labels,
   font-mono tabular-nums values, accent/surface tokens). */

interface MasteringReportCardProps {
  report: MasteringReport;
  mode: "master" | "transparent";
  platform: string | null;
  /** Control opcional al final del header (lo usa FloatingReportCard
      para su botón de colapsar de vuelta a la píldora). */
  headerAction?: ReactNode;
}

const PLATFORM_LABELS: Record<string, string> = {
  spotify: "Spotify",
  apple_music: "Apple Music",
  youtube: "YouTube",
  tidal: "Tidal",
  custom: "Personalizado",
};

/* 44100 → "44.1k", 48000 → "48k" */
function formatSr(sr: number | null): string {
  if (sr === null) return "—";
  if (sr >= 1000) {
    const k = sr / 1000;
    return `${Number.isInteger(k) ? k : k.toFixed(1)}k`.replace(".0k", "k");
  }
  return `${sr}`;
}

function formatNum(v: number | null, unit: string): string {
  return v === null ? "—" : `${v.toFixed(1)} ${unit}`;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] font-semibold text-[var(--text-muted)] uppercase tracking-widest truncate">
        {label}
      </p>
      <p className="mt-0.5 text-xs font-mono text-[var(--text-primary)] tabular-nums truncate">
        {value}
      </p>
    </div>
  );
}

export default function MasteringReportCard({
  report,
  mode,
  platform,
  headerAction,
}: MasteringReportCardProps) {
  const platformLabel = platform ? (PLATFORM_LABELS[platform] ?? platform) : "sin plataforma";
  const srSame =
    report.input_sr !== null &&
    report.output_sr !== null &&
    report.input_sr === report.output_sr;
  const srCell = srSame
    ? formatSr(report.output_sr)
    : `${formatSr(report.input_sr)} → ${formatSr(report.output_sr)}`;

  const passthrough =
    report.target_lufs === null && mode === "transparent";

  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: "var(--bg-glass)",
        border: "1px solid var(--border-subtle)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      {/* ── Header: mode + platform badge ── */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-widest">
          Reporte del motor
        </span>
        <span
          className="ml-auto text-[9px] font-medium uppercase tracking-widest px-2 py-0.5 rounded-full"
          style={{
            background: "rgba(98, 126, 132, 0.12)",
            border: "1px solid rgba(98, 126, 132, 0.3)",
            color: "var(--accent-primary)",
          }}
        >
          {mode === "transparent" ? "Transparente" : "Creativo"} · {platformLabel}
        </span>
        {headerAction && <div className="ml-2 shrink-0">{headerAction}</div>}
      </div>

      {/* ── Metrics grid ── */}
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-x-4 gap-y-2.5">
        <Metric
          label="LUFS objetivo"
          value={report.target_lufs === null ? "—" : formatNum(report.target_lufs, "LUFS")}
        />
        <Metric label="LUFS medidos" value={formatNum(report.lufs_i, "LUFS")} />
        <Metric
          label="True peak"
          value={
            report.true_peak_dbtp === null
              ? "—"
              : `${report.true_peak_dbtp.toFixed(2)} dBTP`
          }
        />
        <Metric label="LRA" value={formatNum(report.lra, "LU")} />
        <Metric label="Crest" value={formatNum(report.crest_factor_db, "dB")} />
        <Metric label="Sample rate" value={srCell} />
        <Metric
          label="Bit depth"
          value={report.output_bit_depth === null ? "—" : `${report.output_bit_depth}-bit`}
        />
      </div>

      {/* ── Passthrough notice (transparent, no loudness applied) ── */}
      {passthrough && (
        <div
          className="mt-3 flex items-start gap-2 p-2.5 rounded-lg text-[10px] leading-relaxed"
          style={{
            background: "rgba(98, 126, 132, 0.08)",
            border: "1px solid rgba(98, 126, 132, 0.2)",
            color: "var(--accent-primary)",
          }}
        >
          <Info size={12} className="shrink-0 mt-0.5" />
          <span>
            Passthrough: tu audio salió igual que entró (
            {report.output_bit_depth === null
              ? "solo cambio de contenedor"
              : `solo cambio de contenedor a ${report.output_bit_depth}-bit`}
            ).
          </span>
        </div>
      )}

      {/* ── Warnings (amber) ── */}
      {report.warnings.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {report.warnings.map((w, i) => (
            <div
              key={i}
              className="flex items-start gap-2 p-2.5 rounded-lg text-[10px] leading-relaxed"
              style={{
                background: "rgba(255, 159, 10, 0.08)",
                border: "1px solid rgba(255, 159, 10, 0.2)",
                color: "#fbbf24",
              }}
            >
              <AlertTriangle size={12} className="shrink-0 mt-0.5" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}