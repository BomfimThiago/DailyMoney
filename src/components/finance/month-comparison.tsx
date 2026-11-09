import * as React from "react";
import type { Currency } from "@prisma/client";
import { Decimal } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Money, type MoneyKind } from "./money";

export interface ComparisonRow {
  key: string;
  label: string;
  /** Valores em string decimal, na moeda da lente. */
  current: string;
  previous: string | undefined;
  kind?: MoneyKind;
  /** Para que lado é bom: entradas e sobra "up", gastos "down". */
  better: "up" | "down";
}

/**
 * Tabela curta "este mês × mês anterior": valor anterior e a diferença, ambos à direita
 * e em algarismos tabulares. A diferença é calculada em Decimal a partir dos valores
 * exibidos (centavos), e a cor diz bom ou ruim — não sobe ou desce. Zero fica cinza;
 * sem mês anterior, um traço.
 */
export function MonthComparison({
  rows,
  currency,
  previousLabel,
  className,
}: {
  rows: ComparisonRow[];
  currency: Currency;
  /** Nome do mês anterior ("Outubro"). */
  previousLabel: string;
  className?: string;
}) {
  return (
    <table className={cn("w-full text-[15px]", className)}>
      <thead>
        <tr className="h-9 text-left text-[13px] text-subtle">
          <th className="font-normal">
            <span className="sr-only">Métrica</span>
          </th>
          <th className="text-right font-normal capitalize">{previousLabel}</th>
          <th className="w-36 text-right font-normal">Diferença</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const prev = r.previous ?? null;
          const diff =
            prev === null
              ? null
              : new Decimal(r.current).toDecimalPlaces(2).minus(new Decimal(prev).toDecimalPlaces(2));
          const tone = diff === null || diff.isZero() ? "muted" : diff.gt(0) === (r.better === "up") ? "good" : "bad";
          return (
            <tr key={r.key} className="h-9 border-t border-[hsl(var(--border)/.6)]">
              <th scope="row" className="text-left font-medium">
                {r.label}
              </th>
              <td className="text-right">
                {prev === null ? (
                  <span className="text-subtle">—</span>
                ) : (
                  <Money value={prev} currency={currency} kind={r.kind} className="[&>span]:font-normal" />
                )}
              </td>
              <td className="text-right">
                {diff === null ? (
                  <span className="text-subtle">—</span>
                ) : (
                  <Money value={diff.toFixed(2)} currency={currency} change={tone} />
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
