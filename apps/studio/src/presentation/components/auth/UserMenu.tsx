"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { User, LogOut, Crown } from "lucide-react";
import { useRole } from "@/application/hooks/useRole";
import { ROLE_LABELS, type UserRole } from "@/core/roles";

export default function UserMenu() {
  const router = useRouter();
  const { role, setRole } = useRole();
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
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-full pl-3 pr-2 py-1.5 glass hover:bg-[var(--surface-hover)] transition-all"
      >
        <span className="text-xs text-[var(--text-secondary)] hidden sm:inline">{ROLE_LABELS[role]}</span>
        <div className="w-7 h-7 rounded-full bg-[var(--accent-primary)]/20 flex items-center justify-center text-[var(--accent-primary)]">
          <User size={14} />
        </div>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 rounded-xl glass-elevated p-2 z-50">
          <div className="px-3 py-2 border-b border-[var(--border-subtle)]">
            <p className="text-xs text-[var(--text-muted)]">Plan activo</p>
            <p className="text-sm font-medium text-[var(--text-primary)]">{ROLE_LABELS[role]}</p>
          </div>

          {role === "basic" && (
            <button
              onClick={handleUpgrade}
              className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/10 transition-colors"
            >
              <Crown size={16} />
              Subir a Premium
            </button>
          )}

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors"
          >
            <LogOut size={16} />
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}
