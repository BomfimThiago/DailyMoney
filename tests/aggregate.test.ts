import { describe, expect, it } from "vitest";
import { groupExpenses, monthTotals, pctChange, savingsRate, trimLeadingEmpty } from "@/lib/transactions/aggregate";

const tx = (type: string, eur: string, cat: string, internal = false) => ({
  type,
  isInternalTransfer: internal,
  amountEUR: eur,
  amountUSD: "0",
  amountBRL: "0",
  cat,
});

describe("groupExpenses", () => {
  it("sums only expenses (abs), skips income and internal transfers, sorts desc", () => {
    const g = groupExpenses(
      [
        tx("EXPENSE", "-86.42", "Mercado"),
        tx("EXPENSE", "-64.32", "Mercado"),
        tx("EXPENSE", "-1450.00", "Moradia"),
        tx("INCOME", "4200.00", "Salário"),
        tx("EXPENSE", "-500.00", "Transf", true),
      ],
      "EUR",
      (t) => ({ key: t.cat, label: t.cat }),
    );
    expect(g.map((x) => [x.label, x.total, x.count])).toEqual([
      ["Moradia", "1450.00", 1],
      ["Mercado", "150.74", 2],
    ]);
    expect(g[0].share).toBe("0.9058");
  });

  it("adds tenths exactly (no float drift)", () => {
    const g = groupExpenses([tx("EXPENSE", "-0.1", "a"), tx("EXPENSE", "-0.2", "a")], "EUR", (t) => ({
      key: t.cat,
      label: t.cat,
    }));
    expect(g[0].total).toBe("0.30");
  });
});

describe("monthTotals / pctChange / savingsRate", () => {
  const rows = [
    { month: "2026-08", type: "INCOME", brl: "0", usd: "0", eur: "6420" },
    { month: "2026-08", type: "EXPENSE", brl: "0", usd: "0", eur: "-4183.52" },
    { month: "2026-07", type: "EXPENSE", brl: "0", usd: "0", eur: "-5300" },
  ];
  it("builds ascending months with absolute expense and net", () => {
    expect(monthTotals(rows, "EUR")).toEqual([
      { month: "2026-07", income: "0.00", expense: "5300.00", net: "-5300.00" },
      { month: "2026-08", income: "6420.00", expense: "4183.52", net: "2236.48" },
    ]);
  });
  it("computes change and savings rate", () => {
    expect(pctChange("4183.52", "5300.00")).toBe("-21.1");
    expect(pctChange("1", "0")).toBeNull();
    expect(savingsRate(monthTotals(rows, "EUR")[1])).toBe("34.8");
    expect(savingsRate(monthTotals(rows, "EUR")[0])).toBeNull();
  });
});

describe("seriesStats", () => {
  it("ignores empty months and finds average, priciest and positive months", async () => {
    const { seriesStats } = await import("@/lib/transactions/aggregate");
    const s = seriesStats([
      { month: "2026-06", income: "0.00", expense: "0.00", net: "0.00" },
      { month: "2026-07", income: "6000.00", expense: "6400.00", net: "-400.00" },
      { month: "2026-08", income: "6420.00", expense: "4183.52", net: "2236.48" },
    ]);
    expect(s).toEqual({
      months: 2,
      avgExpense: "5291.76",
      priciest: { month: "2026-07", income: "6000.00", expense: "6400.00", net: "-400.00" },
      positiveMonths: 1,
      totalNet: "1836.48",
    });
    expect(seriesStats([])).toBeNull();
  });
});

describe("trimLeadingEmpty", () => {
  const m = (month: string, income: string, expense: string) => ({ month, income, expense, net: "0.00" });
  it("corta os meses vazios antes do primeiro dado", () => {
    const s = [
      m("2026-01", "0.00", "0.00"),
      m("2026-02", "0.00", "0.00"),
      m("2026-03", "10.00", "0.00"),
      m("2026-04", "0.00", "0.00"),
    ];
    expect(trimLeadingEmpty(s).map((x) => x.month)).toEqual(["2026-03", "2026-04"]);
  });
  it("mantém pelo menos dois meses e não mexe em série sem dados", () => {
    const s = [m("2026-01", "0.00", "0.00"), m("2026-02", "0.00", "0.00"), m("2026-03", "0.00", "5.00")];
    expect(trimLeadingEmpty(s).map((x) => x.month)).toEqual(["2026-02", "2026-03"]);
    const empty = [m("2026-01", "0.00", "0.00")];
    expect(trimLeadingEmpty(empty)).toEqual(empty);
  });
});
