"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { KeyRound, Mail, Lock, UserPlus, LogIn } from "lucide-react";
import { useRole } from "@/application/hooks/useRole";
import { ROLE_LABELS, type UserRole } from "@/core/roles";
import BigGhostWithNotes from "@/components/BigGhostWithNotes";
import FloatingGhosts from "@/components/FloatingGhosts";
import FloatingNotes from "@/components/FloatingNotes";

const AUTH_KEY = "waveai-auth";
const USER_KEY = "waveai-user";

type Mode = "login" | "register";

export default function LoginScreen() {
  const router = useRouter();
  const { setRole } = useRole();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [selectedRole, setSelectedRole] = useState<UserRole>("basic");
  const [error, setError] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (!cardRef.current) return;
      gsap.from(cardRef.current, {
        opacity: 0,
        y: 24,
        filter: "blur(8px)",
        duration: 0.7,
        ease: "power2.out",
      });
    },
    { scope: cardRef },
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === "register") {
      if (password !== confirm) {
        setError("Las contraseñas no coinciden.");
        return;
      }
      const user = { email, password, role: selectedRole };
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      setRole(selectedRole);
      localStorage.setItem(AUTH_KEY, "1");
      router.push("/");
      return;
    }

    // login
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) {
      setError("No hay una cuenta registrada. Registrate primero.");
      return;
    }
    const user = JSON.parse(raw);
    if (user.email !== email || user.password !== password) {
      setError("Email o contraseña incorrectos.");
      return;
    }
    setRole(user.role ?? "basic");
    localStorage.setItem(AUTH_KEY, "1");
    router.push("/");
  };

  const isLogin = mode === "login";

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center overflow-hidden bg-[var(--bg-app)]">
      <FloatingGhosts zIndex={0} className="opacity-25" />
      <FloatingNotes zIndex={0} className="opacity-25" />

      <div className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center">
        <BigGhostWithNotes />
      </div>

      <div
        ref={cardRef}
        className="relative z-10 w-full max-w-md rounded-2xl p-6 sm:p-8 m-4 glass-elevated"
      >
        <div className="mb-6 flex items-center justify-center gap-3">
          <div className="rounded-full p-2 bg-[var(--accent-primary)]/10">
            <KeyRound size={24} className="text-[var(--accent-primary)]" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">
            Wave<span className="text-[var(--accent-primary)]">AI</span>
          </h1>
        </div>

        <div className="mb-6 flex rounded-lg bg-[var(--bg-primary)] p-1 ring-1 ring-[var(--border-subtle)]">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-xs font-medium transition-all ${
              isLogin
                ? "bg-[var(--accent-primary)] text-white"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            <LogIn size={14} /> Iniciar sesión
          </button>
          <button
            type="button"
            onClick={() => setMode("register")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-xs font-medium transition-all ${
              !isLogin
                ? "bg-[var(--accent-primary)] text-white"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            <UserPlus size={14} /> Registrarse
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="email" className="text-xs text-[var(--text-secondary)]">Email</label>
            <div className="relative">
              <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                required
                className="w-full rounded-lg bg-[var(--bg-primary)] py-2.5 pl-9 pr-3 text-sm text-[var(--text-primary)] outline-none ring-1 ring-[var(--border-subtle)] focus:ring-[var(--accent-primary)] placeholder:text-[var(--text-muted)]"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="password" className="text-xs text-[var(--text-secondary)]">Contraseña</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full rounded-lg bg-[var(--bg-primary)] py-2.5 pl-9 pr-3 text-sm text-[var(--text-primary)] outline-none ring-1 ring-[var(--border-subtle)] focus:ring-[var(--accent-primary)] placeholder:text-[var(--text-muted)]"
              />
            </div>
          </div>

          {!isLogin && (
            <div className="space-y-1">
              <label htmlFor="confirm" className="text-xs text-[var(--text-secondary)]">Confirmar contraseña</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  id="confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full rounded-lg bg-[var(--bg-primary)] py-2.5 pl-9 pr-3 text-sm text-[var(--text-primary)] outline-none ring-1 ring-[var(--border-subtle)] focus:ring-[var(--accent-primary)] placeholder:text-[var(--text-muted)]"
                />
              </div>
            </div>
          )}

          {!isLogin && (
            <div className="space-y-2">
              <span className="text-xs text-[var(--text-secondary)]">Elegí tu plan</span>
              <div className="grid grid-cols-2 gap-2">
                {(["basic", "premium"] as UserRole[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setSelectedRole(r)}
                    className={`rounded-lg border px-3 py-3 text-left transition-all ${
                      selectedRole === r
                        ? "border-[var(--accent-primary)] bg-[var(--accent-primary)]/10"
                        : "border-[var(--border-subtle)] hover:bg-[var(--surface-hover)]"
                    }`}
                  >
                    <div className="text-sm font-medium text-[var(--text-primary)]">{ROLE_LABELS[r]}</div>
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-[var(--text-muted)]">
                Por ahora, basic y premium acceden al mismo flujo. Los bloqueos de funciones se activarán después.
              </p>
            </div>
          )}

          {error && (
            <p className="text-xs text-[var(--accent-error)]">{error}</p>
          )}

          <button
            type="submit"
            className="w-full rounded-lg bg-[var(--accent-primary)] py-2.5 text-sm font-medium text-white transition-all hover:brightness-110"
          >
            {isLogin ? "Iniciar sesión" : "Crear cuenta"}
          </button>
        </form>
      </div>
    </div>
  );
}
