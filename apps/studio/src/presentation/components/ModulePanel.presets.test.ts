import { describe, expect, it } from "vitest";
import { PRESETS } from "./ModulePanel";
import { PRESET_INFO } from "@/core/presets";

/* ── Guard: cada chip de preset manda su target_lufs_db real ────────────
   Los números deben espejar PRESET_INFO y PRESET_CHAINS del backend
   (audiomind.processing.presets). Si un preset no fija target_lufs_db,
   el engine cae en el default (~-14) y la diferencia de fuerza entre
   presets se colapsa: se oyen "iguales". */
describe("PRESETS — LUFS por preset", () => {
  it("cada preset fija su target_lufs_db (espejo de PRESET_INFO/backend)", () => {
    for (const preset of PRESETS) {
      const info = PRESET_INFO[preset.id];
      expect(info, `PRESET_INFO debe conocer "${preset.id}"`).toBeDefined();
      expect(
        preset.params.target_lufs_db,
        `"${preset.id}" debe fijar target_lufs_db=${info.targetLufs} (si no, suena igual que el default)`,
      ).toBe(info.targetLufs);
    }
  });
});