/**
 * REPL de prueba del agente.
 *
 * Existe para poder trabajar sin esperar a Convex ni al frontend: se conversa
 * por terminal y se ve el IntentProfile moverse en vivo.
 *
 *   npm run chat -w apps/agent
 */
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { interpretIntent, IntentParseError, type ChatTurn } from "./agent.js";
import { AXES, NEUTRAL_PROFILE, type IntentProfile } from "./intentProfile.js";
import type { TrackAnalysis } from "./prompt.js";

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

  console.log("Agente de mastering — escribi como queres que suene tu cancion.");
  console.log('Comandos: "perfil" muestra el estado, "salir" termina.\n');
  console.log(renderProfile(profile), "\n");

  for (;;) {
    const input = (await rl.question("> ")).trim();
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

      console.log(
        `\n  [${result.usage.inputTokens} in / ${result.usage.outputTokens} out / ${result.usage.cacheReadTokens} cache]\n`,
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
