import * as React from "react";
import { Decimal } from "@/lib/money";
import { tint } from "@/lib/color";
import { cn } from "@/lib/utils";
import { Tooltip } from "./tooltip";

export interface BarPair {
  label: string;
  /** Valores positivos em string decimal. */
  a: string;
  b: string;
  /** Texto do tooltip da coluna. */
  hint?: React.ReactNode;
}

/**
 * Barras em pares (ex.: entradas × gastos por mês). A altura é proporção visual
 * (Decimal → %), não cálculo de dinheiro. A última coluna fica em destaque.
 */
export function BarPairChart({
  data,
  legend,
  height = 200,
  highlightLast = true,
  formatTick,
  className,
}: {
  data: BarPair[];
  legend: { a: string; b: string };
  height?: number;
  highlightLast?: boolean;
  /** Formata o valor máximo do eixo (ex.: "€ 8 mil"). */
  formatTick?: (max: string) => string;
  className?: string;
}) {
  const max = data.reduce((m, d) => Decimal.max(m, new Decimal(d.a || 0), new Decimal(d.b || 0)), new Decimal(0));
  const pct = (v: string) => (max.isZero() ? 0 : new Decimal(v || 0).div(max).times(100).toDecimalPlaces(2).toNumber());
  const ticks = [1, 0.5, 0];

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-center gap-4 text-meta text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-success" />
          {legend.a}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-foreground" />
          {legend.b}
        </span>
      </div>
      <div className="relative mt-3" style={{ height }}>
        {ticks.map((t) => (
          <div key={t} className="absolute inset-x-0 flex items-center gap-2" style={{ bottom: `${t * 100}%` }}>
            <span className="w-12 shrink-0 -translate-y-1/2 text-right text-[11px] tabular-nums text-subtle">
              {t === 0 ? "0" : formatTick ? formatTick(max.times(t).toFixed(0)) : max.times(t).toFixed(0)}
            </span>
            <span className={cn("h-px flex-1", t === 0 ? "bg-input" : "bg-border")} />
          </div>
        ))}
        <div className="absolute inset-y-0 left-14 right-0 flex items-end justify-around">
          {data.map((d, i) => {
            const last = highlightLast && i === data.length - 1;
            const bars = (
              <div className="flex h-full items-end gap-[3px] px-1">
                <span
                  className={cn("w-2.5 rounded-t-[3px] sm:w-3", last ? "bg-success" : "bg-success/30")}
                  style={{ height: `${pct(d.a)}%` }}
                />
                <span
                  className={cn("w-2.5 rounded-t-[3px] sm:w-3", last ? "bg-foreground" : "bg-foreground/20")}
                  style={{ height: `${pct(d.b)}%` }}
                />
              </div>
            );
            return d.hint ? (
              <Tooltip key={d.label} content={d.hint}>
                <div className="h-full cursor-default">{bars}</div>
              </Tooltip>
            ) : (
              <div key={d.label} className="h-full">
                {bars}
              </div>
            );
          })}
        </div>
      </div>
      <div className="ml-14 flex justify-around">
        {data.map((d, i) => (
          <span
            key={d.label}
            className={cn(
              "w-8 text-center text-[11.5px] capitalize",
              highlightLast && i === data.length - 1 ? "font-semibold text-foreground" : "text-subtle",
            )}
          >
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Barra horizontal empilhada de participações (ex.: gastos por responsável), no tom médio do matiz de cada um. */
export function StackedBar({
  items,
  className,
}: {
  items: { key: string; share: string; color?: string; label: string }[];
  className?: string;
}) {
  return (
    <div className={cn("flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-secondary", className)}>
      {items.map((it) => (
        <Tooltip key={it.key} content={it.label}>
          <span
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{
              width: `${new Decimal(it.share).times(100).toDecimalPlaces(2).toNumber()}%`,
              backgroundColor: it.color ? tint(it.color).mark : "hsl(var(--subtle))",
            }}
          />
        </Tooltip>
      ))}
    </div>
  );
}
