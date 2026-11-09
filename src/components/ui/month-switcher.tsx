"use client";

import * as React from "react";
import { addMonths, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Navegação de período mês a mês. `value` é qualquer data dentro do mês. `caption` aparece
 * sob o nome (ex.: "27 out – 26 nov", quando o mês financeiro não começa no dia 1).
 */
export function MonthSwitcher({
  value,
  onChange,
  max,
  caption,
  className,
}: {
  value: Date;
  onChange: (next: Date) => void;
  /** Não deixa avançar além deste mês (normalmente hoje). */
  max?: Date;
  /** Linha pequena sob o mês: os dias que ele cobre. */
  caption?: string;
  className?: string;
}) {
  const label = format(value, "MMMM yyyy", { locale: ptBR });
  const atMax = max ? format(value, "yyyy-MM") >= format(max, "yyyy-MM") : false;
  const btn =
    "grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent";
  return (
    <div className={cn("inline-flex h-10 items-center gap-1 rounded-lg bg-field px-1 shadow-control", className)}>
      <button type="button" aria-label="Mês anterior" className={btn} onClick={() => onChange(addMonths(value, -1))}>
        <ChevronLeft className="size-4" />
      </button>
      <span className="flex min-w-[104px] flex-col items-center text-center sm:min-w-[124px]">
        <span className="text-[14px] font-semibold capitalize leading-tight">{label}</span>
        {caption ? <span className="text-[11.5px] leading-tight text-subtle tabular-nums">{caption}</span> : null}
      </span>
      <button
        type="button"
        aria-label="Próximo mês"
        className={btn}
        disabled={atMax}
        onClick={() => onChange(addMonths(value, 1))}
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}
