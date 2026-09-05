"use client";

import { useState } from "react";
import type { MasteringReport } from "@/lib/api";
import MasteringReportCard from "@/components/MasteringReportCard";
import { CheckCircle2, X } from "lucide-react";

/* ── FloatingReportCard ───────────────────────────────────
   Reporte flotante colapsable: píldora compacta abajo a la izquierda
   con el resumen de lo que entregó el motor; al hacerle click se
   expande a la tarjeta completa (MasteringReportCard) en el mismo
   rincón. La píldora queda siempre como punto de entrada — nunca se
   oculta del todo, solo se colapsa/expande. */

interface FloatingReportCardProps {
  report: MasteringReport;
  mode: "master" | "transparent";
  platform: string | null;
}

/* 44100 → "44.1k", 48000 → "48k" — igual que MasteringReportCard */
function formatSr(sr: number | null): string {
  if (sr === null) return "—";
  if (sr >= 1000) {
    const k = sr / 1000;
    return `${Number.isInteger(k) ? k : k.toFixed(1)}k`.replace(".0k", "k");
  }
  return `${sr}`;
}

function fmt(v: number | null, digits: number): string {
  return v === null ? "—" : v.toFixed(digits);
}

export default function FloatingReportCard({
  report,
  mode,
  platform,
}: FloatingReportCardProps) {
  const [expanded, setExpanded] = useState(false);

  const summary = [
    `${fmt(report.target_lufs ?? report.lufs_i, 1)} LUFS`,
    `${fmt(report.true_peak_dbtp, 2)} dBTP`,
    formatSr(report.output_sr),
    report.output_bit_depth === null ? "—" : `${report.output_bit_depth}-bit`,
  ].join(" · ");

  /* Píldora colapsada — entrada compacta al reporte completo */
  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        aria-label="Ver reporte completo"
        title="Ver reporte completo"
        className="fixed left-4 bottom-28 md:bottom-20 z-50 flex items-center gap-2 rounded-full px-3 py-2 transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
        style={{
          background: "var(--surface-hover)",
          border: "1px solid var(--border-subtle)",
          maxWidth: "min(300px, calc(100vw - 2rem))",
        }}
      >
        <CheckCircle2
          size={14}
          aria-hidden="true"
          className="shrink-0"
          style={{ color: "var(--accent-primary)" }}
        />
        <span className="truncate text-[10px] font-mono tabular-nums text-[var(--text-primary)]">
          {summary}
        </span>
      </button>
    );
  }

  /* Expandida — la tarjeta completa en el mismo rincón */
  return (
    <div
      className="fixed left-4 bottom-28 md:bottom-20 z-50 overflow-y-auto"
      style={{
        width: "min(380px, calc(100vw - 2rem))",
        maxHeight: "calc(100vh - 140px)",
      }}
    >
      <MasteringReportCard
        report={report}
        mode={mode}
        platform={platform}
        headerAction={
          <button
            type="button"
            aria-label="Volver al resumen compacto"
            onClick={() => setExpanded(false)}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] transition-all hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
          >
            <X size={14} />
          </button>
        }
      />
    </div>
  );
}