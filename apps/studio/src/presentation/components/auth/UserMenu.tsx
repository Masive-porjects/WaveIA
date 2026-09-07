"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  User,
  LogOut,
  Crown,
  ChevronDown,
  Sun,
  Moon,
  Focus,
} from "lucide-react";
import { useRole } from "@/application/hooks/useRole";
import { useFocusMode } from "@/application/hooks/useFocusMode";
import { ROLE_LABELS, type UserRole } from "@/core/roles";
import { useThemeMode } from "@/components/ThemeToggle";

/* ── Cuenta menu ─────────────────────────────────────────
   Header cleanup: Plan + user + toggles (tema, modo foco) live in
   ONE menu ("Cuenta") so the top-right corner has a single primary
   action instead of competing icon buttons. Microcopy rioplatense. */
export default function UserMenu() {
  const router = useRouter();
  const { role, setRole } = useRole();
  const { focus, toggle: toggleFocus } = useFocusMode();
  const { isDark, toggle: toggleTheme } = useThemeMode();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("waveai-auth");
    localStorage.removeItem("waveai-user");
    localStorage.removeItem("waveai-role");
    localStorage.removeItem("waveai-session");
    router.push("/login");
  };

  const handleUpgrade = () => {
    const next: UserRole = "premium";
    setRole(next);
    const user = localStorage.getItem("waveai-user");
    if (user) {
      const parsed = JSON.parse(user);
      parsed.role = next;
      localStorage.setItem("waveai-user", JSON.stringify(parsed));
    }
    setOpen(false);
  };

  return (
    <div ref={menuRef} className="relative">
      {/* Single trigger: avatar + plan + chevron. The toggles moved inside. */}
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Cuenta"
        className="flex items-center gap-2 rounded-full pl-3 pr-2 py-1.5
          bg-white/6 ring-1 ring-white/10 hover:ring-white/20
          shadow-[0_8px_30px_rgba(0,0,0,.35)] backdrop-blur-md
          transition-all duration-200 hover:bg-white/10 active:bg-white/12
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300/60"
      >
        <span className="text-xs font-medium text-white/85 hidden sm:inline">
          {ROLE_LABELS[role]}
        </span>
        <span className="w-7 h-7 rounded-full bg-[var(--accent-primary)]/25 flex items-center justify-center text-[var(--accent-primary)] drop-shadow-[0_2px_6px_rgba(0,0,0,.45)]">
          <User size={14} strokeWidth={2} aria-hidden="true" />
        </span>
        <ChevronDown
          size={14}
          aria-hidden="true"
          className={`text-white/60 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-64 rounded-xl glass-elevated p-2 z-50 shadow-[var(--shadow-heavy)]"
        >
          <div className="px-3 py-2 border-b border-[var(--border-subtle)]">
            <p className="text-xs text-[var(--text-muted)]">Plan activo</p>
            <p className="text-sm font-medium text-[var(--text-primary)]">{ROLE_LABELS[role]}</p>
          </div>

          {role === "basic" && (
            <button
              role="menuitem"
              onClick={handleUpgrade}
              className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/10 transition-colors"
            >
              <Crown size={16} aria-hidden="true" />
              Subir a Premium
            </button>
          )}

          <button
            role="menuitem"
            onClick={() => {
              toggleTheme();
              setOpen(false);
            }}
            className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors"
          >
            {isDark ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
            Tema: {isDark ? "claro" : "oscuro"}
          </button>

          <button
            role="menuitemcheckbox"
            onClick={toggleFocus}
            aria-checked={focus}
            className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors"
          >
            <Focus size={16} aria-hidden="true" />
            <span className="flex-1">Modo foco</span>
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 rounded-full transition-colors ${focus ? "bg-teal-300/90 shadow-[0_0_6px_rgba(94,234,212,0.9)]" : "bg-[var(--text-muted)]"}`}
            />
          </button>

          <div className="my-1 border-t border-[var(--border-subtle)]" />

          <button
            role="menuitem"
            onClick={handleLogout}
            className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors"
          >
            <LogOut size={16} aria-hidden="true" />
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}