"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { KeyRound, Mail, Lock } from "lucide-react";
import { useRole } from "@/application/hooks/useRole";
import { ROLE_LABELS, ROLE_FEATURES, type UserRole } from "@/core/roles";
import BigGhostWithNotes from "@/components/BigGhostWithNotes";
import FloatingGhosts from "@/components/FloatingGhosts";
import FloatingNotes from "@/components/FloatingNotes";

const AUTH_KEY = "brikmaster-auth";

export default function LoginScreen() {
  const router = useRouter();
  const { role, setRole } = useRole();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selectedRole, setSelectedRole] = useState<UserRole>(role);
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

  useEffect(() => {
    setRole(selectedRole);
  }, [selectedRole, setRole]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem(AUTH_KEY, "1");
    router.push("/");
  };

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
            Brik<span className="text-[var(--accent-primary)]">Master</span>
          </h1>
        </div>

        <p className="mb-6 text-center text-sm text-[var(--text-secondary)]">
          Ingresá a tu estudio. Por ahora, basic y premium acceden al mismo flujo.
        </p>

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
                className="w-full rounded-lg bg-[var(--bg-primary)] py-2.5 pl-9 pr-3 text-sm text-[var(--text-primary)] outline-none ring-1 ring-[var(--border-subtle)] focus:ring-[var(--accent-primary)] placeholder:text-[var(--text-muted)]"
              />
            </div>
          </div>

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
                  <ul className="mt-2 space-y-0.5">
                    {ROLE_FEATURES[r].slice(0, 2).map((f) => (
                      <li key={f} className="text-[10px] text-[var(--text-muted)]">• {f}</li>
                    ))}
                  </ul>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-[var(--text-muted)]">
              El premium incluye todo lo básico más Live Engine y Asistente de voz.
            </p>
          </div>

          <button
            type="submit"
            className="w-full rounded-lg bg-[var(--accent-primary)] py-2.5 text-sm font-medium text-white transition-all hover:brightness-110"
          >
            Iniciar sesión
          </button>
        </form>

        <p className="mt-4 text-center text-[10px] text-[var(--text-muted)]">
          Ambos roles comparten el acceso actual. Los bloqueos se activarán cuando el flujo lo redirija.
        </p>
      </div>
    </div>
  );
}
