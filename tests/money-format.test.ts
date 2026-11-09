import { describe, expect, it } from "vitest";
import { formatAmount } from "@/lib/money";

describe("formatAmount (UI display)", () => {
  it("groups thousands and uses comma decimals for every currency", () => {
    expect(formatAmount("6420", "EUR")).toBe("€ 6.420,00");
    expect(formatAmount("412.9", "BRL")).toBe("R$ 412,90");
    expect(formatAmount("1234567.891", "USD")).toBe("US$ 1.234.567,89");
  });

  it("uses the caller's sign and the absolute value", () => {
    expect(formatAmount("-86.42", "EUR", "-")).toBe("−€ 86,42");
    expect(formatAmount("-86.42", "EUR", "+")).toBe("+€ 86,42");
    expect(formatAmount("-86.42", "EUR")).toBe("€ 86,42");
  });

  it("rounds half up at 2 decimals without float drift", () => {
    expect(formatAmount("0.005", "EUR")).toBe("€ 0,01");
    expect(formatAmount("2.675", "EUR")).toBe("€ 2,68"); // float would give 2.67
    expect(formatAmount("0.1234", "BRL")).toBe("R$ 0,12");
  });
});
