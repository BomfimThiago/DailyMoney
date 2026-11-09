import { describe, expect, it } from "vitest";
import { parseRatesResponse } from "@/lib/fx/rates";
import { applyRates } from "@/lib/fx/rates";

describe("parseRatesResponse (Frankfurter)", () => {
  it("keeps the rate literals exactly as sent (no float round-trip)", () => {
    const text = '{"amount":1.0,"base":"EUR","date":"2026-07-07","rates":{"BRL":6.41960000000000001,"USD":1.1433}}';
    const r = parseRatesResponse(text, "EUR", ["BRL", "USD"]);
    expect(r.effectiveDate).toBe("2026-07-07");
    // Number("6.41960000000000001") === 6.4196 — o float perderia os dígitos.
    expect(r.rates).toEqual({ EUR: "1", BRL: "6.41960000000000001", USD: "1.1433" });
  });

  it("fails clearly when a quote is missing or the body is not JSON", () => {
    expect(() => parseRatesResponse('{"date":"2026-07-07","rates":{"USD":1.1}}', "EUR", ["BRL", "USD"])).toThrow(
      /ausente para EUR->BRL/,
    );
    expect(() => parseRatesResponse("<html>502</html>", "EUR", ["USD"])).toThrow(/inválida/);
  });
});

describe("applyRates", () => {
  it("multiplies in Decimal and rounds half-up to 4 places", () => {
    expect(applyRates("-412.90", { BRL: "1", EUR: "0.155773", USD: "0.18221234" })).toEqual({
      BRL: "-412.9000",
      EUR: "-64.3187", // -64.3186717 → half-up
      USD: "-75.2355", // -75.23547519
    });
  });

  it("has no float drift on classic cases", () => {
    // 0.1 × 3 em float = 0.30000000000000004
    expect(applyRates("0.1", { BRL: "3", EUR: "1", USD: "1" }).BRL).toBe("0.3000");
    expect(applyRates("1.005", { BRL: "1", EUR: "1", USD: "1" }).EUR).toBe("1.0050");
  });
});
