import { describe, expect, it } from "vitest";
import { internalAfterCategoryChange, internalForSuggested, type KindById } from "@/lib/categories/movement";

const kinds: KindById = new Map([
  ["mercado", "EXPENSE"],
  ["salario", "INCOME"],
  ["investimento", "TRANSFER"],
  ["entre-contas", "TRANSFER"],
]);

describe("categoria de movimentação (fora dos totais)", () => {
  it("entrar numa categoria de movimentação marca a transação como interna", () => {
    expect(internalAfterCategoryChange(kinds, "mercado", "investimento", false)).toBe(true);
    expect(internalAfterCategoryChange(kinds, null, "entre-contas", false)).toBe(true);
  });

  it("sair de uma categoria de movimentação devolve aos totais", () => {
    expect(internalAfterCategoryChange(kinds, "investimento", "mercado", true)).toBe(false);
    expect(internalAfterCategoryChange(kinds, "investimento", null, true)).toBe(false);
  });

  it("entre categorias comuns, a marcação do usuário fica como está", () => {
    expect(internalAfterCategoryChange(kinds, "mercado", "salario", true)).toBe(true);
    expect(internalAfterCategoryChange(kinds, "mercado", "salario", false)).toBe(false);
  });

  it("na importação, a categoria aprendida de movimentação já traz a linha interna", () => {
    expect(internalForSuggested(kinds, "investimento", false)).toBe(true);
    expect(internalForSuggested(kinds, "mercado", false)).toBe(false);
    expect(internalForSuggested(kinds, null, false)).toBe(false);
    // Já marcada como interna (ex.: pagamento de fatura) continua interna.
    expect(internalForSuggested(kinds, "mercado", true)).toBe(true);
  });
});
