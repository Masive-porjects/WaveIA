"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Info } from "lucide-react";

interface PresetTooltipProps {
  text: string;
  color: string;
}

/**
 * Glassmorphism tooltip that appears on hover.
 * Educates the artist about what the preset does to their audio.
 */
export default function PresetTooltip({ text, color }: PresetTooltipProps) {
  const [show, setShow] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setShow(true), 300);
  };

  const handleLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setShow(false), 150);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative inline-flex"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onFocus={handleEnter}
      onBlur={handleLeave}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label="Más información sobre este preset"
        className="w-4 h-4 rounded-full flex items-center justify-center
          text-[var(--text-muted)] hover:text-[var(--text-secondary)]
          transition-colors duration-200"
        style={{ opacity: 0.6 }}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
      >
        <Info size={12} />
      </button>

      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.96 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50
              w-56 p-3 rounded-xl pointer-events-none
              backdrop-blur-2xl backdrop-saturate-150"
            style={{
              background: "var(--bg-glass-elevated)",
              border: `1px solid ${color}40`,
              boxShadow: `0 8px 32px rgba(0,0,0,0.3), 0 0 16px ${color}15`,
            }}
            onMouseEnter={handleEnter}
            onMouseLeave={handleLeave}
          >
            {/* Frosted rim */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px rounded-t-xl bg-gradient-to-r from-transparent via-white/20 to-transparent" />

            {/* Arrow */}
            <div
              className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0"
              style={{
                borderLeft: "6px solid transparent",
                borderRight: "6px solid transparent",
                borderTop: `6px solid ${color}40`,
              }}
            />

            <p className="text-[11px] leading-relaxed text-[var(--text-secondary)]">
              {text}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
