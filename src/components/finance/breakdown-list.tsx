"use client";

import * as React from "react";
import type { Currency } from "@prisma/client";
import { Decimal } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Money } from "./money";

export interface BreakdownItem {
  key: string;
  label: string;
  /** Cor do banco (categoria/responsável) para a barra. */
  color?: string;
  /** Total positivo (string decimal). */
  total: string;
  /** Participação 0–1 (string decimal). */
  share: string;
  count: number;
  leading?: React.ReactNode;
  /** Substitui o nome em texto (ex.: <CategoryTag>, o ladrilho pálido da categoria). */
  labelNode?: React.ReactNode;
  /** Texto discreto após o nome (ex.: moeda da conta). */
  suffix?: React.ReactNode;
}

function Percent({ share }: { share: string }) {
  return (
    <span className="w-14 shrink-0 text-right text-[13px] tabular-nums text-subtle">
      {new Decimal(share).times(100).toDecimalPlaces(1).toString().replace(".", ",")}%
    </span>
  );
}

/** Barra fina de participação: a maior em tinta, as outras cinza (cor fica no ladrilho, não na barra). */
function Bar({ share, top }: { share: string; top: boolean }) {
  return (
    <div className="h-[3px] w-full overflow-hidden rounded-full">
      <div
        className={cn("h-full rounded-full", top ? "bg-foreground" : "bg-input")}
        style={{ width: `${new Decimal(share).times(100).toDecimalPlaces(2).toNumber()}%` }}
      />
    </div>
  );
}

/**
 * Lista de participação (gastos por categoria / responsável / conta).
 * Com `renderDetail`, cada linha vira accordion e abre o detalhe ali mesmo
 * (decisão: categorias do Resumo abrem as transações da categoria).
 */
export function BreakdownList({
  items,
  currency,
  renderDetail,
  showBars = true,
  limit,
  className,
}: {
  /** Mostra só os N maiores e um botão "Mostrar todas". */
  limit?: number;
  items: BreakdownItem[];
  currency: Currency;
  renderDetail?: (item: BreakdownItem) => React.ReactNode;
  showBars?: boolean;
  className?: string;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const hidden = limit && !expanded ? Math.max(0, items.length - limit) : 0;
  const visible = hidden ? items.slice(0, limit) : items;
  const more =
    limit && items.length > limit ? (
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mt-2 text-[14px] font-medium text-foreground hover:underline"
      >
        {expanded ? "Mostrar menos" : `Mostrar todas (${items.length})`}
      </button>
    ) : null;

  const head = (it: BreakdownItem, i: number) => (
    <span className="flex min-w-0 flex-1 flex-col gap-2">
      <span className="flex items-center gap-3">
        {it.leading}
        <span className="min-w-0 flex-1 truncate text-[15px] font-medium">
          {it.labelNode ?? it.label}
          {it.suffix ? <span className="ml-1.5 font-normal text-subtle">{it.suffix}</span> : null}
        </span>
        <Money value={it.total} currency={currency} size="md" />
        <Percent share={it.share} />
      </span>
      {showBars ? <Bar share={it.share} top={i === 0} /> : null}
    </span>
  );

  if (!renderDetail) {
    return (
      <div className={className}>
        <ul className="flex flex-col gap-4">
          {visible.map((it, i) => (
            <li key={it.key}>{head(it, i)}</li>
          ))}
        </ul>
        {more}
      </div>
    );
  }
  return (
    <div className={className}>
      <Accordion type="single" collapsible className="border-y-0">
        {visible.map((it, i) => (
          <AccordionItem key={it.key} value={it.key} className="border-b-0">
            <AccordionTrigger className="py-3 font-normal">{head(it, i)}</AccordionTrigger>
            <AccordionContent className="pb-3 pt-1">{renderDetail(it)}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
      {more}
    </div>
  );
}
