/**
 * Base URL de la API de AudioMind.
 *
 * NEXT_PUBLIC_* se inlinea en build: en Railway hay que definir
 * NEXT_PUBLIC_API_URL apuntando al backend desplegado (ej. https://<svc>.up.railway.app/api).
 * El fallback a localhost solo sirve para desarrollo local.
 */
export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";