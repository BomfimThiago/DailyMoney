import { describe, expect, it } from "vitest";
import { summarizeMovements } from "@/lib/transactions/aggregate";

const sums = (eur: string, brl = "0") => ({ amountBRL: brl, amountUSD: null, amountEUR: eur });
const none = { count: 0, _sum: null };

describe("movimentações do mês (Resumo)", () => {
  it("o que sai de uma conta e entra na outra fecha em zero", () => {
    const s = summarizeMovements(
      [{ key: "entre", out: { count: 1, _sum: sums("-300.00") }, in: { count: 1, _sum: sums("300.00") } }],
      "EUR",
    );
    expect(s).toMatchObject({ out: "300.00", in: "300.00", net: "0.00" });
    expect(s.rows).toEqual([{ key: "entre", out: "300.00", in: "300.00", net: "0.00", count: 2 }]);
  });

  it("aplicação sem a conta de investimento conectada aparece como o que não voltou", () => {
    const s = summarizeMovements(
      [
        { key: "inv", out: { count: 2, _sum: sums("-5000.10") }, in: { count: 1, _sum: sums("1200.05") } },
        { key: "cartao", out: { count: 1, _sum: sums("-725.45") }, in: { count: 1, _sum: sums("725.45") } },
      ],
      "EUR",
    );
    expect(s.net).toBe("-3800.05");
    expect(s.rows.map((r) => [r.key, r.net])).toEqual([
      ["inv", "-3800.05"],
      ["cartao", "0.00"],
    ]);
  });

  it("usa a moeda escolhida e ignora grupo vazio", () => {
    const s = summarizeMovements(
      [
        { key: "a", out: { count: 1, _sum: sums("-10.00", "-60.00") }, in: none },
        { key: "b", out: none, in: none },
      ],
      "BRL",
    );
    expect(s.rows.map((r) => r.key)).toEqual(["a"]);
    expect(s).toMatchObject({ out: "60.00", in: "0.00", net: "-60.00" });
  });
});
