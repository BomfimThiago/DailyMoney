import type { Currency } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { Decimal, money, CURRENCIES } from "@/lib/money";
import { fetchRatesForDate } from "@/lib/fx/frankfurter";
import { applyRates } from "./rates";

function dayUTC(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export interface ConvertedAmounts {
  amountBRL: string;
  amountUSD: string;
  amountEUR: string;
  fxRateDate: Date;
  fxSource: string;
}

// Get base->quote rates for a date, cache-first. On a miss, fetch from
// Frankfurter (one call returns all quotes), cache every pair, and return them.
export async function getRatesForDate(
  date: Date,
  base: Currency,
): Promise<{ rates: Record<Currency, string>; effectiveDate: Date; source: string }> {
  const d = dayUTC(date);
  const quotes = CURRENCIES.filter((c) => c !== base);

  const cached = await prisma.fxRate.findMany({
    where: { date: d, base, quote: { in: quotes } },
  });

  if (cached.length === quotes.length) {
    // Taxas sempre como string decimal (Prisma Decimal → toString), nunca Number().
    const rates = { [base]: "1" } as Record<Currency, string>;
    for (const row of cached) rates[row.quote] = row.rate.toString();
    return { rates, effectiveDate: d, source: "cache" };
  }

  const lookup = await fetchRatesForDate(d, base);
  const effectiveDate = new Date(`${lookup.effectiveDate}T00:00:00.000Z`);

  await prisma.$transaction(
    quotes.map((q) =>
      prisma.fxRate.upsert({
        where: { date_base_quote: { date: d, base, quote: q } },
        create: { date: d, base, quote: q, rate: new Decimal(lookup.rates[q]).toFixed(8), source: "frankfurter" },
        update: { rate: new Decimal(lookup.rates[q]).toFixed(8) },
      }),
    ),
  );

  return { rates: lookup.rates, effectiveDate, source: "frankfurter" };
}

// Convert a base amount into all three currencies on the purchase date.
export async function convertToAllCurrencies(
  baseAmount: Decimal.Value,
  baseCurrency: Currency,
  date: Date,
): Promise<ConvertedAmounts> {
  const amount = new Decimal(baseAmount);
  const { rates, effectiveDate, source } = await getRatesForDate(date, baseCurrency);

  const out = applyRates(amount, rates);

  return {
    amountBRL: out.BRL,
    amountUSD: out.USD,
    amountEUR: out.EUR,
    fxRateDate: effectiveDate,
    fxSource: source,
  };
}
