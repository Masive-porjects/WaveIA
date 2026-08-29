import { Type, type Schema } from "@google/genai";

import { AXES } from "./intentProfile.js";
import { PRESET_IDS, TRACK_TYPES } from "./presets.js";

/**
 * El schema que se le manda a Gemini para forzar la salida estructurada.
 *
 * Es una traduccion del contrato `packages/contracts/intent_profile.schema.json`
 * al dialecto de Gemini (OpenAPI, no JSON Schema completo: no admite
 * `additionalProperties`). Por eso la validacion real la sigue haciendo Zod
 * sobre la respuesta: el schema guia al modelo, Zod garantiza el contrato.
 */

const AXIS_DESCRIPTIONS: Record<(typeof AXES)[number], string> = {
  warmth: "Calidez y cuerpo analogico. 0.5 = sin cambios.",
  punch: "Pegada e impacto de los transientes. 0.5 = sin cambios.",
  clarity: "Definicion y separacion entre elementos. 0.5 = sin cambios.",
  brightness: "Aire y brillo en agudos. 0.5 = sin cambios.",
  width: "Amplitud estereo. 0.5 = sin cambios.",
  bass_weight: "Peso y presencia de los graves. 0.5 = sin cambios.",
  vocal_focus: "Cuanto sobresale la voz. 0.5 = sin cambios.",
  vintage: "Caracter de cinta y sonido de epoca. 0.5 = sin cambios.",
  loudness: "Volumen percibido del master. 0.5 = sin cambios.",
};

const axisSchema = (description: string): Schema => ({
  type: Type.NUMBER,
  minimum: 0,
  maximum: 1,
  description,
});

const intentProfileSchema: Schema = {
  type: Type.OBJECT,
  description: "Perfil semantico de intencion. 0.5 en los nueve ejes = master identico al original.",
  properties: {
    ...Object.fromEntries(AXES.map((axis) => [axis, axisSchema(AXIS_DESCRIPTIONS[axis])])),
    target_platform: {
      type: Type.STRING,
      enum: ["spotify", "apple", "youtube", "club", "none"],
      description: 'Plataforma destino. "none" si el usuario no menciono ninguna.',
    },
    reference_genre: {
      type: Type.STRING,
      description: "Genero o referencia que menciono el usuario. Cadena vacia si no dijo ninguno.",
    },
    notes: {
      type: Type.STRING,
      description: "Resumen en una frase de la intencion del usuario.",
    },
  },
  required: [...AXES, "target_platform", "reference_genre", "notes"],
};

const recommendationSchema: Schema = {
  type: Type.OBJECT,
  description: "Un preset recomendado, con el porque en el idioma del usuario.",
  properties: {
    preset_id: {
      type: Type.STRING,
      enum: [...PRESET_IDS],
      description: "Id exacto del preset. Solo uno de la lista.",
    },
    does: {
      type: Type.STRING,
      description:
        "Que le hace al track, en una frase corta. La accion. Sin terminos tecnicos.",
    },
    gets: {
      type: Type.STRING,
      description:
        "Que va a escuchar el usuario si lo elige, en una frase corta. El resultado.",
    },
  },
  required: ["preset_id", "does", "gets"],
  propertyOrdering: ["preset_id", "does", "gets"],
};

export const AGENT_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    reply: {
      type: Type.STRING,
      description: "Respuesta para el chat, en voseo rioplatense.",
    },
    needs_clarification: {
      type: Type.BOOLEAN,
      description: "true solo si el pedido es demasiado vago para saber que eje mover.",
    },
    clarifying_question: {
      type: Type.STRING,
      description:
        "Pregunta concreta con dos o tres opciones. Cadena vacia si needs_clarification es false.",
    },
    track_type: {
      type: Type.STRING,
      enum: [...TRACK_TYPES],
      description:
        'Si el track tiene voz. "unknown" mientras no haya evidencia: no lo adivines.',
    },
    recommendations: {
      type: Type.ARRAY,
      description: "Exactamente 3 presets, del mas al menos recomendado, sin repetir.",
      items: recommendationSchema,
      minItems: "3",
      maxItems: "3",
    },
    profile: intentProfileSchema,
  },
  required: [
    "reply",
    "needs_clarification",
    "clarifying_question",
    "track_type",
    "recommendations",
    "profile",
  ],
  // Gemini respeta este orden al generar. El perfil va al final para que el
  // modelo razone en la respuesta y en los presets antes de comprometer numeros.
  propertyOrdering: [
    "reply",
    "needs_clarification",
    "clarifying_question",
    "track_type",
    "recommendations",
    "profile",
  ],
};
