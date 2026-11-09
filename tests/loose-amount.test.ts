import { describe, expect, it } from "vitest";
import { parseLooseAmount } from "@/lib/tabular/normalize";

// Valores que a IA devolve como texto. Antes: Number("1.234.56") → NaN → 0
// silencioso, ou seja, um gasto de R$ 1.234,56 entrava como R$ 0,00.
describe("parseLooseAmount (valores da IA)", () => {
  it.each([
    ["1.234,56", "1234.56"],
    ["-1.234,56", "-1234.56"],
    ["1,234.56", "1234.56"],
    ["-45.30", "-45.3"],
    ["412,90", "412.9"],
    ["R$ 412,90", "412.9"],
    ["€ -12,45", "-12.45"],
    ["(12,00)", "-12"],
    ["−3,20", "-3.2"],
    ["1,234", "1234"],
    ["12,345,678", "12345678"],
    ["0,5", "0.5"],
  ])("%s → %s", (raw, expected) => {
    expect(parseLooseAmount(raw)).toBe(expected);
  });

  it("accepts JSON numbers without float noise", () => {
    expect(parseLooseAmount(-45.3)).toBe("-45.3");
    expect(parseLooseAmount(0.3)).toBe("0.3");
    expect(parseLooseAmount(1234.56)).toBe("1234.56");
  });

  it("throws instead of silently returning 0", () => {
    expect(() => parseLooseAmount("abc")).toThrow(/inválido/);
    expect(() => parseLooseAmount("")).toThrow(/inválido/);
    expect(() => parseLooseAmount(Number.NaN)).toThrow(/inválido/);
  });
});
