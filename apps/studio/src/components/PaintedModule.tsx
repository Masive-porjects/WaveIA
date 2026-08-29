"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";

interface PaintedModuleProps {
  children: React.ReactNode;
  className?: string;
}

/* ── Painted Module (paint-brush entrance) ──────────────
   Wraps a module and "paints" it onto the canvas: an accent
   stroke sweeps left -> right while the content fades/rises
   in underneath, then the stroke dissolves. The consumer
   remounts it with key={currentTab} so the entrance re-runs
   each time a new module is painted. */

export default function PaintedModule({
  children,
  className,
}: PaintedModuleProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const overlay = overlayRef.current;
      const content = contentRef.current;
      if (!overlay || !content) return;

      // Respect reduced motion: keep content visible, hide the stroke
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        gsap.set(overlay, { opacity: 0 });
        return;
      }

      // Start: content hidden/offset, stroke clipped at the left edge
      gsap.set(content, { opacity: 0, y: 26, scale: 0.985 });
      gsap.set(overlay, { clipPath: "inset(0 100% 0 0)", opacity: 0.55 });

      const tl = gsap.timeline();
      tl.to(overlay, {
        clipPath: "inset(0 0% 0 0)",
        duration: 0.7,
        ease: "power2.inOut",
      })
        .to(
          content,
          {
            opacity: 1,
            y: 0,
            scale: 1,
            duration: 0.55,
            ease: "power2.out",
            clearProps: "opacity,y,scale",
          },
          0.1,
        )
        .to(
          overlay,
          {
            opacity: 0,
            duration: 0.45,
            ease: "power2.out",
            clearProps: "clipPath,opacity",
          },
          "-=0.15",
        );

      return () => {
        tl.kill();
      };
    },
    { scope: rootRef },
  );

  return (
    <div
      ref={rootRef}
      className={`relative ${className ?? ""}`}
    >
      {/* Paint stroke — sweeps across the panel, then dissolves */}
      <div
        ref={overlayRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          background:
            "linear-gradient(90deg, transparent, color-mix(in srgb, var(--accent-primary) 18%, transparent) 40%, color-mix(in srgb, var(--accent-secondary) 12%, transparent) 70%, transparent)",
        }}
      />
      {/* Content */}
      <div ref={contentRef} className="relative z-20">
        {children}
      </div>
    </div>
  );
}
