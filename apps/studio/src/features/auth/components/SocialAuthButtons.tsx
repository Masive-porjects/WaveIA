"use client";

import { useState } from "react";
import { Mail, Loader2, AlertCircle } from "lucide-react";
import type { Provider } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { useTranslation } from "@/i18n/useTranslation";
import { GoogleIcon, GitHubIcon, FacebookIcon, InstagramIcon } from "./SocialIcons";

interface SocialAuthButtonsProps {
  mode: "login" | "register";
  redirectTo?: string;
  onContinueWithEmail: () => void;
}

export default function SocialAuthButtons({
  mode,
  redirectTo = "/",
  onContinueWithEmail,
}: SocialAuthButtonsProps) {
  const { t } = useTranslation();
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);
  const [oauthError, setOauthError] = useState<string | null>(null);

  const supabase = createClient();

  const handleOAuthSignIn = async (provider: Provider | "instagram") => {
    setLoadingProvider(provider);
    setOauthError(null);

    try {
      const redirectUrl = `${window.location.origin}/auth/callback?next=${encodeURIComponent(
        redirectTo
      )}`;

      // Instagram uses Facebook (Meta) OAuth provider in Supabase
      const actualProvider: Provider = provider === "instagram" ? "facebook" : provider;

      const { error } = await supabase.auth.signInWithOAuth({
        provider: actualProvider,
        options: {
          redirectTo: redirectUrl,
          queryParams: provider === "instagram" ? { auth_type: "reauthenticate" } : undefined,
        },
      });

      if (error) {
        setOauthError(error.message);
        setLoadingProvider(null);
      }
    } catch {
      setOauthError(
        t("auth.oauthErrorGeneric", "Error al iniciar sesión con el proveedor seleccionado.")
      );
      setLoadingProvider(null);
    }
  };

  return (
    <div className="space-y-3">
      {oauthError && (
        <div className="p-2.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 text-[11px] flex items-center gap-2">
          <AlertCircle size={14} className="shrink-0" />
          <span>{oauthError}</span>
        </div>
      )}

      {/* Primary Social Options Grid */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={!!loadingProvider}
          onClick={() => handleOAuthSignIn("google")}
          className="flex items-center justify-center gap-2 py-2 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)] hover:border-[var(--accent-primary)] text-xs font-medium text-[var(--text-primary)] transition-all cursor-pointer disabled:opacity-50"
        >
          {loadingProvider === "google" ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <GoogleIcon className="size-4 shrink-0" />
          )}
          <span>Google</span>
        </button>

        <button
          type="button"
          disabled={!!loadingProvider}
          onClick={() => handleOAuthSignIn("github")}
          className="flex items-center justify-center gap-2 py-2 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)] hover:border-[var(--accent-primary)] text-xs font-medium text-[var(--text-primary)] transition-all cursor-pointer disabled:opacity-50"
        >
          {loadingProvider === "github" ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <GitHubIcon className="size-4 shrink-0" />
          )}
          <span>GitHub</span>
        </button>

        <button
          type="button"
          disabled={!!loadingProvider}
          onClick={() => handleOAuthSignIn("facebook")}
          className="flex items-center justify-center gap-2 py-2 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)] hover:border-[var(--accent-primary)] text-xs font-medium text-[var(--text-primary)] transition-all cursor-pointer disabled:opacity-50"
        >
          {loadingProvider === "facebook" ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <FacebookIcon className="size-4 shrink-0" />
          )}
          <span>Facebook</span>
        </button>

        <button
          type="button"
          disabled={!!loadingProvider}
          onClick={() => handleOAuthSignIn("instagram")}
          className="flex items-center justify-center gap-2 py-2 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)] hover:border-[var(--accent-primary)] text-xs font-medium text-[var(--text-primary)] transition-all cursor-pointer disabled:opacity-50"
        >
          {loadingProvider === "instagram" ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <InstagramIcon className="size-4 shrink-0 rounded-sm" />
          )}
          <span>Instagram</span>
        </button>
      </div>

      {/* Divider */}
      <div className="relative my-3 flex items-center justify-center">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-[var(--border-subtle)]" />
        </div>
        <span className="relative px-2 bg-[var(--surface-elevated)] text-[10px] uppercase font-bold tracking-wider text-[var(--text-muted)] rounded-full border border-[var(--border-subtle)]">
          {t("auth.orContinueWith", "o continúa con")}
        </span>
      </div>

      {/* Switch to email form button */}
      <button
        type="button"
        onClick={onContinueWithEmail}
        className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold border border-[var(--accent-primary)]/40 bg-[var(--accent-primary)]/10 hover:bg-[var(--accent-primary)]/20 text-[var(--accent-primary)] transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
      >
        <Mail size={15} />
        <span>
          {mode === "login"
            ? t("auth.continueWithEmail", "Ingresar con Correo y Contraseña")
            : t("auth.registerWithEmail", "Registrarse con Correo Electrónico")}
        </span>
      </button>
    </div>
  );
}
