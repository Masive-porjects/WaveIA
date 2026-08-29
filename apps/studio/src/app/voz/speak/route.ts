import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Sintesis de voz para las respuestas del agente.
 *
 * Vive bajo /voz/ y no /api/ a proposito: next.config.ts reescribe todo /api/*
 * hacia el backend de AudioMind en :8000.
 *
 * Devuelve 204 cuando la sintesis de pago esta apagada. El cliente interpreta
 * ese 204 como "usa la voz del navegador", que es gratis. Asi las iteraciones
 * de desarrollo no gastan un solo credito.
 */

const CACHE_DIR = path.join(process.cwd(), ".tts-cache");
const MAX_CHARS = 400;

export async function POST(request: Request): Promise<Response> {
  let text: string;
  try {
    ({ text } = (await request.json()) as { text: string });
  } catch {
    return Response.json({ error: "Body invalido" }, { status: 400 });
  }

  if (typeof text !== "string" || text.trim().length === 0) {
    return Response.json({ error: "Falta text" }, { status: 400 });
  }

  // Tope duro de gasto: una respuesta larga es un bug del prompt, no algo que
  // haya que pagar. Cortar aca evita que un reply desbocado queme creditos.
  if (text.length > MAX_CHARS) {
    return Response.json(
      { error: `El texto supera ${MAX_CHARS} caracteres (${text.length}). No se sintetiza.` },
      { status: 413 },
    );
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  const modelId = process.env.ELEVENLABS_MODEL_ID;
  const enabled = process.env.VOICE_MODE === "elevenlabs";

  // El modelo es opcional: si no se define, ElevenLabs usa su default. Asi la
  // voz funciona sin necesitar el permiso models_read para descubrir el id.
  if (!enabled || !apiKey || !voiceId) {
    // 204 = "sintetizalo vos con speechSynthesis". No es un error.
    return new Response(null, { status: 204 });
  }

  const hash = createHash("sha256").update(`${modelId ?? "default"}:${voiceId}:${text}`).digest("hex");
  const cached = path.join(CACHE_DIR, `${hash}.mp3`);

  try {
    const audio = await readFile(cached);
    return new Response(new Uint8Array(audio), {
      headers: { "Content-Type": "audio/mpeg", "X-TTS-Cache": "hit" },
    });
  } catch {
    // Cache miss: seguimos y sintetizamos.
  }

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ text, ...(modelId ? { model_id: modelId } : {}) }),
    },
  );

  if (!res.ok) {
    return Response.json(
      { error: `ElevenLabs ${res.status}: ${await res.text()}` },
      { status: 502 },
    );
  }

  const audio = Buffer.from(await res.arrayBuffer());

  // El cache es lo que hace que ensayar la demo no cueste: la misma frase no se
  // sintetiza dos veces. Si falla escribirlo, igual devolvemos el audio.
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(cached, audio);
  } catch (error) {
    console.warn("No se pudo cachear el audio de TTS:", error);
  }

  return new Response(new Uint8Array(audio), {
    headers: { "Content-Type": "audio/mpeg", "X-TTS-Cache": "miss" },
  });
}
