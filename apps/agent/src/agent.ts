import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

import { AGENT_RESPONSE_SCHEMA } from "./geminiSchema.js";
import {
  IntentProfileSchema,
  NEUTRAL_PROFILE,
  diffProfiles,
  type AxisChange,
  type IntentProfile,
} from "./intentProfile.js";
import { SYSTEM_PROMPT, buildContextBlock, type TrackAnalysis } from "./prompt.js";
import { PRESET_IDS, TRACK_TYPES, type PresetId, type TrackType } from "./presets.js";

/** Sobreescribible por si cambia el catalogo de modelos sin tocar codigo. */
export const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.7-flash";

/**
 * Cadena de respaldo. Los modelos flash mas nuevos se saturan seguido y
 * devuelven 503 de forma sostenida, no en picos cortos: reintentar sobre el
 * mismo modelo no alcanza. Si el primero no da, se pasa al siguiente.
 */
export const MODEL_CHAIN = [...new Set([MODEL, "gemini-3.6-flash", "gemini-3.5-flash"])];

const RETRIES = 2;
const BACKOFF_MS = 600;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Saturacion del modelo (503) o cuota agotada momentaneamente (429).
 * El SDK no expone un codigo tipado, asi que se inspecciona el mensaje.
 */
function isTransient(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /\b(429|503|500|UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded|high demand)\b/i.test(message);
}

/**
 * Validacion de la respuesta del modelo.
 *
 * El responseSchema que se le manda a Gemini guia la generacion, pero no la
 * garantiza: el contrato lo hace cumplir Zod aca. Un valor fuera de rango se
 * rechaza, no se recorta en silencio.
 */
const RecommendationSchema = z.object({
  preset_id: z.enum(PRESET_IDS),
  why: z.string(),
});

const AgentResponseSchema = z.object({
  reply: z.string(),
  needs_clarification: z.boolean(),
  clarifying_question: z.string(),
  track_type: z.enum(TRACK_TYPES),
  // Exactamente 3: el schema de Gemini lo pide pero no lo garantiza.
  recommendations: z.array(RecommendationSchema).length(3),
  profile: IntentProfileSchema,
});

export interface Recommendation {
  presetId: PresetId;
  why: string;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface InterpretOptions {
  /** Historial completo de la conversacion del proyecto. */
  messages: ChatTurn[];
  /** Perfil vigente. El agente ajusta sobre este, no desde cero. */
  currentProfile?: IntentProfile;
  /** Analisis del track que devolvio AudioMind, si ya esta listo. */
  analysis?: TrackAnalysis;
  /**
   * Presupuesto de razonamiento en tokens. 0 lo desactiva, -1 lo deja
   * automatico. El chat es sensible a la latencia y esta es una tarea de
   * interpretacion acotada, asi que un presupuesto chico es el default.
   */
  thinkingBudget?: number;
  /** El reply se va a leer en voz alta: pide una sola frase corta. */
  voiceMode?: boolean;
  /** Inyectable para tests. */
  client?: GoogleGenAI;
}

export interface InterpretResult {
  reply: string;
  needsClarification: boolean;
  clarifyingQuestion: string;
  profile: IntentProfile;
  /** Ejes que se movieron respecto del perfil de entrada. Alimenta la UI. */
  changes: AxisChange[];
  /** Los 3 presets sugeridos, del mas al menos recomendado. */
  recommendations: Recommendation[];
  /** Si el track lleva voz. "unknown" hasta que haya evidencia. */
  trackType: TrackType;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  /** Modelo que finalmente respondio. Puede no ser el primero de la cadena. */
  servedBy: string;
}

/** Error de contrato: el modelo devolvio algo que no valida contra el schema. */
export class IntentParseError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "IntentParseError";
  }
}

let defaultClient: GoogleGenAI | undefined;

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new IntentParseError(
      "Falta GEMINI_API_KEY. Completala en apps/studio/.env.local.",
    );
  }
  defaultClient ??= new GoogleGenAI({ apiKey });
  return defaultClient;
}

/**
 * Traduce lo que dijo el usuario a un IntentProfile validado.
 *
 * El agente nunca escribe en el motor de audio: devuelve un perfil semantico
 * que el mapper del area de DSP convierte en MasteringSettings. El proveedor
 * del modelo es un detalle de este archivo; nada mas en el proyecto lo sabe.
 */
export async function interpretIntent(options: InterpretOptions): Promise<InterpretResult> {
  const {
    messages,
    currentProfile = NEUTRAL_PROFILE,
    analysis,
    thinkingBudget = 512,
    voiceMode = false,
  } = options;

  if (messages.length === 0) {
    throw new IntentParseError("interpretIntent necesita al menos un mensaje del usuario");
  }

  const client = options.client ?? getClient();

  // Gemini llama "model" al rol del asistente.
  const contents = [
    ...messages.map((turn) => ({
      role: turn.role === "assistant" ? "model" : "user",
      parts: [{ text: turn.content }],
    })),
    { role: "user", parts: [{ text: buildContextBlock(currentProfile, analysis, { voiceMode }) }] },
  ];

  let raw: string | undefined;
  let inputTokens = 0;
  let outputTokens = 0;

  // Reintento con backoff sobre cada modelo; si sigue caido, se baja al
  // siguiente de la cadena. 503 (saturado) y 429 (cuota) son transitorios.
  let lastError: unknown;
  let servedBy = MODEL_CHAIN[0];

  outer: for (const model of MODEL_CHAIN) {
    for (let attempt = 0; attempt < RETRIES; attempt++) {
      try {
        const response = await client.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction: SYSTEM_PROMPT,
            responseMimeType: "application/json",
            responseSchema: AGENT_RESPONSE_SCHEMA,
            thinkingConfig: { thinkingBudget },
          },
        });
        raw = response.text;
        inputTokens = response.usageMetadata?.promptTokenCount ?? 0;
        outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;
        servedBy = model;
        lastError = undefined;
        break outer;
      } catch (error) {
        lastError = error;
        // Un error no transitorio (schema invalido, key mala) se repite igual
        // en los demas modelos: no tiene sentido seguir bajando la cadena.
        if (!isTransient(error)) break outer;
        if (attempt < RETRIES - 1) await sleep(BACKOFF_MS * 2 ** attempt);
      }
    }
  }

  if (lastError !== undefined) {
    const message = lastError instanceof Error ? lastError.message : String(lastError);
    throw new IntentParseError(
      `Fallo la llamada a Gemini. Se probo: ${MODEL_CHAIN.join(", ")}. Ultimo error: ${message}`,
      lastError,
    );
  }

  if (!raw) {
    throw new IntentParseError(
      "Gemini no devolvio contenido. Puede haber cortado por filtros de seguridad.",
    );
  }

  let parsed: z.infer<typeof AgentResponseSchema>;
  try {
    parsed = AgentResponseSchema.parse(JSON.parse(raw));
  } catch (error) {
    throw new IntentParseError(
      "La respuesta no cumple el contrato IntentProfile. No se aplica ningun cambio.",
      error,
    );
  }

  // Si el agente pide aclaracion, el perfil no se mueve. Sin esta guarda un
  // modelo puede preguntar y ajustar en el mismo turno, que es justo lo que la
  // regla 5 del prompt prohibe.
  const profile = parsed.needs_clarification ? currentProfile : parsed.profile;

  return {
    reply: parsed.reply,
    needsClarification: parsed.needs_clarification,
    clarifyingQuestion: parsed.clarifying_question,
    profile,
    changes: diffProfiles(currentProfile, profile),
    recommendations: parsed.recommendations.map((r) => ({ presetId: r.preset_id, why: r.why })),
    trackType: parsed.track_type,
    usage: { inputTokens, outputTokens },
    servedBy,
  };
}
