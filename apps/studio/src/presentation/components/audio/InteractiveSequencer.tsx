"use client";

import dynamic from "next/dynamic";

/**
 * Thin wrapper: loads the audio implementation as a lazy, client-only chunk
 * so Tone.js never reaches the server bundle or the main page bundle.
 * Per Next.js docs (App Router), `ssr: false` must live inside a Client
 * Component — hence this file is the boundary.
 */
const InteractiveSequencerImpl = dynamic(
  () => import("./InteractiveSequencerImpl"),
  {
    ssr: false,
    loading: () => (
      <div
        className="rounded-xl p-5 text-xs text-[var(--text-muted)]"
        style={{
          background: "var(--bg-glass)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        Cargando laboratorio de audio…
      </div>
    ),
  },
);

export default function InteractiveSequencer() {
  return <InteractiveSequencerImpl />;
}
