/**
 * Roles de usuario del producto.
 * Por ahora basic y premium tienen el mismo acceso (PLAN.md / DoD hackathon).
 * Cuando se activen gates de pago, se usa este tipo para marcar lo bloqueado.
 */

export type UserRole = "basic" | "premium";

export const DEFAULT_ROLE: UserRole = "basic";

export const ROLE_LABELS: Record<UserRole, string> = {
  basic: "Plan Básico",
  premium: "Plan Premium",
};

/** Features disponibles por rol. Hoy: misma lista, la UI anuncia lo futuro. */
export const ROLE_FEATURES: Record<UserRole, string[]> = {
  basic: ["Mastering por preset", "Descarga WAV/MP3", "Análisis de loudness"],
  premium: ["Mastering por preset", "Descarga WAV/MP3", "Análisis de loudness", "Live Engine", "Asistente de voz"],
};
