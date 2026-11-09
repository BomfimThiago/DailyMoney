import * as React from "react";
import type { Currency } from "@prisma/client";
import { Decimal, formatAmount } from "@/lib/money";
import { tint } from "@/lib/color";
import type { LadderStep } from "@/lib/investments/summary";
import { cn } from "@/lib/utils";
import { StackedBar } from "@/components/ui/bar-chart";
import { Tooltip } from "@/components/ui/tooltip";
import { Money } from "./money";

export interface AllocationItem {
  key: string;
  label: string;
  /** Cor da classe (hex), aplicada pelo matiz médio de `tint()`. */
  color: string;
  total: string;
  /** % inteiro ("64"). */
  share: string;
  /** 0–1, para a largura na barra. */
  fraction: string;
  count: number;
}

/**
 * Alocação da carteira por classe: uma barra empilhada com a fatia de cada classe e, embaixo,
 * a legenda com a porcentagem e o valor de cada uma (maior primeiro).
 */
export function Allocation({ items, currency }: { items: AllocationItem[]; currency: Currency }) {
  return (
    <div className="flex flex-col gap-4">
      <StackedBar
        className="h-3"
        items={items.map((c) => ({ key: c.key, share: c.fraction, color: c.color, label: `${c.label}: ${c.share}%` }))}
      />
      <ul className="divide-y">
        {items.map((c) => (
          <li key={c.key} className="flex min-w-0 items-center gap-3 py-2.5">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: tint(c.color).mark }}
            />
            <span className="min-w-0 flex-1 truncate text-[15px]">{c.label}</span>
            <span className="w-10 shrink-0 text-right text-[13px] tabular-nums text-subtle">{c.share}%</span>
            <Money value={c.total} currency={currency} className="shrink-0 sm:w-32" />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** "R$ 15,2 mil", "R$ 1,2 mi", "R$ 880" (rótulo curto em cima da barra). */
function compact(v: string, currency: Currency) {
  const d = new Decimal(v);
  const symbol = formatAmount("0", currency).replace(/[\s\u00a0]*0,00$/, "");
  const short = (n: Decimal, unit: string) => `${symbol} ${n.toDecimalPlaces(1).toString().replace(".", ",")} ${unit}`;
  if (d.gte(1_000_000)) return short(d.div(1_000_000), "mi");
  if (d.gte(1000)) return short(d.div(1000), "mil");
  return `${symbol} ${d.toFixed(0)}`;
}

/**
 * Escada de vencimentos: quanto da carteira (pelo valor de hoje) volta para a conta em cada
 * ano. Uma barra por ano em tinta, com o valor em cima; ano sem vencimento fica só com o
 * traço da base. Ao passar o mouse (ou tocar), o valor exato e quantos títulos.
 */
export function MaturityLadderChart({
  steps,
  currency,
  minHeight = 150,
  className,
}: {
  steps: LadderStep[];
  currency: Currency;
  /** Altura mínima das barras; com `flex-1` no pai, o gráfico cresce até ocupar o cartão. */
  minHeight?: number;
  className?: string;
}) {
  const max = steps.reduce((m, s) => Decimal.max(m, s.total), new Decimal(0));
  const pct = (v: string) => (max.isZero() ? 0 : new Decimal(v).div(max).times(100).toDecimalPlaces(2).toNumber());
  // Com muitos anos, no celular os rótulos de valor não cabem em cima das barras: ficam no toque.
  const crowded = steps.length > 5;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="relative flex flex-1 items-end gap-2 border-b border-input" style={{ minHeight }}>
        {steps.map((s) => {
          const empty = new Decimal(s.total).isZero();
          const bar = (
            <div className="flex min-w-0 flex-1 cursor-default flex-col items-center justify-end gap-1.5 self-stretch">
              {empty ? null : (
                <span
                  className={cn(
                    "whitespace-nowrap text-[12px] font-medium tabular-nums text-foreground",
                    crowded && "max-sm:hidden",
                  )}
                >
                  {compact(s.total, currency)}
                </span>
              )}
              <span
                className="w-full max-w-14 rounded-t-[4px] bg-foreground"
                // A barra mais alta deixa 24px para o rótulo em cima.
                style={{ height: `calc((100% - 24px) * ${(pct(s.total) / 100).toFixed(4)})` }}
              />
            </div>
          );
          return (
            <Tooltip
              key={s.label}
              content={
                empty ? (
                  `${s.label}: nada vence`
                ) : (
                  <span className="tabular-nums">
                    {s.label}: {formatAmount(s.total, currency)} em {s.count} {s.count === 1 ? "título" : "títulos"}
                  </span>
                )
              }
            >
              {bar}
            </Tooltip>
          );
        })}
      </div>
      <div className="flex gap-2">
        {steps.map((s) => (
          <span key={s.label} className="min-w-0 flex-1 text-center text-[12px] tabular-nums text-subtle">
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
