import { describe, expect, it } from "vitest";
import { parseMoneyInput } from "@/lib/money";

const read = (s: string) => parseMoneyInput(s)?.toFixed(2) ?? null;

describe("parseMoneyInput (valor digitado em pt-BR)", () => {
  it("lê vírgula como decimal e ponto como milhar", () => {
    expect(read("1.234,56")).toBe("1234.56");
    expect(read("412,90")).toBe("412.90");
    expect(read("0,5")).toBe("0.50");
  });

  it("'1.500' é mil e quinhentos, não 1,50", () => {
    expect(read("1.500")).toBe("1500.00");
    expect(read("12.345.678")).toBe("12345678.00");
  });

  it("aceita ponto decimal quando não forma milhar", () => {
    expect(read("412.90")).toBe("412.90");
    expect(read("0.5")).toBe("0.50");
  });

  it("guarda o sinal (hífen, menos tipográfico ou +)", () => {
    expect(read("-45,00")).toBe("-45.00");
    expect(read("−45")).toBe("-45.00");
    expect(read("+500")).toBe("500.00");
    expect(read(" - 1.234,5 ")).toBe("-1234.50");
  });

  it("recusa o que não é número ou é ambíguo", () => {
    for (const s of ["", "-", "abc", "1,2,3", "12.34.56", "1.23,4.5", "1.2345", "1,23456", "R$ 10"]) {
      expect(parseMoneyInput(s), s).toBeNull();
    }
  });
});
