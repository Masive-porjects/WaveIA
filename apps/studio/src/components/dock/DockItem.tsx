"use client";

import type { LucideIcon } from "lucide-react";
import PedestalBase from "./PedestalBase";

interface DockItemProps {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onSelect: () => void;
  /** Callback-ref so the dock can drive fisheye transforms via GSAP. */
  buttonRef?: (el: HTMLButtonElement | null) => void;
}

/* ── DockItem ───────────────────────────────────────────
   One module entry: pedestal + icon + active dot. The fisheye
   scale is applied to the BUTTON only (origin bottom) so the
   tooltip lives outside the transformed node. */
export default function DockItem({
  icon: Icon,
  label,
  active,
  onSelect,
  buttonRef,
}: DockItemProps) {
  return (
    <div className="group relative flex flex-col items-center">
      {/* Tooltip — sibling of the scaled node, hover/focus revealed.
          z-50 lifts it above neighboring icon buttons: their GSAP fisheye
          transforms create stacking contexts that would otherwise paint
          over this absolutely-positioned label. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-full mb-2 z-50 whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-medium text-[var(--text-primary)] bg-[var(--bg-elevated)] border border-[var(--border-subtle)] shadow-lg opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {label}
      </span>
      <button
        ref={buttonRef}
        type="button"
        onClick={onSelect}
        aria-label={`Módulo ${label}`}
        aria-current={active ? "true" : undefined}
        className="relative origin-bottom rounded-full outline-none will-change-transform focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-app)]"
      >
        <PedestalBase active={active}>
          <Icon size={18} />
        </PedestalBase>
        {/* Active dot */}
        <span
          aria-hidden="true"
          className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[var(--accent-primary)] shadow transition-transform duration-200"
          style={{ transform: active ? "scale(1)" : "scale(0)" }}
        />
      </button>
    </div>
  );
}
