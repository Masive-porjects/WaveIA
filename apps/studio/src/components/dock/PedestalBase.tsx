"use client";

interface PedestalBaseProps {
  active?: boolean;
  children: React.ReactNode;
}

/* ── Skeuomorphic pedestal ──────────────────────────────
   Machined-metal circular base built purely from layered
   CSS gradients/inset shadows — no external images. A top-left
   specular highlight, a conic brushed-steel body and two inner
   rings suggest a turned metal puck. */
export default function PedestalBase({
  active = false,
  children,
}: PedestalBaseProps) {
  return (
    <span
      className="relative grid h-12 w-12 place-items-center rounded-full"
      style={{
        background: [
          "radial-gradient(circle at 32% 26%, rgba(255,255,255,0.16), rgba(255,255,255,0) 46%)",
          "conic-gradient(from 215deg, #363a41, #202329 22%, #3d434c 47%, #191b20 68%, #30343b 86%, #363a41)",
        ].join(", "),
        border: "1px solid rgba(255,255,255,0.09)",
        boxShadow: [
          "inset 0 1px 1px rgba(255,255,255,0.18)",
          "inset 0 -3px 5px rgba(0,0,0,0.55)",
          "0 6px 14px rgba(0,0,0,0.45)",
          active
            ? "0 0 0 1.5px color-mix(in srgb, var(--accent-primary) 55%, transparent)"
            : "",
        ]
          .filter(Boolean)
          .join(", "),
      }}
    >
      {/* Machined inner rings */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-[4px] rounded-full"
        style={{
          border: "1px solid rgba(0,0,0,0.4)",
          boxShadow: "inset 0 1px 2px rgba(0,0,0,0.45)",
        }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-[7px] rounded-full"
        style={{
          border: "1px solid rgba(255,255,255,0.06)",
          background:
            "radial-gradient(circle at 50% 30%, rgba(255,255,255,0.05), rgba(0,0,0,0.25))",
        }}
      />
      <span
        className={`relative z-10 transition-colors duration-200 ${
          active
            ? "text-[var(--accent-primary)]"
            : "text-[var(--text-muted)]"
        }`}
      >
        {children}
      </span>
    </span>
  );
}
