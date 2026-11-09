import type { Currency } from "@prisma/client";
import { CURRENCIES, Decimal, money } from "@/lib/money";

// Funções puras de câmbio (sem env/prisma) — testáveis isoladamente.
// Regra: taxas e valores são sempre strings decimais/Decimal, nunca float.

const DECIMAL_LITERAL = /^-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?$/;

/**
 * Lê a resposta do Frankfurter sem passar as taxas por float: o JSON.parse
 * transformaria "6.41960000000000001" em number e perderia dígitos. Pegamos o
 * literal numérico exatamente como veio no texto.
 */
export function parseRatesResponse(
  text: string,
  base: Currency,
  quotes: Currency[],
): { effectiveDate: string; rates: Record<Currency, string> } {
  let data: { date?: unknown; rates?: Record<string, unknown> };
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Resposta inválida do serviço de câmbio");
  }
  if (typeof data.date !== "string" || !data.rates) {
    throw new Error("Resposta do serviço de câmbio sem data ou taxas");
  }
  const rates = { [base]: "1" } as Record<Currency, string>;
  for (const q of quotes) {
    const m = text.match(new RegExp(`"${q}"\\s*:\\s*(-?\\d+(?:\\.\\d+)?(?:[eE][-+]?\\d+)?)`));
    if (!m || !DECIMAL_LITERAL.test(m[1])) {
      throw new Error(`Câmbio ausente para ${base}->${q}`);
    }
    rates[q] = m[1];
  }
  return { effectiveDate: data.date, rates };
}

/** Valor × taxa para cada moeda, tudo em Decimal; arredonda para 4 casas (armazenamento). */
export function applyRates(amount: Decimal.Value, rates: Record<Currency, string>): Record<Currency, string> {
  const a = new Decimal(amount);
  const out: Record<Currency, string> = { BRL: "0", USD: "0", EUR: "0" };
  for (const c of CURRENCIES) {
    out[c] = money(a.mul(new Decimal(rates[c]))).toFixed(4);
  }
  return out;
}
