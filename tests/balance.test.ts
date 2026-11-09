import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseTabular } from "@/lib/tabular/pipeline";

const FIXTURES = resolve(__dirname, "../fixtures");
const text = readFileSync(resolve(FIXTURES, "account-statement_2026-08-01_2026-08-20_es-es_dfe6da.csv"), "utf8");

describe("balance-check sensor", () => {
  it("does not flag rows that chain correctly", () => {
    const { applied } = parseTabular(text);
    const spotify = applied.rows.find((r) => r.description === "Spotify");
    expect(spotify).toBeDefined();
    expect(spotify!.needsReview).toBeFalsy();
    // Two accounts in one file (current + savings opened mid-month): the opening row of
    // each balance series has no previous balance in the file, and that is not an error.
    const flagged = applied.rows.filter((r) => r.reviewReason === "saldo não confere");
    expect(flagged).toEqual([]);
  });

  it("flags a row whose amount was tampered (balance no longer reconciles)", () => {
    // Break Spotify's amount so its previous balance matches nothing.
    const tampered = text.replace("Spotify,-16.99", "Spotify,-99.99");
    const { applied } = parseTabular(tampered);
    const spotify = applied.rows.find((r) => r.description === "Spotify");
    expect(spotify!.needsReview).toBe(true);
    expect(spotify!.reviewReason).toBe("saldo não confere");
  });
});
