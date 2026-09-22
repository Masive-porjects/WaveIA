/**
 * lib/audioUtils — funciones puras de mapeo de género:
 *  - genreToParams: el backend emite ids con underscore ("hip_hop");
 *    el perfil urbano debe aplicarse igual que con "hip-hop"/"urban".
 *  - genreDisplayLabel: etiqueta legible; "hip_hop" tiene nombre propio
 *    ("Rap / Hip-Hop"), el resto reemplaza "_" por espacio, null/other
 *    se normalizan a "Otro".
 */
import { describe, it, expect } from "vitest";
import { genreDisplayLabel, genreToParams } from "@/lib/audioUtils";

describe("genreToParams — perfil urbano", () => {
  const urbanProfile = {
    compression_ratio: 4.0,
    limiter_ceiling_db: -1.0,
    transient_boost_db: 2.0,
    haas_delay_ms: 5,
    stereo_width: 1.2,
    target_lufs_db: -12,
  };

  it('hip_hop (id con underscore del backend) aplica el perfil urbano', () => {
    expect(genreToParams("hip_hop")).toMatchObject(urbanProfile);
  });

  it('hip-hop (con guion) aplica el mismo perfil', () => {
    expect(genreToParams("hip-hop")).toMatchObject(urbanProfile);
  });

  it("reggaeton y urban comparten el perfil", () => {
    expect(genreToParams("reggaeton")).toMatchObject(urbanProfile);
    expect(genreToParams("urban")).toMatchObject(urbanProfile);
  });

  it("null devuelve los defaults (sin perfil urbano)", () => {
    const p = genreToParams(null);
    expect(p.compression_ratio).toBe(2.0);
    expect(p.transient_boost_db).toBe(0.0);
    expect(p.stereo_width).toBe(1.0);
  });
});

describe("genreDisplayLabel", () => {
  it('hip_hop → "Rap / Hip-Hop"', () => {
    expect(genreDisplayLabel("hip_hop")).toBe("Rap / Hip-Hop");
  });

  it("reemplaza underscore por espacio en otros géneros", () => {
    expect(genreDisplayLabel("electronica")).toBe("electronica");
    expect(genreDisplayLabel("rock_alternativo")).toBe("rock alternativo");
  });

  it("null y other → Otro", () => {
    expect(genreDisplayLabel(null)).toBe("Otro");
    expect(genreDisplayLabel("other")).toBe("Otro");
  });
});