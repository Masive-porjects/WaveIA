/**
 * Base URL de la API de AudioMind.
 *
 * NEXT_PUBLIC_* se inlinea en build: en Railway hay que definir
 * NEXT_PUBLIC_API_URL apuntando al backend desplegado (ej. https://<svc>.up.railway.app/api).
 * El fallback a localhost solo sirve para desarrollo local.
 *
 * CONTRATO: el valor debe ser exactamente `https://<host>/api` — el backend
 * monta TODOS los routers bajo ese prefix. Sin el `/api` el backend responde
 * 404 (rutas en raíz no existen); con `/api` duplicado o trailing slash también.
 * La normalización de abajo corrige las dos variantes más comunes.
 */
const RAW_API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

/**
 * Normaliza la base contra errores de configuración típicos:
 * - trailing slash sobrante: `.../api/` -> `.../api`
 * - `/api` duplicado: `.../api/api` -> `.../api`
 */
function normalizeApiBase(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  return trimmed.replace(/(?:\/api){2,}(?=\/|$)/i, "/api");
}

export const API_BASE = normalizeApiBase(RAW_API_BASE);