"use client";

import dynamic from "next/dynamic";

/**
 * Thin wrapper: loads the groove sequencer as a lazy, client-only chunk so
 * Tone.js never reaches the server bundle or the SongStarter chunk.
 * Per Next.js docs (App Router), `ssr: false` must live inside a Client
 * Component — hence this file is the boundary.
 */
const GrooveSequencerImpl = dynamic(() => import("./GrooveSequencerImpl"), {
  ssr: false,
  loading: () => (
    <div
      className="rounded-2xl p-5 text-xs text-[var(--text-muted)]"
      style={{
        background: "var(--surface-hover)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      Cargando secuenciador…
    </div>
  ),
});

export default function GrooveSequencer() {
  return <GrooveSequencerImpl />;
}
