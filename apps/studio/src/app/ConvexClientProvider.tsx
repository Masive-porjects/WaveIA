"use client";

import { useMemo } from "react";
import type { ReactNode } from "react";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const isPlaceholder = !convexUrl || convexUrl.includes("localhost");

/** Envuelve la app con el cliente de Convex + Convex Auth (login/sesión).
 *  Si no hay una URL real de Convex configurada, simplemente renderiza los children.
 */
export function ConvexClientProvider({ children }: { children: ReactNode }) {
  if (isPlaceholder) {
    return <>{children}</>;
  }

  const { ConvexAuthNextjsProvider } = require("@convex-dev/auth/nextjs");
  const { ConvexReactClient } = require("convex/react");

  const convex = useMemo(
    () => new ConvexReactClient(convexUrl!),
    []
  );

  return <ConvexAuthNextjsProvider client={convex}>{children}</ConvexAuthNextjsProvider>;
}
