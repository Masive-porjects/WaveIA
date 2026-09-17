"use client";

import type { ReactNode } from "react";

/**
 * Convex Auth v0.0.95 — la app NO consulta Convex todavía (0 imports de
 * `convex/_generated`; el flujo de login fue removido del frontend).
 *
 * El wrapper viejo `<ConvexAuthNextjsProvider>` (pre-0.0.9x) crashea en SSR
 * con "Cannot destructure property 'isLoading' from null or undefined":
 * su `useAuth` lee un contexto que solo setea `AuthProvider`, y el provider
 * viejo no lo monta. El layout raíz ya envuelve la app con
 * `ConvexAuthNextjsServerProvider` (API nueva), que SÍ monta AuthProvider
 * con serverState — por eso aquí ya no hace falta nada.
 *
 * Cuando haya queries/auth reales, reemplazar este passthrough por:
 *   import { ConvexAuthProvider } from "@convex-dev/auth/react";
 *   const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
 *   <ConvexAuthProvider client={convex}>{children}</ConvexAuthProvider>
 */
export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
