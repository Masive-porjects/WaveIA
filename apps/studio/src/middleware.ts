import { convexAuthNextjsMiddleware } from "@convex-dev/auth/nextjs/server";

/**
 * Requerido por Convex Auth para refrescar la cookie de sesión en SSR.
 * No redirige nada todavía — la protección de rutas (ej. /panel) la agrega
 * Andrés en las pantallas cuando estén listas, usando `isAuthenticatedNextjs()`.
 */
export default convexAuthNextjsMiddleware();

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
