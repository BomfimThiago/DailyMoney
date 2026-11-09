import type { Currency } from "@prisma/client";
import { env } from "@/lib/env";
import { CURRENCIES } from "@/lib/money";
import { parseRatesResponse } from "./rates";

// Frankfurter returns ECB reference rates. It has no weekend/holiday data, so a
// request for such a date returns the previous business day — we record which
// date actually applied. Docs: https://frankfurter.dev
export interface FxLookup {
  effectiveDate: string; // date the rate is valid for
  /** base -> quote como string decimal exata (nunca float). */
  rates: Record<Currency, string>;
  base: Currency;
}

const FX_TIMEOUT_MS = 10_000;

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Fetch base->{others} for a given date directly from Frankfurter.
export async function fetchRatesForDate(date: Date, base: Currency): Promise<FxLookup> {
  const quotes = CURRENCIES.filter((c) => c !== base);
  const url = `${env.FX_BASE_URL}/${ymd(date)}?base=${base}&symbols=${quotes.join(",")}`;
  // Sem timeout, uma API fora do ar deixava a confirmação girando para sempre
  // (erro invisível). Falha rápido com mensagem clara.
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(FX_TIMEOUT_MS),
    });
  } catch (e) {
    const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    throw new Error(
      timedOut
        ? `O serviço de câmbio não respondeu em ${FX_TIMEOUT_MS / 1000}s (${ymd(date)}). Tente de novo em instantes.`
        : `Não foi possível contatar o serviço de câmbio (${ymd(date)}): ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  if (!res.ok) {
    throw new Error(`Falha ao buscar câmbio (${res.status}) para ${ymd(date)} base ${base}`);
  }
  try {
    const { effectiveDate, rates } = parseRatesResponse(await res.text(), base, quotes);
    return { effectiveDate, rates, base };
  } catch (e) {
    throw new Error(`${e instanceof Error ? e.message : "Câmbio inválido"} (${ymd(date)}, base ${base})`);
  }
}
