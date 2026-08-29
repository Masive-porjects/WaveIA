"use client";

import dynamic from "next/dynamic";

/* ── Dock telemetry tiles ───────────────────────────────
   Display-only compact readouts embedded between the dock's
   module groups. Spanish micro-labels, fixed footprint. */

const MotorTileImpl = dynamic(() => import("./MotorTileImpl"), {
  ssr: false,
  loading: () => <span className="block h-[26px] w-[64px]" />,
});

export function TileShell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex min-w-[64px] flex-col items-center justify-center gap-1 rounded-xl px-2 py-1.5"
      style={{
        background:
          "linear-gradient(180deg, var(--bg-glass-elevated), var(--bg-glass))",
        border: "1px solid var(--border-subtle)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
      }}
    >
      <span className="text-[8px] font-semibold uppercase leading-none tracking-[0.16em] text-[var(--text-muted)]">
        {label}
      </span>
      {children}
    </div>
  );
}

/** Progreso — % while processing, "—" when idle. */
export function ProgressTile({ progress }: { progress: number }) {
  const running = progress > 0;
  return (
    <TileShell label="Progreso">
      <span
        className={`text-xs font-semibold leading-none ${
          running
            ? "text-[var(--accent-primary)]"
            : "text-[var(--text-muted)]"
        }`}
      >
        {running ? `${Math.round(progress)}%` : "—"}
      </span>
    </TileShell>
  );
}

/** LUFS — integrated loudness of the master result (fallback analysis). */
export function LufsTile({ lufs }: { lufs: number | null }) {
  return (
    <TileShell label="LUFS">
      {lufs === null ? (
        <span className="text-xs font-semibold leading-none text-[var(--text-muted)]">
          —
        </span>
      ) : (
        <span
          className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold leading-none"
          style={{
            background:
              "color-mix(in srgb, var(--accent-success) 14%, transparent)",
            color: "var(--accent-success)",
          }}
        >
          {lufs.toFixed(1)}
        </span>
      )}
    </TileShell>
  );
}

/** Motor — live waveform of the shared engine bus (client-only canvas). */
export function MotorTile() {
  return (
    <TileShell label="Motor">
      <MotorTileImpl />
    </TileShell>
  );
}
