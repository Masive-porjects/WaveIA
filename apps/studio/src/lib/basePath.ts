/**
 * Prefijo de despliegue: aurea.legal/waveai en producción, "" en dev local.
 * Los fetch del cliente (voz, chat) no pasan por next/link ni next/router,
 * así que basePath de Next no los prefija solos — hay que usarlo explícito.
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
