"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { ReactNode } from "react";

const AUTH_KEY = "waveai-auth";

/**
 * El login esta apagado por defecto.
 *
 * La "sesion" es un flag en localStorage sin ninguna verificacion de servidor,
 * asi que no protege nada: apagarlo no baja la seguridad, solo saca un paso de
 * por medio. Para volver a exigirlo, poner NEXT_PUBLIC_REQUIRE_AUTH=1.
 */
const REQUIRE_AUTH = process.env.NEXT_PUBLIC_REQUIRE_AUTH === "1";

interface AuthGuardProps {
  children: ReactNode;
}

export default function AuthGuard({ children }: AuthGuardProps) {
  // Sin hooks en esta rama: un return temprano antes de hooks es justo lo que
  // las reglas de hooks prohiben, por eso la logica vive en otro componente.
  if (!REQUIRE_AUTH) return <>{children}</>;
  return <RequireAuth>{children}</RequireAuth>;
}

function readAuth(): boolean {
  try {
    return localStorage.getItem(AUTH_KEY) === "1";
  } catch {
    return false; // modo privado o storage bloqueado
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function RequireAuth({ children }: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();

  // useSyncExternalStore en vez de estado + efecto: en el servidor devuelve
  // false, asi que no hay mismatch, y evita el setState dentro del efecto.
  const isAuth = useSyncExternalStore(subscribe, readAuth, () => false);
  const isLogin = pathname === "/login";

  useEffect(() => {
    if (!isAuth && !isLogin) router.push("/login");
    else if (isAuth && isLogin) router.push("/");
  }, [isAuth, isLogin, router]);

  // Mientras la redireccion esta en curso no se pinta el contenido protegido.
  const settled = isAuth !== isLogin;
  if (!settled) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[var(--bg-app)]">
        <p className="text-sm text-[var(--text-muted)]">Cargando sesión...</p>
      </div>
    );
  }

  return <>{children}</>;
}
