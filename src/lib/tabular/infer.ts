import type { Currency } from "@prisma/client";
import type { ColumnRoles, FormatProfileSpec } from "@/lib/tabular/types";
import { detectDecimalSeparator, detectCurrencyInCell } from "@/lib/tabular/normalize";

// Keyword dictionaries (Spanish / Portuguese / English) for header → role.
const ROLE_KEYWORDS: Record<string, RegExp> = {
  date: /(fecha|data|date)/i,
  amount: /(importe|monto|valor|amount|cantidad|montante|quantia)/i,
  description:
    /(descrip|concepto|detalle|descri|memo|referencia|merchant|beneficiario|payee|hist[oó]rico|lançamento|lancamento)/i,
  currency: /(divisa|moneda|currency|moeda)/i,
  fee: /(comisi|comiss|fee|tarifa|encargo)/i,
  balance: /(saldo|balance)/i,
  state: /(state|estado|status)/i,
  type: /(tipo|type|categoria)/i,
};

function normalize(h: string): string {
  return h.trim().toLowerCase();
}

// Deterministic, offline layout inference. Returns a profile + confidence.
export function heuristicInferProfile(headers: string[], sampleRows: string[][]): FormatProfileSpec {
  const norm = headers.map(normalize);
  const used = new Set<number>();

  const findRole = (role: keyof typeof ROLE_KEYWORDS, avoid: RegExp[] = []): number => {
    for (let i = 0; i < norm.length; i++) {
      if (used.has(i)) continue;
      if (ROLE_KEYWORDS[role].test(norm[i]) && !avoid.some((a) => a.test(norm[i]))) {
        used.add(i);
        return i;
      }
    }
    return -1;
  };

  // Assign specific roles first so "amount" doesn't grab the fee/balance columns.
  const fee = findRole("fee");
  const balance = findRole("balance");
  const state = findRole("state");
  const currency = findRole("currency");
  const type = findRole("type");
  // Prefer the first date column (usually the operation/purchase date).
  const date = findRole("date");
  const amount = findRole("amount");
  const description = findRole("description");

  const roles: ColumnRoles = {
    date,
    amount,
    description: description === -1 ? pickFallbackDescription(headers, used) : description,
  };
  if (currency !== -1) roles.currency = currency;
  if (fee !== -1) roles.fee = fee;
  if (balance !== -1) roles.balance = balance;
  if (state !== -1) roles.state = state;
  if (type !== -1) roles.type = type;

  // Decimal separator + default currency from the amount column samples.
  const amountSamples = amount !== -1 ? sampleRows.map((r) => r[amount] ?? "").filter(Boolean) : [];
  const decimalSeparator = detectDecimalSeparator(amountSamples);

  let defaultCurrency: Currency | null = null;
  if (currency === -1) {
    for (const cell of amountSamples) {
      const c = detectCurrencyInCell(cell);
      if (c) {
        defaultCurrency = c;
        break;
      }
    }
  }

  // Confidence: core fields present → high.
  const core = [roles.date, roles.amount, roles.description];
  const missing = core.filter((r) => r === -1).length;
  const confidence = missing === 0 ? 0.95 : missing === 1 ? 0.6 : 0.3;

  return {
    delimiter: "", // filled by caller (it knows the delimiter)
    columnRoles: roles,
    decimalSeparator,
    dateFormat: "auto",
    signConvention: "negative_is_expense",
    defaultCurrency,
    confidence,
  };
}

// If no header matched a description, pick the widest textual column.
function pickFallbackDescription(headers: string[], used: Set<number>): number {
  for (let i = 0; i < headers.length; i++) {
    if (!used.has(i)) {
      used.add(i);
      return i;
    }
  }
  return -1;
}
