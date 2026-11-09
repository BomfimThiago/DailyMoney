import { describe, it, expect } from "vitest";
import { cumulativeExpenses, monthPace } from "@/lib/transactions/aggregate";

const tx = (date: string, brl: string, over: Partial<{ type: string; isInternalTransfer: boolean }> = {}) => ({
  date: `${date}T00:00:00.000Z`,
  amountBRL: brl,
  amountEUR: (Number(brl) / 6).toFixed(4),
  amountUSD: "0",
  type: brl.startsWith("-") ? "EXPENSE" : "INCOME",
  isInternalTransfer: false,
  ...over,
});

describe("gasto acumulado por dia", () => {
  it("soma só gastos (sem internas nem entradas), dia a dia, em valor absoluto", () => {
    const got = cumulativeExpenses(
      [
        tx("2026-11-01", "-10.10"),
        tx("2026-11-01", "-0.20"),
        tx("2026-11-03", "-5.00"),
        tx("2026-11-03", "3000.00"), // salário: não é gasto
        tx("2026-11-04", "-800.00", { isInternalTransfer: true }), // aplicação: fora
        tx("2026-10-31", "-99.00"), // outro mês
      ],
      "BRL",
      "2026-11",
      5,
    );
    // 10,10 + 0,20 sem resíduo de float
    expect(got).toEqual(["10.30", "10.30", "15.30", "15.30", "15.30"]);
  });

  it("na lente da moeda escolhida", () => {
    expect(cumulativeExpenses([tx("2026-11-02", "-60.00")], "EUR", "2026-11", 3)).toEqual(["0.00", "10.00", "10.00"]);
  });
});

describe("ritmo do mês", () => {
  const cur = ["10.00", "30.00", "45.00"];
  const prev = ["20.00", "40.00", "60.00", "90.00"];

  it("compara com o mesmo dia do mês anterior", () => {
    expect(monthPace(cur, prev, 3)).toEqual({
      day: 3,
      spent: "45.00",
      previousAtDay: "60.00",
      diff: "-15.00",
      pct: "-25",
    });
  });

  it("mês anterior mais curto (31 contra 30 dias): compara com o fim dele", () => {
    expect(monthPace(["1", "2", "3", "4", "5"], ["1", "2", "4"], 5).previousAtDay).toBe("4.00");
  });

  it("sem gasto no mês anterior até o dia: sem %, não divide por zero", () => {
    expect(monthPace(cur, ["0.00", "0.00", "0.00"], 2).pct).toBeNull();
    expect(monthPace(cur, [], 2)).toMatchObject({ previousAtDay: "0.00", pct: null });
  });
});

describe("metade do mês", () => {
  it("o dia em que o acumulado chega à metade do total", async () => {
    const { halfwayDay } = await import("@/lib/transactions/aggregate");
    expect(halfwayDay(["10.00", "20.00", "50.00", "100.00"])).toBe(3);
    expect(halfwayDay(["0.00", "0.00"])).toBeNull();
    expect(halfwayDay(["60.00", "100.00"])).toBe(1);
  });
});
