import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Decimal, parseMoneyInput } from "@/lib/money";
import type { Currency, Transaction, TxType } from "@/hooks";

export const CURRENCIES: Currency[] = ["EUR", "USD", "BRL"];

export const TYPE_LABEL: Record<TxType, string> = {
  EXPENSE: "Gastos",
  INCOME: "Entradas",
  TRANSFER: "Transferências",
};

const AMOUNT_FIELD = { BRL: "amountBRL", USD: "amountUSD", EUR: "amountEUR" } as const;

/** Valor (string decimal com sinal) da transação na moeda da lente. */
export function amountIn(tx: Pick<Transaction, "amountBRL" | "amountUSD" | "amountEUR">, lens: Currency): string {
  return tx[AMOUNT_FIELD[lens]];
}

/** Tipo visual do <Money>: transferência interna é cinza, fora dos totais. */
export function moneyKind(tx: Pick<Transaction, "type" | "isInternalTransfer">) {
  return tx.isInternalTransfer ? ("TRANSFER" as const) : tx.type;
}

/** Cor/sinal de um total já somado (Decimal): negativo = gasto, positivo = entrada, zero = neutro. */
export function totalKind(value: Decimal) {
  if (value.isZero()) return "NEUTRAL" as const;
  return value.isNegative() ? ("EXPENSE" as const) : ("INCOME" as const);
}

/** "2026-08-20T00:00:00.000Z" → "2026-08-20" (data do lançamento, sem fuso). */
export function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "Qui, 20 ago" */
export function dayLabel(day: string): string {
  return capitalize(format(parseISO(day), "EEEEEE, d MMM", { locale: ptBR }));
}

/** "Sex, 14 ago 2026" */
export function fullDayLabel(day: string): string {
  return capitalize(format(parseISO(day), "EEEEEE, d MMM yyyy", { locale: ptBR }));
}

/** "14/08/2026" */
export function shortDate(day: string): string {
  return format(parseISO(day), "dd/MM/yyyy");
}

/**
 * Converte o texto digitado ("1.234,56", "412,90", "1.500") em Decimal positivo (o sinal
 * vem do tipo escolhido). Devolve `null` se não for um número válido. Ver `parseMoneyInput`.
 */
export function parseAmountInput(raw: string): Decimal | null {
  return parseMoneyInput(raw)?.abs() ?? null;
}

/** Decimal → texto do campo de valor em pt-BR, sem sinal ("412,90"). */
export function amountToInput(value: string): string {
  return new Decimal(value).abs().toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2).replace(".", ",");
}
