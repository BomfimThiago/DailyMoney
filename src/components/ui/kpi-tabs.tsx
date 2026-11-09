"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface KpiTab<T extends string> {
  value: T;
  label: string;
  /** O número (normalmente <Money size="display|figure" …/>). */
  figure: React.ReactNode;
  /** Linha cinza sob o número (variação, outras moedas). */
  note?: React.ReactNode;
  /** O número que responde a tela: coluna mais larga; no celular ocupa a linha inteira. */
  lead?: boolean;
}

/**
 * KPIs que são as abas do gráfico abaixo deles (estilo pastel, "KPIs as the chart's tabs").
 * A aba escolhida leva um traço de 2px e rótulo em tinta; as outras mantêm o número em tinta
 * (cinza pareceria desabilitado). No celular vira grade 2 colunas com a escolhida preenchida.
 */
export function KpiTabs<T extends string>({
  tabs,
  value,
  onValueChange,
  className,
  "aria-label": ariaLabel,
}: {
  tabs: KpiTab<T>[];
  value: T;
  onValueChange: (v: T) => void;
  className?: string;
  "aria-label"?: string;
}) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (i + step + tabs.length) % tabs.length;
    onValueChange(tabs[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div role="tablist" aria-label={ariaLabel} className={cn("grid grid-cols-2 gap-2 lg:flex lg:gap-0", className)}>
      {tabs.map((t, i) => {
        const on = t.value === value;
        return (
          <button
            key={t.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onValueChange(t.value)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              "flex min-w-0 flex-col items-start gap-1 rounded-lg px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "lg:rounded-none lg:border-b-2 lg:px-0 lg:pb-4 lg:pt-0 lg:pr-6",
              t.lead ? "col-span-2 lg:flex-[1.5]" : "lg:flex-1",
              i > 0 && "lg:pl-6",
              on
                ? "bg-secondary lg:border-foreground lg:bg-transparent"
                : "hover:bg-muted lg:border-border lg:hover:bg-transparent lg:hover:border-input",
            )}
          >
            <span className={cn("text-[14px] font-medium", on ? "text-foreground" : "text-muted-foreground")}>
              {t.label}
            </span>
            <span className={cn("max-w-full", !on && "[&_*]:font-medium")}>{t.figure}</span>
            {t.note ? <span className="text-meta text-subtle">{t.note}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
