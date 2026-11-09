import * as React from "react";
import type { Currency } from "@prisma/client";
import { Decimal, formatAmount, type AmountSign } from "@/lib/money";
import { cn } from "@/lib/utils";

/** Valor monetário vindo da API: string decimal ou Decimal. Nunca `number`. */
export type MoneyValue = string | Decimal;
export type MoneyKind = "EXPENSE" | "INCOME" | "TRANSFER" | "NEUTRAL";

const SIZE = {
  sm: "text-[13px] font-semibold",
  md: "text-[15px] font-semibold",
  lg: "text-[16px] font-semibold",
  /** Número irmão de um KPI (24px). */
  figure: "font-display text-display-md",
  /** O número que responde a tela (32px). */
  display: "font-display text-display-lg",
} as const;

/** Cor de uma variação: bom (verde), ruim (vermelho) ou neutra (cinza, ex.: zero). */
export type MoneyTone = "good" | "bad" | "muted";

/**
 * Regra única de exibição de dinheiro:
 * gasto = tinta + "−" · entrada = verde + "+" · transferência interna = cinza, sem sinal.
 * Se a moeda original difere da exibida, o original aparece embaixo, pequeno.
 */
export function Money({
  value,
  currency,
  kind = "NEUTRAL",
  original,
  size = "md",
  align = "right",
  change,
  className,
}: {
  value: MoneyValue;
  currency: Currency;
  kind?: MoneyKind;
  original?: { value: MoneyValue; currency: Currency };
  size?: keyof typeof SIZE;
  /** Variações: mostra "+" quando positivo e pinta pelo sentido (bom/ruim), não pela direção. */
  change?: MoneyTone;
  align?: "left" | "right";
  className?: string;
}) {
  // O sinal vem do próprio valor (a API grava gasto negativo). `kind` só define
  // a cor e força o sinal quando o valor chega em módulo (ex.: totais).
  const negative = new Decimal(value.toString()).isNegative();
  const zero = new Decimal(value.toString()).isZero();
  const sign: AmountSign = change
    ? negative
      ? "-"
      : zero
        ? "none"
        : "+"
    : kind === "TRANSFER"
      ? "none"
      : negative || kind === "EXPENSE"
        ? "-"
        : kind === "INCOME"
          ? "+"
          : "none";
  const income = !change && kind === "INCOME" && !negative;
  const showOriginal = original && original.currency !== currency;
  return (
    <span className={cn("inline-flex flex-col", align === "right" ? "items-end" : "items-start", className)}>
      <span
        className={cn(
          "whitespace-nowrap tabular-nums",
          SIZE[size],
          income && "text-success",
          kind === "TRANSFER" && "font-medium text-subtle",
          change === "good" && "text-success",
          change === "bad" && "text-destructive",
          change === "muted" && "text-subtle",
        )}
      >
        {formatAmount(value.toString(), currency, sign)}
      </span>
      {showOriginal ? (
        <span className="mt-0.5 whitespace-nowrap text-[12px] tabular-nums text-subtle">
          {formatAmount(original.value.toString(), original.currency, sign)}
        </span>
      ) : null}
    </span>
  );
}
