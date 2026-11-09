import Decimal from "decimal.js";
import type { Currency } from "@prisma/client";

export { Decimal };

export const CURRENCIES: Currency[] = ["BRL", "USD", "EUR"];

// Round to 4 decimal places (storage precision) as a Decimal.
export function money(value: Decimal.Value): Decimal {
  return new Decimal(value).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
}

// Display formatting used by the UI (<Money>): always pt-BR grouping/decimals,
// symbol first, and an explicit sign chosen by the caller (never by float math).
// e.g. formatAmount("6420", "EUR") → "€ 6.420,00"; with sign "-" → "−€ 6.420,00".
export type AmountSign = "+" | "-" | "none";

const DISPLAY_SYMBOL: Record<Currency, string> = { BRL: "R$", USD: "US$", EUR: "€" };
const MINUS = "−"; // typographic minus, aligns with "+" in tabular figures

export function formatAmount(value: Decimal.Value, currency: Currency, sign: AmountSign = "none"): string {
  const abs = new Decimal(value).abs().toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const [int, frac] = abs.toFixed(2).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const prefix = sign === "+" ? "+" : sign === "-" ? MINUS : "";
  return `${prefix}${DISPLAY_SYMBOL[currency]} ${grouped},${frac}`;
}

export function isCurrency(value: string): value is Currency {
  return (CURRENCIES as string[]).includes(value);
}

/**
 * Valor digitado por uma pessoa (pt-BR) → Decimal com sinal, ou `null` se não for um
 * número. O app é em português: vírgula é decimal e ponto separa milhares.
 *  - "1.234,56", "1234,56", "-45,00", "−45", "+500" → como se lê;
 *  - só ponto: "1.500" e "12.345.678" são milhares (pt-BR); "412.90" e "0.5" são decimais
 *    (até 2 casas depois do ponto, que não formam um grupo de milhar);
 *  - mais de 4 casas decimais (precisão gravada) é recusado, não arredondado.
 * Nunca passa por float.
 */
export function parseMoneyInput(raw: string): Decimal | null {
  let s = raw.trim().replace(/\s/g, "").replace(/^−/, "-");
  const negative = s.startsWith("-");
  s = s.replace(/^[-+]/, "");
  if (!s) return null;
  if (s.includes(",")) {
    // Vírgula é a decimal: os pontos antes dela só podem ser de milhar, em grupos de 3.
    if (!/^\d{1,3}(\.\d{3})*,\d+$|^\d+,\d+$/.test(s)) return null;
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, "");
  } else if (!/^\d+(\.\d{1,2})?$/.test(s)) {
    return null;
  }
  if ((s.split(".")[1] ?? "").length > 4) return null;
  const value = new Decimal(s);
  return negative ? value.negated() : value;
}
