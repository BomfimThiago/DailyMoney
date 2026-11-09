"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Tabela. `density`: "comfortable" (padrão, 56px por linha) ou "compact" (40px).
 * Linhas aceitam `state` para destacar seleção, revisão pendente ou erro.
 */
type Density = "comfortable" | "compact";
const DensityContext = React.createContext<Density>("comfortable");

export function Table({
  className,
  density = "comfortable",
  ...props
}: React.HTMLAttributes<HTMLTableElement> & { density?: Density }) {
  return (
    <DensityContext.Provider value={density}>
      <div className="relative w-full overflow-auto">
        <table className={cn("w-full caption-bottom border-collapse text-[13.5px]", className)} {...props} />
      </div>
    </DensityContext.Provider>
  );
}

export const THead = ({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <thead className={cn("bg-muted", className)} {...props} />
);

export const TBody = ({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <tbody className={cn(className)} {...props} />
);

export type RowState = "selected" | "review" | "error";

export const TR = ({
  className,
  state,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement> & { state?: RowState }) => (
  <tr
    data-state={state}
    className={cn(
      "border-t transition-colors hover:bg-muted/70",
      state === "selected" && "bg-primary/[.06] shadow-[inset_3px_0_0_hsl(var(--primary))] hover:bg-primary/[.08]",
      state === "review" && "bg-warning/[.05]",
      state === "error" && "bg-destructive/[.04] shadow-[inset_3px_0_0_hsl(var(--destructive))]",
      className,
    )}
    {...props}
  />
);

export type SortDirection = "asc" | "desc";

/**
 * Cabeçalho de coluna. Com `onSort`, vira botão de ordenação: clique alterna
 * asc → desc → sem ordenação (volta ao agrupamento por dia).
 */
export const TH = ({
  className,
  children,
  sort,
  onSort,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & {
  /** Direção atual quando esta coluna é a ordenada; `undefined` = não ordenada. */
  sort?: SortDirection;
  onSort?: (next: SortDirection | undefined) => void;
}) => {
  const right = className?.includes("text-right");
  return (
    <th
      aria-sort={sort === "asc" ? "ascending" : sort === "desc" ? "descending" : undefined}
      className={cn(
        "h-10 px-4 text-left align-middle text-meta font-medium text-subtle first:pl-5 last:pr-5",
        className,
      )}
      {...props}
    >
      {onSort ? (
        <button
          type="button"
          onClick={() => onSort(sort === undefined ? "asc" : sort === "asc" ? "desc" : undefined)}
          className={cn(
            "inline-flex items-center gap-1 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            right && "flex-row-reverse",
            sort && "text-foreground",
          )}
        >
          {children}
          {sort === "asc" ? (
            <ArrowUp aria-hidden className="size-3" />
          ) : sort === "desc" ? (
            <ArrowDown aria-hidden className="size-3" />
          ) : (
            <ChevronsUpDown aria-hidden className="size-3 opacity-60" />
          )}
        </button>
      ) : (
        children
      )}
    </th>
  );
};

export const TD = ({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) => {
  const density = React.useContext(DensityContext);
  return (
    <td
      className={cn(
        "px-4 align-middle first:pl-5 last:pr-5",
        density === "compact" ? "h-10 py-1.5" : "h-14 py-2.5",
        className,
      )}
      {...props}
    />
  );
};

/** Linha de agrupamento (ex.: "Qui, 20 ago · −€ 118,62"). */
export function TGroupRow({
  label,
  aside,
  colSpan,
}: {
  label: React.ReactNode;
  aside?: React.ReactNode;
  colSpan: number;
}) {
  return (
    <tr className="border-t bg-muted">
      <td colSpan={colSpan} className="h-9 px-5">
        <div className="flex items-center justify-between text-meta">
          <span className="font-semibold text-foreground">{label}</span>
          {aside ? <span className="text-subtle">{aside}</span> : null}
        </div>
      </td>
    </tr>
  );
}
