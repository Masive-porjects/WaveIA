import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import {
  IntentProfileSchema,
  NEUTRAL_PROFILE,
  diffProfiles,
  type AxisChange,
  type IntentProfile,
} from "./intentProfile.js";
import { SYSTEM_PROMPT, buildContextBlock, type TrackAnalysis } from "./prompt.js";

export const MODEL = "claude-opus-5";

/**
 * Lo que el modelo debe devolver. Un solo objeto en vez de una union: los
 * esquemas con `oneOf` son fragiles con structured outputs, y un booleano mas
 * un string vacio expresan lo mismo sin ambiguedad.
 */
const AgentResponseSchema = z.object({
  reply: z
    .string()
    .describe("Respuesta para el chat, en voseo rioplatense. Dos o tres frases."),
  needs_clarification: z
    .boolean()
    .describe("true solo si el pedido es demasiado vago para saber que eje mover."),
  clarifying_question: z
    .string()
    .describe(
      "Pregunta concreta con dos o tres opciones. Cadena vacia si needs_clarification es false.",
    ),
  profile: IntentProfileSchema.describe("El IntentProfile completo despues del ajuste."),
});

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
   * Profundidad de razonamiento. El chat es sensible a la latencia y esto es
   * una tarea de interpretacion acotada, asi que `low` es el default correcto.
   */
  effort?: "low" | "medium" | "high";
  /** El reply se va a leer en voz alta: pide una sola frase corta. */
  voiceMode?: boolean;
  /** Inyectable para tests. */
  client?: Anthropic;
}

export interface InterpretResult {
  reply: string;
  needsClarification: boolean;
  clarifyingQuestion: string;
  profile: IntentProfile;
  /** Ejes que se movieron respecto del perfil de entrada. Alimenta la UI. */
  changes: AxisChange[];
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
  };
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

let defaultClient: Anthropic | undefined;

function getClient(): Anthropic {
  // Resuelve credenciales del entorno: ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN
  // o un perfil de `ant auth login`. No hardcodear la key.
  defaultClient ??= new Anthropic();
  return defaultClient;
}

/**
 * Traduce lo que dijo el usuario a un IntentProfile validado.
 *
 * El agente nunca escribe en el motor de audio: devuelve un perfil semantico
 * que el mapper del area de DSP convierte en MasteringSettings.
 */
export async function interpretIntent(options: InterpretOptions): Promise<InterpretResult> {
  const {
    messages,
    currentProfile = NEUTRAL_PROFILE,
    analysis,
    effort = "low",
    voiceMode = false,
    client = getClient(),
  } = options;

  if (messages.length === 0) {
    throw new IntentParseError("interpretIntent necesita al menos un mensaje del usuario");
  }

  const apiMessages: Anthropic.MessageParam[] = [
    ...messages.map((turn) => ({ role: turn.role, content: turn.content }) as const),
    { role: "user" as const, content: buildContextBlock(currentProfile, analysis, { voiceMode }) },
  ];

  let response;
  try {
    response = await client.messages.parse({
      model: MODEL,
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      output_config: {
        effort,
        format: zodOutputFormat(AgentResponseSchema),
      },
      // El system es estable byte a byte entre turnos, asi que cachea.
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      ],
      messages: apiMessages,
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      throw new IntentParseError(
        "Credenciales invalidas. Configura ANTHROPIC_API_KEY o corre `ant auth login`.",
        error,
      );
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new IntentParseError("Rate limit de la API. Reintenta en unos segundos.", error);
    }
    if (error instanceof Anthropic.APIError) {
      throw new IntentParseError(`Error ${error.status} de la API: ${error.message}`, error);
    }
    throw error;
  }

  if (response.stop_reason === "refusal") {
    throw new IntentParseError(
      `El modelo rechazo el pedido (${response.stop_details?.category ?? "sin categoria"}).`,
    );
  }

  const parsed = response.parsed_output;
  if (!parsed) {
    throw new IntentParseError(
      "El modelo no devolvio un IntentProfile valido. No se aplica ningun cambio.",
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
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    },
  };
}
