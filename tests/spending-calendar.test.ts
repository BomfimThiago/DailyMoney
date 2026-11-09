import { describe, it, expect } from "vitest";
import { dailyExpenses, spendingCalendar } from "@/lib/transactions/aggregate";

const tx = (date: string, brl: string, internal = false) => ({
  date: `${date}T00:00:00.000Z`,
  amountBRL: brl,
  amountEUR: "0",
  amountUSD: "0",
  type: brl.startsWith("-") ? "EXPENSE" : "INCOME",
  isInternalTransfer: internal,
});

describe("calendário de gastos", () => {
  it("gasto por dia: só gastos, sem internas nem entradas, em módulo e sem resíduo de float", () => {
    expect(
      dailyExpenses(
        [
          tx("2026-11-01", "-0.10"),
          tx("2026-11-01", "-0.20"),
          tx("2026-11-02", "3000.00"),
          tx("2026-11-03", "-800.00", true),
          tx("2026-10-31", "-5.00"),
        ],
        "BRL",
        "2026-11",
        3,
      ),
    ).toEqual(["0.30", "0.00", "0.00"]);
  });

  it("intensidade pelo quartil entre os dias com gasto: o aluguel não deixa os outros todos iguais", () => {
    const c = spendingCalendar(["1150.00", "0.00", "86.30", "300.00", "600.00", "20.00"], 6, "2026-11");
    expect(c.days.map((d) => d.level)).toEqual([4, 0, 1, 2, 3, 1]);
    expect(c.peak).toEqual({ day: 1, date: "2026-11-01", total: "1150.00" });
    expect(c.zeroDays).toBe(1);
  });

  it("mês corrente: dias depois de hoje ficam sem cor e fora das contas", () => {
    const c = spendingCalendar(["10.00", "0.00", "0.00", "999.00"], 2, "2026-11");
    // um dia só com gasto: é o quartil de baixo dele mesmo (cor mais clara); o 999 de depois não conta
    expect(c.days.map((d) => [d.level, d.future])).toEqual([
      [1, false],
      [0, false],
      [0, true],
      [0, true],
    ]);
    expect(c.zeroDays).toBe(1);
    expect(c.peak).toEqual({ day: 1, date: "2026-11-01", total: "10.00" });
  });

  it("mês sem gastos: sem dia mais caro, sem divisão por zero", () => {
    const c = spendingCalendar(["0.00", "0.00"], 2, "2026-11");
    expect(c.peak).toBeNull();
    expect(c.days.every((d) => d.level === 0)).toBe(true);
  });

  it("mês financeiro (27 a 26): os dias atravessam o mês do calendário, sem perder nem repetir", () => {
    const txs = [
      tx("2026-10-26", "-9.00"), // dia antes do início: é do mês anterior
      tx("2026-10-27", "-1.00"),
      tx("2026-10-31", "-2.00"),
      tx("2026-11-01", "-3.00"),
      tx("2026-11-26", "-4.00"),
      tx("2026-11-27", "-9.00"), // já é o mês seguinte
    ];
    const daily = dailyExpenses(txs, "BRL", "2026-10-27", 31);
    expect(daily[0]).toBe("1.00");
    expect(daily[4]).toBe("2.00");
    expect(daily[5]).toBe("3.00");
    expect(daily[30]).toBe("4.00");
    expect(daily.reduce((n, v) => n + Number(v), 0)).toBe(10);
    const c = spendingCalendar(daily, 31, "2026-10-27");
    expect(c.days[0].date).toBe("2026-10-27");
    expect(c.days[5].date).toBe("2026-11-01");
    expect(c.days[30].date).toBe("2026-11-26");
  });
});
