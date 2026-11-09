import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseTabular } from "@/lib/tabular/pipeline";
import { parseAmount, parseDate, detectDecimalSeparator } from "@/lib/tabular/normalize";
import { Decimal } from "@/lib/money";

const FIXTURES = resolve(__dirname, "../fixtures");
const read = (f: string) => readFileSync(resolve(FIXTURES, f), "utf8");

describe("normalize primitives", () => {
  it("parses dot-decimal and comma-decimal amounts", () => {
    expect(parseAmount("-4.99", ".").toString()).toBe("-4.99");
    expect(parseAmount("1,234.56", ".").toString()).toBe("1234.56");
    expect(parseAmount("-88,56EUR", ",").toString()).toBe("-88.56");
    expect(parseAmount("2.681,90EUR", ",").toString()).toBe("2681.9");
    expect(parseAmount("(30,00)", ",").toString()).toBe("-30");
  });

  it("parses ISO, dd/mm/yyyy and textual dates as UTC", () => {
    expect(parseDate("2026-08-06 16:14:02").toISOString().slice(0, 10)).toBe("2026-08-06");
    expect(parseDate("31/07/2026").toISOString().slice(0, 10)).toBe("2026-07-31");
    expect(parseDate("Aug 6, 2026").toISOString().slice(0, 10)).toBe("2026-08-06");
  });

  it("detects the decimal separator from samples", () => {
    expect(detectDecimalSeparator(["500.00", "-4.99", "1,234.56"])).toBe(".");
    expect(detectDecimalSeparator(["-88,56EUR", "2.681,90EUR"])).toBe(",");
  });
});

describe("Revolut-style CSV (comma delimiter, dot decimal, EUR column)", () => {
  const text = read("account-statement_2026-08-01_2026-08-20_es-es_dfe6da.csv");
  const { profile, applied, headers } = parseTabular(text);

  it("infers the correct column roles", () => {
    expect(headers[profile.columnRoles.amount]).toBe("Importe");
    expect(headers[profile.columnRoles.description]).toBe("Descripción");
    expect(profile.columnRoles.currency).toBeDefined();
    expect(headers[profile.columnRoles.currency!]).toBe("Divisa");
    expect(profile.decimalSeparator).toBe(".");
    expect(profile.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("parses every row without errors", () => {
    expect(applied.errors).toHaveLength(0);
    expect(applied.rows.length).toBe(80);
  });

  it("classifies a card payment as an expense with the right amount", () => {
    const amazon = applied.rows.find((r) => r.description === "Amazon Prime");
    expect(amazon).toBeDefined();
    expect(amazon!.type).toBe("EXPENSE");
    expect(amazon!.baseAmount).toBe("-4.9900");
    expect(amazon!.baseCurrency).toBe("EUR");
  });

  it("never marks anything as internal on its own: transfers count by sign", () => {
    // Um Pix/transferência pode ser pagamento a alguém; só o usuário marca "interna".
    expect(applied.rows.some((r) => r.isInternalTransfer || r.type === "TRANSFER")).toBe(false);
    const toSpouse = applied.rows.filter((r) => r.description.startsWith("Transferencia a "));
    expect(toSpouse.length).toBeGreaterThan(0);
    expect(toSpouse.every((r) => r.type === "EXPENSE")).toBe(true);
    const savings = applied.rows.filter((r) => r.description.includes("AHORROS"));
    expect(savings.map((r) => r.type).sort()).toEqual(
      savings.map((r) => (new Decimal(r.baseAmount).isNegative() ? "EXPENSE" : "INCOME")).sort(),
    );
  });

  it("marks the pending card payment as PENDING", () => {
    const pending = applied.rows.find((r) => r.description === "Mrtrainfit");
    expect(pending?.state).toBe("PENDING");
  });

  it("keeps a real external transfer (rent) as a plain expense", () => {
    const rent = applied.rows.find((r) => r.description.includes("Fidere Vivienda"));
    expect(rent?.type).toBe("EXPENSE");
    expect(rent?.isInternalTransfer).toBe(false);
  });
});

describe("Spanish bank CSV (semicolon, comma decimal, EUR suffix, dd/mm/yyyy)", () => {
  const text = read("extractDocument_20260820.csv");
  const { profile, applied, headers } = parseTabular(text);

  it("detects the semicolon delimiter and comma decimals", () => {
    expect(profile.delimiter).toBe(";");
    expect(profile.decimalSeparator).toBe(",");
    expect(headers[profile.columnRoles.amount]).toBe("Importe");
    expect(headers[profile.columnRoles.description]).toBe("Concepto");
  });

  it("defaults currency to EUR from the amount suffix", () => {
    expect(profile.defaultCurrency).toBe("EUR");
    expect(applied.rows.every((r) => r.baseCurrency === "EUR")).toBe(true);
  });

  it("parses all rows and a known negative amount", () => {
    expect(applied.errors).toHaveLength(0);
    expect(applied.rows.length).toBe(34);
    const tgss = applied.rows.find((r) => r.description.startsWith("TGSS"));
    expect(tgss!.type).toBe("EXPENSE");
    expect(new Decimal(tgss!.baseAmount).toString()).toBe("-88.56");
  });

  it("parses dd/mm/yyyy dates correctly", () => {
    const row = applied.rows.find((r) => r.description.startsWith("TGSS"));
    expect(row!.date.toISOString().slice(0, 10)).toBe("2026-07-31");
  });
});

describe("parseDate não inventa data a partir de data impossível", () => {
  it.each(["31/02/2026", "13/13/2026", "99/99/2026", "2026-02-30", "00/10/2026", "2026-10-07 25:00", "Feb 30, 2026"])(
    "%s → erro (não vira outro dia)",
    async (raw) => {
      const { parseDate } = await import("@/lib/tabular/normalize");
      expect(() => parseDate(raw)).toThrow(/Data inválida/);
    },
  );

  it("datas válidas continuam iguais", async () => {
    const { parseDate } = await import("@/lib/tabular/normalize");
    expect(parseDate("29/02/2028").toISOString()).toBe("2028-02-29T00:00:00.000Z");
    expect(parseDate("07/10/2026").toISOString()).toBe("2026-10-07T00:00:00.000Z");
    expect(parseDate("2026-08-06 16:14:02").toISOString()).toBe("2026-08-06T16:14:02.000Z");
    expect(parseDate("6 ago 2026").toISOString()).toBe("2026-08-06T00:00:00.000Z");
  });

  it("linha com data impossível vira erro visível, as outras entram", () => {
    const r = parseTabular(
      "Fecha;Concepto;Importe;Divisa\n07/10/2026;Kiosko;-3,20;EUR\n31/02/2026;Quebrada;-1,00;EUR\n",
    );
    expect(r.applied.rows.map((x) => x.description)).toEqual(["Kiosko"]);
    expect(r.applied.errors[0].message).toMatch(/Data inválida: "31\/02\/2026"/);
  });
});
