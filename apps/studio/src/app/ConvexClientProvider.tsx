"use client";

import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs";
import { ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";

/**
 * Sin una URL real de Convex no se instancia el cliente.
 *
 * Antes se usaba `!` y el modulo explotaba al cargar, lo que tumbaba TODAS las
 * paginas para cualquiera que todavia no hubiera corrido `npx convex dev`.
 * Ahora la app arranca igual y solo falla lo que realmente consulta a Convex.
 *
 * La decision se toma a nivel de modulo y no dentro del componente: resolverlo
 * adentro obliga a un return temprano antes de los hooks, que es justo lo que
 * las reglas de hooks prohiben.
 */
const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const isConfigured = Boolean(convexUrl) && !convexUrl!.includes("localhost");
const convex = isConfigured ? new ConvexReactClient(convexUrl!) : null;

if (!isConfigured && typeof window !== "undefined") {
  console.warn(
    "NEXT_PUBLIC_CONVEX_URL no esta configurada: la app corre sin Convex. " +
      "Para habilitarlo, corre `npx convex dev` en apps/studio.",
  );
}

/** Envuelve la app con el cliente de Convex + Convex Auth (login/sesión). */
export function ConvexClientProvider({ children }: { children: ReactNode }) {
  if (!convex) return <>{children}</>;
  return <ConvexAuthNextjsProvider client={convex}>{children}</ConvexAuthNextjsProvider>;
}
