/**
 * Transcripción de voz a texto.
 *
 * Motor principal: ElevenLabs Scribe. Se eligió sobre el reconocimiento del
 * navegador porque ese último no transcribe localmente — Chrome manda el audio
 * a servidores de Google, y esa petición falla en algunas redes con un error
 * que no se puede reintentar desde el cliente.
 *
 * Respaldo: Gemini, con la misma clave que el chat. Cubre el caso de que la
 * clave de ElevenLabs pierda el permiso o se quede sin créditos.
 *
 * Vive bajo /voz/ y no /api/ porque next.config.ts reescribe todo /api/* hacia
 * AudioMind en :8000.
 */

/**
 * Vocabulario del dominio para sesgar la transcripción.
 *
 * Sin esto, los términos de mastering y los géneros salen mal escritos: el
 * modelo no espera "punch" ni "dembow" en medio de una frase en español.
 */
const KEYWORDS = [
  "mastering", "máster", "masterizar", "punch", "loudness",
  "graves", "agudos", "medios", "compresión", "saturación", "estéreo",
  "reggaetón", "dembow", "trap", "drill", "lo-fi",
  "cálida", "brillo", "pegada",
];

/** Modelo de Scribe. v1 medido más rápido que v2 con igual calidad en español. */
const SCRIBE_MODEL = process.env.ELEVENLABS_STT_MODEL ?? "scribe_v1";

/**
 * Cadena de respaldo de Gemini, ordenada por LATENCIA y no por costo.
 *
 * Medido sobre el mismo clip: flash-lite tarda 2s y los flash grandes 15-33s
 * porque razonan sobre el audio. Transcribir no necesita razonamiento.
 */
const GEMINI_CHAIN = [
  process.env.GEMINI_TRANSCRIBE_MODEL ?? "gemini-3.1-flash-lite",
  "gemini-3.5-flash-lite",
];

const GEMINI_PROMPT =
  "Transcribí literalmente lo que se dice en este audio, en español. " +
  "Devolvé solo el texto transcripto, sin comillas, sin comentarios y sin explicaciones. " +
  "Si no se entiende nada, devolvé una cadena vacía.";

/** 25 MB: una instrucción hablada no llega ni cerca. Frena uploads absurdos. */
const MAX_BYTES = 25 * 1024 * 1024;

/** ElevenLabs Scribe. Devuelve null si no está configurado o si falla. */
async function transcribeWithElevenLabs(
  audio: File,
): Promise<{ text: string; servedBy: string } | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return null;

  const form = new FormData();
  form.append("file", audio, audio.name || "voz.webm");
  form.append("model_id", SCRIBE_MODEL);
  form.append("language_code", "spa");
  // Un campo repetido por término, no un JSON: mandarlo serializado lo toma
  // como una sola palabra y la API lo rechaza por superar los 50 caracteres.
  for (const keyword of KEYWORDS) form.append("keywords", keyword);

  try {
    const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: form,
    });
    if (!res.ok) {
      console.warn(`Scribe ${res.status}: ${await res.text()}`);
      return null; // el caller cae a Gemini
    }
    const data = (await res.json()) as { text?: string };
    return { text: (data.text ?? "").trim(), servedBy: SCRIBE_MODEL };
  } catch (error) {
    console.warn("Scribe no respondió:", error);
    return null;
  }
}

/** Respaldo: Gemini multimodal con la misma clave que usa el chat. */
async function transcribeWithGemini(
  audio: File,
): Promise<{ text: string; servedBy: string } | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  // El tipo del Blob trae parámetros de codec ("audio/webm;codecs=opus") que la
  // API rechaza: se manda solo el tipo base.
  const mimeType = (audio.type || "audio/webm").split(";")[0];
  const base64 = Buffer.from(await audio.arrayBuffer()).toString("base64");
  const body = JSON.stringify({
    contents: [
      {
        role: "user",
        parts: [
          { text: GEMINI_PROMPT },
          { inline_data: { mime_type: mimeType, data: base64 } },
        ],
      },
    ],
  });

  for (const model of GEMINI_CHAIN) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body },
      );
      if (!res.ok) {
        // 400 = audio ilegible: se repite en todos los modelos, no insistir.
        if (res.status === 400) return null;
        continue;
      }
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text = (data.candidates?.[0]?.content?.parts ?? [])
        .map((p) => p.text ?? "")
        .join("")
        .trim();
      return { text, servedBy: model };
    } catch {
      continue;
    }
  }
  return null;
}

export async function POST(request: Request): Promise<Response> {
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

  const result =
    (await transcribeWithElevenLabs(audio)) ?? (await transcribeWithGemini(audio));

  if (!result) {
    return Response.json(
      {
        error:
          "No se pudo transcribir. Revisá ELEVENLABS_API_KEY y GEMINI_API_KEY en el entorno.",
      },
      { status: 502 },
    );
  }

  return Response.json(result);
}
