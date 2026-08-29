import { describe, expect, it } from "vitest";

import { decodeAgentText } from "./decodeAgentText";

describe("decodeAgentText", () => {
  it("decodes UTF-8 copy returned with percent encoding", () => {
    expect(
      decodeAgentText("%C2%BFTe gustar%C3%ADa darle m%C3%A1s amplitud y profundidad%3F"),
    ).toBe("¿Te gustaría darle más amplitud y profundidad?");
  });

  it("repairs truncated encoded opening punctuation", () => {
    expect(decodeAgentText("%C%BFPreferís un toque c%C3%A1lido%3F")).toBe(
      "¿Preferís un toque cálido?",
    );
  });

  it("leaves ordinary percentages and URLs unchanged", () => {
    const text = "Subí el ancho 10% y abrí https://example.com/a%20b";
    expect(decodeAgentText(text)).toBe(text);
  });

  it("leaves malformed encoded text unchanged", () => {
    expect(decodeAgentText("m%C3%A1s%ZZ")).toBe("m%C3%A1s%ZZ");
  });
});
