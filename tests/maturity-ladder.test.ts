import { describe, it, expect } from "vitest";
import { maturityLadder, summarizePortfolio, type PositionInput } from "@/lib/investments/summary";

const pos = (id: string, brl: string, dueDate: string | null): PositionInput & { dueDate: string | null } => ({
  id,
  type: "FIXED_INCOME",
  subtype: "CDB",
  currency: "BRL",
  balance: brl,
  balanceBRL: brl,
  balanceEUR: "0",
  balanceUSD: "0",
  amountOriginal: null,
  dueDate: dueDate && `${dueDate}T00:00:00.000Z`,
});
const today = new Date("2026-11-08T12:00:00.000Z");

describe("escada de vencimentos", () => {
  it("um degrau por ano, do ano corrente ao último vencimento; ano vazio no meio fica com zero", () => {
    const l = maturityLadder(
      [
        pos("a", "1000.10", "2027-01-12"),
        pos("b", "0.20", "2027-12-31"),
        pos("c", "500.00", "2029-06-01"),
        pos("acao", "300.00", null),
      ],
      "BRL",
      today,
    )!;
    expect(l.steps.map((s) => [s.label, s.total, s.count])).toEqual([
      ["2026", "0.00", 0],
      ["2027", "1000.30", 2],
      ["2028", "0.00", 0],
      ["2029", "500.00", 1],
    ]);
    expect(l.dated).toEqual({ total: "1500.30", count: 3 });
    expect(l.undated).toEqual({ total: "300.00", count: 1 });
  });

  it("vencimento distante: além dos degraus que cabem, o resto vai junto no último ('2030+')", () => {
    const l = maturityLadder(
      [pos("a", "10", "2027-03-01"), pos("b", "20", "2035-05-15"), pos("c", "5", "2031-01-01")],
      "BRL",
      today,
      5,
    )!;
    expect(l.steps.map((s) => [s.label, s.total])).toEqual([
      ["2026", "0.00"],
      ["2027", "10.00"],
      ["2028", "0.00"],
      ["2029", "0.00"],
      ["2030+", "25.00"],
    ]);
    expect(l.dated.total).toBe("35.00");
  });

  it("já passou da data e ainda aparece aberto: conta no ano corrente", () => {
    expect(maturityLadder([pos("a", "7", "2025-02-01")], "BRL", today)!.steps).toEqual([
      { label: "2026", year: 2026, total: "7.00", count: 1 },
    ]);
  });

  it("nada com vencimento (só ações e fundos): sem escada", () => {
    expect(maturityLadder([pos("acao", "300", null)], "BRL", today)).toBeNull();
  });
});

describe("alocação", () => {
  it("cada classe com a fração da carteira (para a barra) e a sua cor", () => {
    const s = summarizePortfolio([pos("a", "2", null), { ...pos("t", "1", null), subtype: "TREASURY" }], "BRL");
    expect(s.classes.map((c) => [c.key, c.fraction, c.share])).toEqual([
      ["fixed", "0.6667", "67"],
      ["treasury", "0.3333", "33"],
    ]);
    expect(s.classes.every((c) => /^#[0-9a-f]{6}$/.test(c.color))).toBe(true);
  });
});
