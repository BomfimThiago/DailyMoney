import { describe, expect, it } from "vitest";
import { assertAttemptsLeft, countAttempt, limitAttempts } from "@/lib/auth/rate-limit";

describe("limite de tentativas", () => {
  it("só bloqueia depois de max tentativas contadas, e só aquela chave", () => {
    const key = `t:${Math.random()}`;
    for (let i = 0; i < 3; i++) {
      assertAttemptsLeft([key], 3);
      countAttempt([key], 60_000);
    }
    expect(() => assertAttemptsLeft([key], 3)).toThrow(/Muitas tentativas/);
    expect(() => assertAttemptsLeft([`${key}-outra`], 3)).not.toThrow();
  });

  it("limitAttempts conta toda chamada", () => {
    const key = `t:${Math.random()}`;
    limitAttempts([key], 2, 60_000);
    limitAttempts([key], 2, 60_000);
    expect(() => limitAttempts([key], 2, 60_000)).toThrow(/Tente de novo em 1 min/);
  });
});
