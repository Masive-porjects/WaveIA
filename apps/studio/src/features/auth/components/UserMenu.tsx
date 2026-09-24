"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { User as UserIcon, LogOut, ChevronDown, ShieldCheck, Mail } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useTranslation } from "@/i18n/useTranslation";
import { GoogleIcon, SpotifyIcon, DiscordIcon, GitHubIcon } from "./SocialIcons";

function getProviderMeta(providerRaw?: string, t?: (key: string, fallback: string) => string) {
  const provider = (providerRaw || "email").toLowerCase();
  if (provider.includes("google")) {
    return {
      id: "google",
      name: t ? t("auth.providerGoogle", "Google") : "Google",
      icon: <GoogleIcon className="size-3.5 shrink-0" />,
      badgeColor: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    };
  }
  if (provider.includes("spotify")) {
    return {
      id: "spotify",
      name: t ? t("auth.providerSpotify", "Spotify") : "Spotify",
      icon: <SpotifyIcon className="size-3.5 shrink-0" />,
      badgeColor: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    };
  }
  if (provider.includes("discord")) {
    return {
      id: "discord",
      name: t ? t("auth.providerDiscord", "Discord") : "Discord",
      icon: <DiscordIcon className="size-3.5 shrink-0" />,
      badgeColor: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
    };
  }
  if (provider.includes("github")) {
    return {
      id: "github",
      name: t ? t("auth.providerGithub", "GitHub") : "GitHub",
      icon: <GitHubIcon className="size-3.5 shrink-0" />,
      badgeColor: "bg-neutral-500/10 text-neutral-300 border-neutral-500/20",
    };
  }
  return {
    id: "email",
    name: t ? t("auth.providerEmail", "Correo electrónico") : "Email",
    icon: <Mail size={13} className="shrink-0 text-[var(--accent-primary)]" />,
    badgeColor: "bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] border-[var(--accent-primary)]/20",
  };
}

export default function UserMenu() {
  const { user, profile, isAdmin, isLoading, signOut } = useAuth();
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

  const rawProvider =
    user.app_metadata?.provider ||
    user.identities?.[0]?.provider ||
    "email";
  const providerMeta = getProviderMeta(rawProvider, t);

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="true"
        className={`flex items-center gap-2 p-1 pl-1.5 pr-2.5 rounded-full border bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)] transition-all text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-primary)] ${
          isAdmin
            ? "border-amber-500/40 hover:border-amber-500/60 shadow-[0_0_12px_rgba(245,158,11,0.15)]"
            : "border-[var(--border-subtle)] hover:border-[var(--border-strong)]"
        }`}
      >
        <div className="relative shrink-0">
          <div
            className={`size-7 rounded-full flex items-center justify-center text-xs font-bold ${
              isAdmin
                ? "bg-amber-500/20 border border-amber-500/40 text-amber-400"
                : "bg-[var(--accent-primary)]/20 border border-[var(--accent-primary)]/40 text-[var(--accent-primary)]"
            }`}
          >
            {userInitial}
          </div>
          <span
            title={`${t("auth.accessMethod", "Método de acceso")}: ${providerMeta.name}`}
            className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full bg-[var(--bg-elevated)] border border-[var(--border-subtle)] flex items-center justify-center shadow-xs overflow-hidden p-0.5"
          >
            {providerMeta.icon}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="hidden sm:inline-block text-xs font-medium max-w-[100px] truncate">
            {displayName}
          </span>
          {isAdmin && (
            <span className="hidden md:inline-block text-[9px] uppercase font-bold tracking-wider px-1 rounded bg-amber-500/20 text-amber-400 border border-amber-500/40">
              Admin
            </span>
          )}
        </div>
        <ChevronDown
          size={13}
          className={`text-[var(--text-muted)] transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {isOpen && (
        <div
          className="absolute right-0 mt-2 w-64 rounded-2xl border p-2 shadow-2xl backdrop-blur-2xl z-50 animate-in fade-in slide-in-from-top-2 duration-150"
          style={{
            background: "var(--bg-glass-elevated)",
            borderColor: "var(--border-strong)",
            boxShadow: "0 16px 40px -10px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)",
          }}
        >
          <div className="px-3 py-2 border-b border-[var(--border-subtle)] mb-1">
            <div className="flex items-center justify-between gap-1 mb-0.5">
              <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                {displayName}
              </p>
              <span
                className={`text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-full border ${
                  isAdmin
                    ? "bg-amber-500/15 border-amber-500/40 text-amber-400"
                    : "bg-[var(--accent-primary)]/15 border-[var(--accent-primary)]/30 text-[var(--accent-primary)]"
                }`}
              >
                {isAdmin ? t("auth.roleAdmin", "Admin") : t("auth.roleUser", "Usuario")}
              </span>
            </div>
            <p className="text-[11px] text-[var(--text-muted)] truncate mb-2">{user.email}</p>

            {/* Provider Flag / Bandera de acceso */}
            <div className="flex items-center justify-between pt-1.5 border-t border-[var(--border-subtle)] text-[10px]">
              <span className="text-[var(--text-muted)] font-medium">
                {t("auth.accessMethod", "Método de acceso")}
              </span>
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border font-medium shadow-xs ${providerMeta.badgeColor}`}
              >
                {providerMeta.icon}
                <span>{providerMeta.name}</span>
              </span>
            </div>
          </div>

          <div className="space-y-0.5">
            {isAdmin && (
              <Link
                href="/admin"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-xs rounded-xl hover:bg-amber-500/10 text-amber-400 hover:text-amber-300 transition-colors font-medium"
              >
                <ShieldCheck size={14} className="text-amber-400" />
                <span>{t("admin.menuLink", "Panel de Administración")}</span>
              </Link>
            )}

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
