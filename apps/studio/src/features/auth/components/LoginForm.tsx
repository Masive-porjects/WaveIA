"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { Mail, Lock, Eye, EyeOff, ArrowRight, Loader2, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useTranslation } from "@/i18n/useTranslation";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/";
  const { t } = useTranslation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setIsLoading(true);
    setError(null);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message);
        return;
      }

      router.push(redirectTo);
      router.refresh();
    } catch {
      setError(t("auth.errorGeneric", "Ocurrió un error inesperado al iniciar sesión."));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="w-full max-w-[390px] mx-auto p-5 sm:p-6 rounded-3xl border shadow-2xl backdrop-blur-2xl relative overflow-hidden"
      style={{
        background: "var(--bg-glass-elevated)",
        borderColor: "var(--border-strong)",
        boxShadow: "0 24px 60px -15px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08)",
      }}
    >
      <div className="text-center mb-4">
        <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider mb-2 border border-[var(--accent-primary)]/30 bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]">
          WaveIA Studio
        </div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-primary)]">
          {t("auth.loginTitle", "Iniciar Sesión")}
        </h1>
        <p className="text-xs text-[var(--text-secondary)] mt-1">
          {t("auth.loginSubtitle", "Accede a tus proyectos y masters en la nube")}
        </p>
      </div>

      {error && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="mb-3.5 p-2.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 text-[11px] flex items-center gap-2"
        >
          <AlertCircle size={14} className="shrink-0" />
          <span>{error}</span>
        </motion.div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
            {t("auth.emailLabel", "Correo Electrónico")}
          </label>
          <div className="relative">
            <Mail
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
            />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="producer@waveia.com"
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)] transition-all"
            />
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
            {t("auth.passwordLabel", "Contraseña")}
          </label>
          <div className="relative">
            <Lock
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
            />
            <input
              type={showPassword ? "text" : "password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full pl-9 pr-9 py-2 text-xs rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)] transition-all"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-1 cursor-pointer"
            >
              {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full mt-1.5 py-2.5 px-4 rounded-xl font-semibold text-xs text-[var(--bg-base)] bg-[var(--accent-primary)] hover:brightness-110 active:scale-[0.99] transition-all flex items-center justify-center gap-2 shadow-lg shadow-[var(--accent-primary)]/20 disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
        >
          {isLoading ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <>
              <span>{t("auth.loginButton", "Entrar")}</span>
              <ArrowRight size={14} />
            </>
          )}
        </button>
      </form>

      <div className="mt-3.5 pt-3.5 border-t border-[var(--border-subtle)] text-center">
        <p className="text-[11px] text-[var(--text-secondary)]">
          {t("auth.dontHaveAccount", "¿No tienes una cuenta?")}{" "}
          <Link
            href={`/register${redirectTo !== "/" ? `?redirect=${encodeURIComponent(redirectTo)}` : ""}`}
            className="text-[var(--accent-primary)] hover:underline font-semibold"
          >
            {t("auth.createAccount", "Regístrate gratis")}
          </Link>
        </p>
      </div>
    </motion.div>
  );
}
