/**
 * Lista los modelos y voces disponibles en tu cuenta de ElevenLabs.
 *
 * La documentacion no publica el string exacto del modelo Flash, asi que en vez
 * de hardcodear uno que puede fallar, lo consultas y lo pegas en .env.local.
 *
 *   ELEVENLABS_API_KEY=xxx node scripts/eleven-list.mjs
 */
const apiKey = process.env.ELEVENLABS_API_KEY;

if (!apiKey) {
  console.error("Falta ELEVENLABS_API_KEY.\n");
  console.error("  PowerShell:  $env:ELEVENLABS_API_KEY='tu-key'; node scripts/eleven-list.mjs");
  console.error("  bash:        ELEVENLABS_API_KEY=tu-key node scripts/eleven-list.mjs");
  process.exit(1);
}

const headers = { "xi-api-key": apiKey };

async function get(path) {
  const res = await fetch(`https://api.elevenlabs.io${path}`, { headers });
  if (!res.ok) {
    throw new Error(`${path} -> ${res.status} ${res.statusText}: ${await res.text()}`);
  }
  return res.json();
}

const [models, voices] = await Promise.all([get("/v1/models"), get("/v1/voices")]);

console.log("\n=== MODELOS DE TEXT-TO-SPEECH ===\n");
for (const model of models) {
  if (!model.can_do_text_to_speech) continue;
  const languages = (model.languages ?? []).map((l) => l.language_id);
  const spanish = languages.includes("es") ? " [es]" : "";
  const cost = model.model_rates?.character_cost_multiplier;
  const rate = cost !== undefined ? `  ${cost} creditos/caracter` : "";
  console.log(`  ${model.model_id}${spanish}${rate}`);
  console.log(`      ${model.name}`);
}

console.log("\n=== VOCES ===\n");
for (const voice of voices.voices ?? []) {
  const labels = Object.values(voice.labels ?? {}).join(", ");
  console.log(`  ${voice.voice_id}  ${voice.name}${labels ? `  (${labels})` : ""}`);
}

console.log("\nPega en apps/studio/.env.local:");
console.log("  ELEVENLABS_VOICE_ID=<el voice_id que elijas>");
console.log("  ELEVENLABS_MODEL_ID=<el model_id mas barato que soporte es>\n");
