import { describe, expect, it } from "vitest";
import { parseFilterDate } from "@/lib/transactions/query";

// Bug real: em UTC−3, "até 31/10 23:59:59" virava 02:59 UTC de 1º/11 e o mês de
// outubro passava a incluir os lançamentos do dia 1º de novembro.
describe("parseFilterDate (fim e início de período em UTC)", () => {
  it("horário sem fuso é UTC, não o fuso do servidor", () => {
    expect(parseFilterDate("2026-10-31T23:59:59")?.toISOString()).toBe("2026-10-31T23:59:59.000Z");
    const firstOfNov = new Date("2026-11-01T00:00:00Z");
    expect(firstOfNov.getTime() > parseFilterDate("2026-10-31T23:59:59")!.getTime()).toBe(true);
  });
  it("data sem horário continua meia-noite UTC", () => {
    expect(parseFilterDate("2026-10-01")?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });
  it("respeita fuso explícito", () => {
    expect(parseFilterDate("2026-10-31T23:59:59Z")?.toISOString()).toBe("2026-10-31T23:59:59.000Z");
    expect(parseFilterDate("2026-10-31T21:00:00-03:00")?.toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });
  it("vazio ou inválido não filtra", () => {
    expect(parseFilterDate(null)).toBeUndefined();
    expect(parseFilterDate("ontem")).toBeUndefined();
  });
});
