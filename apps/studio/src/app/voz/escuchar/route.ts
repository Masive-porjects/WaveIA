/**
 * Transcripción de audio con Gemini.
 *
 * Existe porque el reconocimiento del navegador no transcribe localmente:
 * Chrome manda el audio a servidores de Google y esa petición falla en algunas
 * redes con un error "network" que no se puede reintentar desde el cliente.
 *
 * Esta ruta usa la misma clave de Gemini que el chat, así que no suma cuentas
 * ni permisos: si el chat funciona, esto funciona.
 *
 * Vive bajo /voz/ y no /api/ porque next.config.ts reescribe todo /api/* hacia
 * AudioMind en :8000.
 */

/**
 * Los lite van primero, y no es por costo: es por latencia.
 *
 * Medido sobre el mismo clip de 6 segundos: flash-lite tarda 2s, mientras que
 * los flash grandes tardan 15-33s porque razonan sobre el audio. Transcribir no
 * necesita razonamiento, y en una interfaz de voz 30 segundos de espera es
 * inaceptable. Los grandes quedan como respaldo por si el lite se satura.
 */
const MODEL_CHAIN = [
  process.env.GEMINI_TRANSCRIBE_MODEL ?? "gemini-3.1-flash-lite",
  "gemini-3.5-flash-lite",
  "gemini-3.6-flash",
];

const PROMPT =
  "Transcribí literalmente lo que se dice en este audio, en español. " +
  "Devolvé solo el texto transcripto, sin comillas, sin comentarios y sin explicaciones. " +
  "Si no se entiende nada, devolvé una cadena vacía.";

/** 25 MB: una instrucción hablada no llega ni cerca. Frena uploads absurdos. */
const MAX_BYTES = 25 * 1024 * 1024;

function isTransient(status: number): boolean {
  return status === 429 || status === 500 || status === 503;
}

export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "Falta GEMINI_API_KEY. Completala en apps/studio/.env.local." },
      { status: 503 },
    );
  }

  let audio: File | null = null;
  try {
    const form = await request.formData();
    const value = form.get("audio");
    if (value instanceof File) audio = value;
  } catch {
    return Response.json({ error: "Body inválido" }, { status: 400 });
  }

  if (!audio || audio.size === 0) {
    return Response.json({ error: "Falta el audio" }, { status: 400 });
  }
  if (audio.size > MAX_BYTES) {
    return Response.json({ error: "El audio es demasiado largo" }, { status: 413 });
  }

  // El tipo del Blob trae parámetros de codec ("audio/webm;codecs=opus") que la
  // API rechaza: se manda solo el tipo base.
  const mimeType = (audio.type || "audio/webm").split(";")[0];
  const base64 = Buffer.from(await audio.arrayBuffer()).toString("base64");

  const body = JSON.stringify({
    contents: [
      {
        role: "user",
        parts: [{ text: PROMPT }, { inline_data: { mime_type: mimeType, data: base64 } }],
      },
    ],
  });

  let lastError = "";
  for (const model of MODEL_CHAIN) {
    let res: Response;
    try {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body },
      );
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      continue;
    }

    if (!res.ok) {
      lastError = `${model}: ${res.status} ${await res.text()}`;
      // Un 400 (audio ilegible, formato no soportado) se repite en todos los
      // modelos: no tiene sentido seguir bajando la cadena.
      if (!isTransient(res.status)) break;
      continue;
    }

    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = (data.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("")
      .trim();

    return Response.json({ text, servedBy: model });
  }

  return Response.json(
    { error: `No se pudo transcribir. ${lastError}` },
    { status: 502 },
  );
}
