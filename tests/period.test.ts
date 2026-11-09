import { describe, expect, it } from "vitest";
import {
  daysBetween,
  normalizeStartDay,
  periodBounds,
  periodDates,
  periodKeyOf,
  periodRange,
  shiftKey,
} from "@/lib/period";

describe("mês financeiro", () => {
  it("dia 1 é o mês do calendário", () => {
    expect(periodBounds("2026-02", 1)).toEqual({ start: "2026-02-01", end: "2026-02-28", days: 28 });
    expect(periodBounds("2024-02", 1).days).toBe(29);
    expect(periodKeyOf("2026-11-30", 1)).toBe("2026-11");
    expect(periodRange("2026-11", 1)).toEqual({ from: "2026-11-01", to: "2026-11-30T23:59:59" });
  });

  it("começando no dia 27, o período leva o nome do mês em que termina", () => {
    expect(periodBounds("2026-11", 27)).toEqual({ start: "2026-10-27", end: "2026-11-26", days: 31 });
    expect(periodKeyOf("2026-10-26", 27)).toBe("2026-10");
    expect(periodKeyOf("2026-10-27", 27)).toBe("2026-11");
    expect(periodKeyOf("2026-11-26", 27)).toBe("2026-11");
    expect(periodKeyOf("2026-11-27", 27)).toBe("2026-12");
  });

  it("vira o ano e passa por fevereiro sem perder dia", () => {
    expect(periodBounds("2027-01", 27)).toEqual({ start: "2026-12-27", end: "2027-01-26", days: 31 });
    expect(periodKeyOf("2026-12-31", 27)).toBe("2027-01");
    expect(periodBounds("2027-03", 27)).toEqual({ start: "2027-02-27", end: "2027-03-26", days: 28 });
    expect(periodBounds("2027-02", 28)).toEqual({ start: "2027-01-28", end: "2027-02-27", days: 31 });
  });

  it("começando até o dia 15, o período leva o nome do mês em que começa", () => {
    expect(periodBounds("2026-05", 15)).toEqual({ start: "2026-05-15", end: "2026-06-14", days: 31 });
    expect(periodKeyOf("2026-06-14", 15)).toBe("2026-05");
    expect(periodKeyOf("2026-05-14", 15)).toBe("2026-04");
    expect(periodBounds("2026-12", 5)).toEqual({ start: "2026-12-05", end: "2027-01-04", days: 31 });
  });

  it("todo dia cai em exatamente um período, e os períodos se encostam", () => {
    for (const sd of [1, 2, 10, 15, 16, 27, 28]) {
      let prevEnd: string | null = null;
      for (let i = 0; i < 26; i++) {
        const key = shiftKey("2025-11", i);
        const b = periodBounds(key, sd);
        const dates = periodDates(key, sd);
        expect(dates.length).toBe(b.days);
        expect(dates[0]).toBe(b.start);
        expect(dates.at(-1)).toBe(b.end);
        for (const d of dates) expect(periodKeyOf(d, sd)).toBe(key);
        if (prevEnd) expect(daysBetween(prevEnd, b.start)).toBe(1);
        prevEnd = b.end;
      }
    }
  });

  it("dia inválido vira o mês do calendário", () => {
    expect(normalizeStartDay(0)).toBe(1);
    expect(normalizeStartDay(29)).toBe(1);
    expect(normalizeStartDay(2.5)).toBe(1);
    expect(normalizeStartDay(undefined)).toBe(1);
    expect(normalizeStartDay(27)).toBe(27);
  });

  it("shiftKey atravessa anos nos dois sentidos", () => {
    expect(shiftKey("2026-01", -1)).toBe("2025-12");
    expect(shiftKey("2026-12", 1)).toBe("2027-01");
    expect(shiftKey("2026-11", -23)).toBe("2024-12");
  });
});
