"use client";

import * as React from "react";
import type { Currency } from "@prisma/client";
import { Decimal, formatAmount } from "@/lib/money";
import type { CalendarDay } from "@/lib/transactions/aggregate";
import { dayOfMonth, shortDate, weekdayOf } from "@/lib/period";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];
const WEEKDAY_NAMES = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

// Intensidade em tinta (gasto é tinta no app): do quase branco ao cheio.
const LEVEL: Record<CalendarDay["level"], string> = {
  0: "bg-transparent text-subtle",
  1: "bg-foreground/[0.05] text-foreground",
  2: "bg-foreground/[0.12] text-foreground",
  3: "bg-foreground/[0.24] text-foreground",
  4: "bg-foreground/[0.42] text-foreground",
};

/** "1,2 mil", "86" — o valor curto dentro do quadrado (o exato fica no rótulo e na lista do dia). */
function short(v: string) {
  const d = new Decimal(v);
  if (d.gte(1000)) return `${d.div(1000).toDecimalPlaces(1).toString().replace(".", ",")} mil`;
  return d.toFixed(0);
}

/**
 * Calendário de gastos do mês: um quadrado por dia (do primeiro ao último dia do mês
 * financeiro, que pode atravessar dois meses do calendário: o dia 1 do seguinte leva o mês), mais escuro quanto mais saiu (pelo
 * quartil entre os dias com gasto, para um dia de aluguel não apagar o resto). Tocar num dia o escolhe (de novo,
 * solta); a tela mostra as compras dele. Dias que ainda não chegaram ficam vazios. No
 * celular, só a cor; o valor aparece ao escolher o dia.
 */
export function SpendingCalendar({
  days,
  today,
  currency,
  selected,
  onSelect,
  className,
}: {
  days: CalendarDay[];
  /** Posição de hoje (`day`), se o mês mostrado é o corrente. */
  today?: number;
  currency: Currency;
  selected: number | null;
  onSelect: (day: number | null) => void;
  className?: string;
}) {
  const firstWeekday = days.length ? weekdayOf(days[0].date) : 0;
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="grid grid-cols-7 gap-1.5" role="group" aria-label="Gasto por dia">
        {WEEKDAYS.map((w, i) => (
          <span key={i} aria-hidden className="pb-1 text-center text-[12px] text-subtle">
            {w}
          </span>
        ))}
        {Array.from({ length: firstWeekday }, (_, i) => (
          <span key={`pad-${i}`} aria-hidden />
        ))}
        {days.map((d) => {
          const spent = !new Decimal(d.total).isZero();
          const weekday = WEEKDAY_NAMES[weekdayOf(d.date)];
          const dom = dayOfMonth(d.date);
          // O mês do calendário vira no meio do período: o dia 1 diz de qual mês é.
          const label = dom === 1 && d.day > 1 ? shortDate(d.date) : String(dom);
          return (
            <button
              key={d.day}
              type="button"
              disabled={d.future}
              aria-pressed={selected === d.day}
              aria-label={`${shortDate(d.date)}, ${weekday}: ${
                d.future ? "ainda não chegou" : spent ? formatAmount(d.total, currency) : "sem gastos"
              }`}
              onClick={() => onSelect(selected === d.day ? null : d.day)}
              className={cn(
                "flex aspect-square min-w-0 flex-col items-start justify-between rounded-[10px] p-1.5 text-left transition-colors sm:aspect-auto sm:h-14",
                LEVEL[d.level],
                d.future && "cursor-default opacity-40",
                !d.future && "hover:ring-1 hover:ring-input",
                selected === d.day && "ring-2 ring-primary ring-offset-1 ring-offset-card hover:ring-primary",
              )}
            >
              <span
                className={cn(
                  "whitespace-nowrap text-[12px] leading-none tabular-nums",
                  today === d.day && "font-semibold underline underline-offset-2",
                )}
              >
                {label}
              </span>
              {spent && !d.future ? (
                <span className="w-full truncate text-[11.5px] font-medium leading-none tabular-nums max-sm:hidden">
                  {short(d.total)}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-1.5 text-meta text-subtle" aria-hidden>
        <span>menos</span>
        {([1, 2, 3, 4] as const).map((l) => (
          <span key={l} className={cn("size-3 rounded-[3px]", LEVEL[l])} />
        ))}
        <span>mais</span>
      </div>
    </div>
  );
}
