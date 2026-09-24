"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { User as UserIcon, LogOut, Sparkles, ChevronDown } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useTranslation } from "@/i18n/useTranslation";

export default function UserMenu() {
  const { user, profile, isLoading, signOut } = useAuth();
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (isLoading) {
    return (
      <div className="size-8 rounded-full animate-pulse bg-[var(--surface-hover)] border border-[var(--border-subtle)]" />
    );
  }

  if (!user) {
    return (
      <Link
        href="/login"
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full border border-[var(--border-subtle)] bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)] hover:border-[var(--accent-primary)] text-[var(--text-primary)] transition-all shadow-sm"
      >
        <UserIcon size={14} className="text-[var(--accent-primary)]" />
        <span>{t("auth.signIn", "Iniciar sesión")}</span>
      </Link>
    );
  }

  const displayName = profile?.display_name || user.email?.split("@")[0] || "Producer";
  const userInitial = displayName.charAt(0).toUpperCase();

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="true"
        className="flex items-center gap-2 p-1 pl-1.5 pr-2.5 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)] hover:border-[var(--border-strong)] transition-all text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-primary)]"
      >
        <div className="size-7 rounded-full bg-[var(--accent-primary)]/20 border border-[var(--accent-primary)]/40 flex items-center justify-center text-xs font-bold text-[var(--accent-primary)] shrink-0">
          {userInitial}
        </div>
        <span className="hidden sm:inline-block text-xs font-medium max-w-[100px] truncate">
          {displayName}
        </span>
        <ChevronDown
          size={13}
          className={`text-[var(--text-muted)] transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {isOpen && (
        <div
          className="absolute right-0 mt-2 w-56 rounded-2xl border p-2 shadow-2xl backdrop-blur-2xl z-50 animate-in fade-in slide-in-from-top-2 duration-150"
          style={{
            background: "var(--bg-glass-elevated)",
            borderColor: "var(--border-strong)",
            boxShadow: "0 16px 40px -10px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)",
          }}
        >
          <div className="px-3 py-2 border-b border-[var(--border-subtle)] mb-1">
            <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
              {displayName}
            </p>
            <p className="text-[11px] text-[var(--text-muted)] truncate">{user.email}</p>
          </div>

          <div className="space-y-0.5">
            <Link
              href="/"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-xs rounded-xl hover:bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              <Sparkles size={14} className="text-[var(--accent-primary)]" />
              <span>{t("nav.studio", "Mastering Studio")}</span>
            </Link>

            <button
              type="button"
              onClick={async () => {
                setIsOpen(false);
                await signOut();
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs rounded-xl hover:bg-red-500/10 text-red-400 hover:text-red-300 transition-colors text-left"
            >
              <LogOut size={14} />
              <span>{t("auth.signOut", "Cerrar sesión")}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
