"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { GhostIcon } from "@/components/ThemeToggle";

const NOTE_COLORS = ["#ff5a5f", "#ffb347", "#4ecdc4", "#7b68ee", "#ff6b9d"];

/* Deterministic pseudo-random — hydration-safe */
function seeded(index: number): number {
  const x = Math.sin(index * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

const RADIUS = 96;
const NOTE_COUNT = 7;

interface BigGhostWithNotesProps {
  className?: string;
  style?: React.CSSProperties;
  /** Ghost icon size in px (default 80). */
  size?: number;
  /** Base orbit radius in px (default 96). */
  radius?: number;
  /** Number of orbiting notes (default 7). */
  noteCount?: number;
}

/**
 * A large centerpiece ghost ("Mente y Alma") with musical notes
 * orbiting around it in a slow, meditative loop. Can be leaned
 * against a card frame ("recostado") or shown floating in the
 * background. Purely decorative.
 */
export default function BigGhostWithNotes({
  className,
  style,
  size = 80,
  radius = RADIUS,
  noteCount = NOTE_COUNT,
}: BigGhostWithNotesProps) {
  const scopeRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const noteRefs = useRef<(SVGSVGElement | null)[]>([]);

  useGSAP(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = gsap.context(() => {
      /* Ghost gentle bob + rotate */
      if (ghostRef.current) {
        gsap.to(ghostRef.current, {
          y: -12,
          rotation: 3,
          duration: 4.2,
          ease: "sine.inOut",
          repeat: -1,
          yoyo: true,
        });
      }

      /* Orbiting notes — each on its own radius + phase */
      noteRefs.current.forEach((el, i) => {
        if (!el) return;
        const angle = (i / noteCount) * Math.PI * 2;
        const orbitRadius = radius + seeded(i * 7 + 3) * 32;
        const startAngle = angle + seeded(i * 5 + 11) * Math.PI * 2;
        const speed = 22 + seeded(i * 3 + 8) * 12; // seconds per orbit

        // Animate along the orbit using onUpdate
        gsap.to(el, {
          duration: speed,
          ease: "none",
          repeat: -1,
          onUpdate: function () {
            const p = this.progress();
            const a = startAngle + p * Math.PI * 2;
            gsap.set(el, {
              x: Math.cos(a) * orbitRadius,
              y: Math.sin(a) * orbitRadius,
              rotation: p * 360,
            });
          },
        });

        // Pulsing opacity
        gsap.to(el, {
          opacity: 0.3,
          duration: 1.8,
          ease: "sine.inOut",
          repeat: -1,
          yoyo: true,
          delay: -seeded(i * 2 + 6) * 1.8,
        });
      });
    }, scopeRef);

    return () => ctx.revert();
  }, { scope: scopeRef });

  return (
    <div
      ref={scopeRef}
      aria-hidden="true"
      className={`pointer-events-none flex items-center justify-center ${className ?? ""}`}
      style={{
        zIndex: 0,
        ...style,
      }}
    >
      {/* Ghost body — large */}
      <div ref={ghostRef} className="relative flex items-center justify-center">
        <span
          className="block text-[var(--accent-primary)]"
          style={{ width: size, height: size }}
        >
          <GhostIcon size={size} />
        </span>

        {/* Musical notes orbiting */}
        {Array.from({ length: noteCount }).map((_, i) => {
          const color = NOTE_COLORS[i % NOTE_COLORS.length];
          return (
            <svg
              key={i}
              ref={(el) => { noteRefs.current[i] = el; }}
              width={22}
              height={22}
              viewBox="0 0 24 24"
              fill="none"
              stroke={color}
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="absolute drop-shadow-[0_0_6px_rgba(255,255,255,0.35)]"
              style={{ opacity: 0.9 }}
            >
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
              <path d="M9 5l12-2" strokeWidth={1.6} />
            </svg>
          );
        })}
      </div>
    </div>
  );
}
