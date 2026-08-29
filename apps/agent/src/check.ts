/**
 * Verificacion del contrato IntentProfile. No llama a la API: sirve para
 * validar el schema en CI y para que el resto del equipo compruebe sus
 * suposiciones sin gastar creditos.
 *
 *   npm run check -w apps/agent
 */
import {
  AXES,
  NEUTRAL_PROFILE,
  buildContextBlock,
  diffProfiles,
  validateProfile,
} from "./index.js";

let failures = 0;

function check(label: string, condition: boolean): void {
  console.log(`${condition ? "ok  " : "FALLA"} ${label}`);
  if (!condition) failures++;
}

function checkThrows(label: string, fn: () => unknown): void {
  try {
    fn();
    check(label, false);
  } catch {
    check(label, true);
  }
}

check("NEUTRAL_PROFILE valida contra el schema", validateProfile(NEUTRAL_PROFILE) !== null);
check("hay exactamente 9 ejes semanticos", AXES.length === 9);
check(
  "todos los ejes de NEUTRAL_PROFILE valen 0.5",
  AXES.every((axis) => NEUTRAL_PROFILE[axis] === 0.5),
);
check("un perfil sin cambios no produce diff", diffProfiles(NEUTRAL_PROFILE, NEUTRAL_PROFILE).length === 0);

const moved = { ...NEUTRAL_PROFILE, bass_weight: 0.7, vocal_focus: 0.65 };
const changes = diffProfiles(NEUTRAL_PROFILE, moved);
check("el diff detecta los dos ejes movidos", changes.length === 2);
check(
  "el diff reporta la magnitud correcta",
  changes.every((c) => Math.abs(c.delta - (c.to - c.from)) < 1e-9),
);

// Un valor fuera de rango significa que el modelo entendio mal el contrato.
// Recortarlo en silencio esconderia el bug y produciria un master que nadie pidio.
checkThrows("rechaza un eje > 1", () => validateProfile({ ...NEUTRAL_PROFILE, warmth: 1.4 }));
checkThrows("rechaza un eje < 0", () => validateProfile({ ...NEUTRAL_PROFILE, punch: -0.2 }));
checkThrows("rechaza una plataforma fuera del enum", () =>
  validateProfile({ ...NEUTRAL_PROFILE, target_platform: "tiktok" }),
);
checkThrows("rechaza un perfil incompleto", () => validateProfile({ warmth: 0.5 }));

const context = buildContextBlock(moved, {
  detected_genre: "reggaeton",
  tempo_bpm: 96.4,
  integrated_lufs: -12.4,
});
check("el bloque de contexto incluye el perfil actual", context.includes("bass_weight: 0.70"));
check("el bloque de contexto incluye el analisis", context.includes("reggaeton"));

console.log(`\n${failures === 0 ? "Contrato OK" : `${failures} verificacion(es) fallaron`}`);
process.exit(failures === 0 ? 0 : 1);
