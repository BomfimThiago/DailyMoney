"use client";

import * as React from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Check } from "lucide-react";
import { monthRange, type Category, type TransactionFilters } from "@/hooks";
import { cn } from "@/lib/utils";
import { periodCaption } from "@/lib/period";
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/filter-chip";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { MonthSwitcher } from "@/components/ui/month-switcher";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { CategoryPicker } from "@/components/finance/category-picker";

// --- Período -----------------------------------------------------------------

export type Period = { kind: "month"; month: Date } | { kind: "all" } | { kind: "range"; from: string; to: string };

/** Filtro de datas do período; o mês é o financeiro (`startDay`: dia em que ele começa). */
export function periodFilters(p: Period, startDay: number): Pick<TransactionFilters, "from" | "to"> {
  if (p.kind === "month") return monthRange(p.month, startDay);
  if (p.kind === "all") return {};
  return { from: p.from || undefined, to: p.to ? `${p.to}T23:59:59` : undefined };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const dm = (d: string) => format(parseISO(d), "dd/MM/yyyy");

/** Valor curto do chip ("Nov 2026", "Todo o período", "01/10/2026 – 15/10/2026"). */
export function periodLabel(p: Period): string {
  if (p.kind === "month") return cap(format(p.month, "MMM yyyy", { locale: ptBR }));
  if (p.kind === "all") return "Todo o período";
  if (p.from && p.to) return `${dm(p.from)} – ${dm(p.to)}`;
  if (p.from) return `Desde ${dm(p.from)}`;
  if (p.to) return `Até ${dm(p.to)}`;
  return "Todo o período";
}

/** Texto da descrição ("em novembro", "em novembro de 2026 (27 out – 26 nov)", "no período"). */
export function periodPhrase(p: Period, startDay?: number): string {
  if (p.kind === "month") {
    const span = periodCaption(format(p.month, "yyyy-MM"), startDay);
    return `em ${format(p.month, "MMMM 'de' yyyy", { locale: ptBR })}${span ? ` (${span})` : ""}`;
  }
  if (p.kind === "all") return "em todo o período";
  return `de ${periodLabel(p).toLowerCase()}`;
}

/** `current`: o mês (financeiro) de hoje; `startDay`: o dia em que o mês começa. */
export function PeriodFilter({
  value,
  onChange,
  current,
  startDay,
}: {
  value: Period;
  onChange: (p: Period) => void;
  current: Date;
  startDay?: number;
}) {
  const [open, setOpen] = React.useState(false);
  const [from, setFrom] = React.useState(value.kind === "range" ? value.from : "");
  const [to, setTo] = React.useState(value.kind === "range" ? value.to : "");
  const rangeInvalid = Boolean(from && to && from > to);

  const pick = (p: Period) => {
    onChange(p);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <FilterChip label="Período" value={periodLabel(value)} />
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-4 p-4">
        <div className="space-y-2">
          <p className="text-meta font-medium text-subtle">Mês</p>
          <MonthSwitcher
            value={value.kind === "month" ? value.month : current}
            onChange={(month) => onChange({ kind: "month", month })}
            max={current}
            caption={periodCaption(format(value.kind === "month" ? value.month : current, "yyyy-MM"), startDay)}
            className="w-full justify-between"
          />
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => pick({ kind: "month", month: current })}>
              Este mês
            </Button>
            <Button variant="secondary" size="sm" onClick={() => pick({ kind: "all" })}>
              Todo o período
            </Button>
          </div>
        </div>
        <form
          className="space-y-3 border-t pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (rangeInvalid || (!from && !to)) return;
            pick({ kind: "range", from, to });
          }}
        >
          <p className="text-meta font-medium text-subtle">Intervalo</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="De" htmlFor="period-from">
              <Input id="period-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="Até" htmlFor="period-to" error={rangeInvalid ? "Antes do início" : undefined}>
              <Input
                id="period-to"
                type="date"
                value={to}
                invalid={rangeInvalid}
                onChange={(e) => setTo(e.target.value)}
              />
            </Field>
          </div>
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={rangeInvalid || (!from && !to)}>
              Aplicar intervalo
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

// --- Lista de opções genérica (tipo, moeda, responsável, conta) ---------------

export interface FilterOption {
  value: string;
  label: string;
  leading?: React.ReactNode;
}

/** Estado de carregamento/erro das listas que vêm da API dentro do popover. */
interface AsyncList {
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
}

function renderListStatus({
  loading,
  error,
  onRetry,
  empty,
  emptyText,
}: AsyncList & { empty: boolean; emptyText: string }) {
  if (loading) {
    return (
      <div className="space-y-1.5 p-2" aria-busy>
        <Skeleton className="h-7 w-full" />
        <Skeleton className="h-7 w-4/5" />
        <Skeleton className="h-7 w-3/5" />
      </div>
    );
  }
  if (error) {
    return (
      <div role="alert" className="space-y-2 px-3 py-3 text-meta text-destructive">
        <p>{error instanceof Error ? error.message : "Não deu para carregar"}</p>
        {onRetry ? (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Tentar novamente
          </Button>
        ) : null}
      </div>
    );
  }
  if (empty) return <p className="px-3 py-4 text-center text-meta text-subtle">{emptyText}</p>;
  return null;
}

export function FilterMenu({
  label,
  options,
  selected,
  onSelect,
  onClear,
  emptyText = "Nenhuma opção",
  ...status
}: {
  label: string;
  options: FilterOption[];
  selected: string | undefined;
  onSelect: (value: string) => void;
  onClear: () => void;
  emptyText?: string;
} & AsyncList) {
  const [open, setOpen] = React.useState(false);
  const current = options.find((o) => o.value === selected);
  const statusNode = renderListStatus({ ...status, empty: options.length === 0, emptyText });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <FilterChip label={label} value={current?.label ?? (selected ? "…" : undefined)} onClear={onClear} />
      </PopoverTrigger>
      <PopoverContent className="w-60">
        {statusNode ?? (
          <ul role="listbox" aria-label={label} className="max-h-72 overflow-y-auto">
            {options.map((o) => {
              const active = o.value === selected;
              return (
                <li key={o.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      onSelect(o.value);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13.5px] outline-none hover:bg-secondary focus-visible:bg-secondary",
                      active && "font-semibold",
                    )}
                  >
                    {o.leading}
                    <span className="flex-1 truncate">{o.label}</span>
                    {active ? <Check className="size-4 text-primary" /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

// --- Categoria (sempre via CategoryPicker) ------------------------------------

export function CategoryFilter({
  categories,
  selected,
  onSelect,
  onClear,
  ...status
}: {
  categories: Category[];
  selected: string | undefined;
  onSelect: (id: string) => void;
  onClear: () => void;
} & AsyncList) {
  const [open, setOpen] = React.useState(false);
  const current = categories.find((c) => c.id === selected);
  const statusNode = renderListStatus({ ...status, empty: categories.length === 0, emptyText: "Nenhuma categoria" });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <FilterChip label="Categoria" value={current?.name ?? (selected ? "…" : undefined)} onClear={onClear} />
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3">
        {statusNode ?? (
          <Field label="Mostrar só a categoria">
            <CategoryPicker
              categories={categories}
              value={selected ?? null}
              onChange={(id) => {
                onSelect(id);
                setOpen(false);
              }}
            />
          </Field>
        )}
      </PopoverContent>
    </Popover>
  );
}
