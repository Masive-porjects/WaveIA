import { z } from "zod";

/**
 * Espejo en Zod de `packages/contracts/intent_profile.schema.json`.
 *
 * El JSON Schema es la fuente de verdad del contrato entre equipos; este archivo
 * es la version ejecutable que valida lo que devuelve el modelo. Si cambia uno,
 * cambia el otro en el mismo commit.
 */

const axis = (description: string) =>
  z.number().min(0).max(1).describe(description);

export const IntentProfileSchema = z.object({
  warmth: axis("Calidez / cuerpo analogico. Alto = saturacion armonica, agudos mas suaves."),
  punch: axis("Pegada, impacto de transientes. Alto = golpe mas marcado."),
  clarity: axis("Definicion y separacion. Alto = mezcla mas legible, menos barro."),
  brightness: axis("Aire y brillo. Alto = mas presencia arriba de 8 kHz."),
  width: axis("Amplitud estereo. Alto = mas ancho. Bajo = mas centrado."),
  bass_weight: axis("Peso de los graves. Alto = bajos mas grandes y controlados."),
  vocal_focus: axis("Cuanto sobresale la voz sobre el resto."),
  vintage: axis("Caracter de cinta. Alto = mas hysteresis, bias y roll-off."),
  loudness: axis("Volumen percibido. Alto = mas fuerte, menos rango dinamico."),
  target_platform: z
    .enum(["spotify", "apple", "youtube", "club", "none"])
    .describe('Plataforma destino. "none" si el usuario no menciono ninguna.'),
  reference_genre: z
    .string()
    .describe("Genero o referencia que menciono el usuario. Cadena vacia si no dijo ninguno."),
  notes: z
    .string()
    .describe("Resumen en una frase de la intencion del usuario, para trazabilidad."),
});

export type IntentProfile = z.infer<typeof IntentProfileSchema>;

/** Los nueve ejes numericos, en orden estable. */
export const AXES = [
  "warmth",
  "punch",
  "clarity",
  "brightness",
  "width",
  "bass_weight",
  "vocal_focus",
  "vintage",
  "loudness",
] as const;

export type Axis = (typeof AXES)[number];

/**
 * Perfil neutral. Contrato con el area de DSP: el mapper alimentado con este
 * perfil debe devolver los defaults exactos de `MasteringParameters`, es decir
 * un master bit-exacto al original.
 */
export const NEUTRAL_PROFILE: IntentProfile = {
  warmth: 0.5,
  punch: 0.5,
  clarity: 0.5,
  brightness: 0.5,
  width: 0.5,
  bass_weight: 0.5,
  vocal_focus: 0.5,
  vintage: 0.5,
  loudness: 0.5,
  target_platform: "none",
  reference_genre: "",
  notes: "",
};

/** Un eje que el agente movio, con el porque. Alimenta la UI del chat. */
export interface AxisChange {
  axis: Axis;
  from: number;
  to: number;
  delta: number;
}

/** Diferencia entre dos perfiles, ignorando movimientos por debajo del umbral. */
export function diffProfiles(
  before: IntentProfile,
  after: IntentProfile,
  threshold = 0.01,
): AxisChange[] {
  const changes: AxisChange[] = [];
  for (const key of AXES) {
    const delta = after[key] - before[key];
    if (Math.abs(delta) >= threshold) {
      changes.push({ axis: key, from: before[key], to: after[key], delta });
    }
  }
  return changes;
}

/**
 * Rechaza perfiles invalidos en vez de recortarlos en silencio.
 *
 * Un valor fuera de rango significa que el modelo entendio mal el contrato:
 * hacerle `clamp` esconde el bug y produce un master que nadie pidio.
 */
export function validateProfile(candidate: unknown): IntentProfile {
  return IntentProfileSchema.parse(candidate);
}
