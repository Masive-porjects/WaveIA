"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { ReactNode } from "react";

const AUTH_KEY = "waveai-auth";

interface AuthGuardProps {
  children: ReactNode;
}

export default function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const isAuth = typeof window !== "undefined" && localStorage.getItem(AUTH_KEY) === "1";
    const isLogin = pathname === "/login";

    if (!isAuth && !isLogin) {
      router.push("/login");
    } else if (isAuth && isLogin) {
      router.push("/");
    } else {
      setReady(true);
    }
  }, [pathname, router]);

  if (!ready) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[var(--bg-app)]">
        <p className="text-sm text-[var(--text-muted)]">Cargando sesión...</p>
      </div>
    );
  }

  return <>{children}</>;
}
