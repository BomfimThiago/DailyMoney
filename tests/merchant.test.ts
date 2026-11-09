import { describe, it, expect } from "vitest";
import { normalizeMerchant } from "@/lib/categories/rules";

describe("normalizeMerchant (category learning key)", () => {
  it("strips store numbers and punctuation, keeps the merchant", () => {
    expect(normalizeMerchant("GRUPO AHORRAMAS 1")).toBe("grupo ahorramas");
    expect(normalizeMerchant("GRUPO AHORRAMAS 24")).toBe("grupo ahorramas");
    expect(normalizeMerchant("Amazon Prime")).toBe("amazon prime");
    expect(normalizeMerchant("NYX*NutrisportSAU")).toBe("nyx nutrisportsau");
  });

  it("is accent- and case-insensitive", () => {
    expect(normalizeMerchant("Farmácia La Mancha")).toBe(normalizeMerchant("FARMACIA LA MANCHA"));
  });

  it("caps at the first tokens so long descriptions still match", () => {
    expect(normalizeMerchant("Licenciada M. Angles De J")).toBe("licenciada m angles");
  });
});
