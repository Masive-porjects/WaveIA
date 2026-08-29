/**
 * REPL de prueba del agente.
 *
 * Existe para poder probar la interpretacion sola, sin Next, sin Convex y sin
 * micrófono: se conversa por terminal y se ve el IntentProfile moverse en vivo.
 *
 *   npm run chat -w apps/agent
 */
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { AXES, NEUTRAL_PROFILE, type IntentProfile } from "./intentProfile.js";
import { PRESETS } from "./presets.js";
import type { TrackAnalysis } from "./prompt.js";

/**
 * La clave vive en apps/studio/.env.local, que es donde la necesita Next.
 * Cargarla aca evita tener que duplicarla o exportarla a mano en cada shell.
 * Solo completa lo que falte: una variable ya presente en el entorno gana.
 */
function loadEnvLocal(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const envPath = resolve(here, "../../studio/.env.local");
  let raw: string;
  try {
    raw = readFileSync(envPath, "utf-8");
  } catch {
    return; // Sin archivo: se usa lo que haya en el entorno.
  }
  // Separar con /\r?\n/ y no con "\n": en JS el punto no matchea \r, asi que
  // con CRLF un valor no vacio nunca llega al fin de linea y la regex falla.
  for (const line of raw.split(/\r?\n/)) {
    const match = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key, value] = match;
    if (process.env[key]) continue;
    const clean = value.trim().replace(/^["']|["']$/g, "");
    if (clean) process.env[key] = clean;
  }
}

loadEnvLocal();

// Importado despues de cargar el entorno: el modulo lee GEMINI_MODEL al evaluarse.
const { interpretIntent, IntentParseError, MODEL } = await import("./agent.js");
type ChatTurn = import("./agent.js").ChatTurn;

// Analisis de ejemplo. Cuando AudioMind este conectado, esto llega del backend.
const DEMO_ANALYSIS: TrackAnalysis = {
  integrated_lufs: -12.4,
  dynamic_range_db: 8.2,
  tempo_bpm: 96,
  detected_genre: "reggaeton",
  is_already_mastered: false,
};

const BAR_WIDTH = 20;

function renderProfile(profile: IntentProfile): string {
  const lines = AXES.map((axis) => {
    const value = profile[axis];
    const filled = Math.round(value * BAR_WIDTH);
    const bar = "#".repeat(filled) + ".".repeat(BAR_WIDTH - filled);
    const marker = Math.abs(value - 0.5) < 0.01 ? " " : "*";
    return `  ${marker} ${axis.padEnd(12)} ${bar} ${value.toFixed(2)}`;
  });
  if (profile.target_platform !== "none") {
    lines.push(`    plataforma   ${profile.target_platform}`);
  }
  if (profile.reference_genre) {
    lines.push(`    referencia   ${profile.reference_genre}`);
  }
  return lines.join("\n");
}

async function main(): Promise<void> {
  const rl = createInterface({ input: stdin, output: stdout });
  const history: ChatTurn[] = [];
  let profile: IntentProfile = NEUTRAL_PROFILE;

  if (!process.env.GEMINI_API_KEY) {
    console.error("Falta GEMINI_API_KEY.\n");
    console.error("  Completala en apps/studio/.env.local y volve a correr esto.");
    console.error("  La sacas de https://aistudio.google.com -> Get API key\n");
    rl.close();
    process.exitCode = 1;
    return;
  }

  console.log(`Agente de mastering — modelo: ${MODEL}`);
  console.log("Escribi como queres que suene tu cancion.");
  console.log('Comandos: "perfil" muestra el estado, "salir" termina.\n');
  console.log(renderProfile(profile), "\n");

  for (;;) {
    let input: string;
    try {
      input = (await rl.question("> ")).trim();
    } catch {
      break; // stdin cerrado: Ctrl+D o entrada por pipe que se agoto.
    }
    if (!input) continue;
    if (input === "salir") break;
    if (input === "perfil") {
      console.log("\n" + renderProfile(profile) + "\n");
      continue;
    }

    history.push({ role: "user", content: input });

    try {
      const result = await interpretIntent({
        messages: history,
        currentProfile: profile,
        analysis: DEMO_ANALYSIS,
      });

      history.push({ role: "assistant", content: result.reply });
      profile = result.profile;

      console.log(`\n${result.reply}`);

      if (result.needsClarification) {
        console.log(`\n  ? ${result.clarifyingQuestion}`);
      } else if (result.changes.length === 0) {
        console.log("\n  (sin cambios en el perfil)");
      } else {
        console.log("");
        for (const change of result.changes) {
          const sign = change.delta > 0 ? "+" : "";
          console.log(
            `  ${change.axis.padEnd(12)} ${change.from.toFixed(2)} -> ${change.to.toFixed(2)}  (${sign}${change.delta.toFixed(2)})`,
          );
        }
      }

      const tipo = result.trackType === "unknown" ? "sin determinar" : result.trackType;
      console.log(`\n  track: ${tipo}`);
      console.log("  presets recomendados:");
      result.recommendations.forEach((r, i) => {
        const preset = PRESETS[r.presetId];
        const star = i === 0 ? "*" : " ";
        console.log(`  ${star} ${i + 1}. ${preset.title.padEnd(11)} ${preset.genre}`);
        console.log(`        hace:     ${r.does}`);
        console.log(`        obtenes:  ${r.gets}`);
      });

      console.log(
        `\n  [${result.usage.inputTokens} in / ${result.usage.outputTokens} out · ${result.servedBy}]\n`,
      );
    } catch (error) {
      if (error instanceof IntentParseError) {
        console.error(`\n  error: ${error.message}\n`);
      } else {
        throw error;
      }
    }
  }

  rl.close();
  console.log("\n" + renderProfile(profile));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
