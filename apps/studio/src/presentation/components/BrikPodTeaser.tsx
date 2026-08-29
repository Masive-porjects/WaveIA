"use client";

import { motion } from "framer-motion";
import { Mic, Radio, Volume2, Download } from "lucide-react";

/* ── BrikPod Teaser — "Próximamente" card
   Placed below the upload card on the landing view.
   Zero interactivity: purely informational. */

const FEATURES = [
  {
    icon: Volume2,
    title: "Auto-Leveling",
    desc: "Voz de host e invitado al mismo volumen, automático",
  },
  {
    icon: Radio,
    title: "Ruido Cero",
    desc: "Eliminación de eco y ruido de habitaciones",
  },
  {
    icon: Download,
    title: "Export -16 LUFS",
    desc: "Estándar Apple Podcasts y Spotify en un click",
  },
] as const;

export default function BrikPodTeaser() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className="w-full max-w-2xl mt-6"
    >
      <div
        className="relative rounded-2xl p-5 overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, rgba(94,92,230,0.06) 0%, rgba(139,92,246,0.04) 50%, rgba(94,92,230,0.02) 100%)",
          border: "1px solid rgba(94,92,230,0.12)",
        }}
      >
        {/* Subtle gradient glow */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at 20% 50%, rgba(94,92,230,0.08) 0%, transparent 60%)",
          }}
        />

        {/* Header row */}
        <div className="relative flex items-center gap-3 mb-4">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: "rgba(94,92,230,0.12)",
              border: "1px solid rgba(94,92,230,0.15)",
            }}
          >
            <Mic size={16} className="text-[#5e5ce6]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                Brik<span className="text-[#5e5ce6]">Pod</span>
              </h3>
              <span
                className="px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider"
                style={{
                  background: "rgba(94,92,230,0.12)",
                  color: "#5e5ce6",
                }}
              >
                Próximamente
              </span>
            </div>
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
              Mastering para podcasters — sin técnica, solo resultados
            </p>
          </div>
        </div>

        {/* Feature pills */}
        <div className="relative grid grid-cols-1 sm:grid-cols-3 gap-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="flex items-start gap-2.5 rounded-xl px-3 py-2.5"
              style={{
                background: "rgba(94,92,230,0.04)",
                border: "1px solid rgba(94,92,230,0.08)",
              }}
            >
              <f.icon
                size={14}
                className="text-[#5e5ce6] shrink-0 mt-0.5"
              />
              <div>
                <p className="text-xs font-medium text-[var(--text-secondary)]">
                  {f.title}
                </p>
                <p className="text-[10px] text-[var(--text-muted)] mt-0.5 leading-relaxed">
                  {f.desc}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom hint */}
        <p className="relative text-[10px] text-[var(--text-muted)] mt-3 text-center opacity-60">
          Grabá tu episodio con el botón de arriba — cuando BrikPod llegue, tu workflow estará listo
        </p>
      </div>
    </motion.div>
  );
}
