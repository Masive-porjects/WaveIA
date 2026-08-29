import {
  IntentParseError,
  NEUTRAL_PROFILE,
  interpretIntent,
  type ChatTurn,
  type IntentProfile,
} from "@midimastering/agent";

/**
 * Puente entre el chat y el agente de interpretacion.
 *
 * Cuando Convex este montado esto se muda a una action sin cambiar la firma:
 * interpretIntent es una funcion pura sobre (historial, perfil, analisis).
 */

interface ChatRequest {
  messages: ChatTurn[];
  profile?: IntentProfile;
  voiceMode?: boolean;
}

export async function POST(request: Request): Promise<Response> {
  let body: ChatRequest;
  try {
    body = (await request.json()) as ChatRequest;
  } catch {
    return Response.json({ error: "Body invalido" }, { status: 400 });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return Response.json({ error: "Falta messages" }, { status: 400 });
  }

  // El SDK resuelve credenciales de forma perezosa y falla con un Error sin
  // tipar. Validar aca da un mensaje util en vez de un 500 opaco.
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    return Response.json(
      { error: "Falta ANTHROPIC_API_KEY. Copiá apps/studio/.env.example a .env.local y completala." },
      { status: 503 },
    );
  }

  try {
    const result = await interpretIntent({
      messages: body.messages,
      currentProfile: body.profile ?? NEUTRAL_PROFILE,
      voiceMode: body.voiceMode ?? false,
    });
    return Response.json(result);
  } catch (error) {
    if (error instanceof IntentParseError) {
      return Response.json({ error: error.message }, { status: 502 });
    }
    throw error;
  }
}
