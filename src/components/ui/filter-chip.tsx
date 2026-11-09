import * as React from "react";
import { ChevronDown, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Filtro em forma de chip. Sem `value`: com "+" (adicionar filtro).
 * Com `value`: branco com sombra, mostra o valor e permite limpar.
 * Use como gatilho de <Popover>/<Combobox> via `asChild` do pai.
 */
export const FilterChip = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; value?: string; onClear?: () => void }
>(({ label, value, onClear, className, ...props }, ref) => {
  const active = Boolean(value);
  return (
    <span className="relative inline-flex">
      <button
        ref={ref}
        type="button"
        className={cn(
          "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[13px] text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          active ? "bg-field pr-8 shadow-control" : "border border-input bg-field hover:bg-secondary",
          className,
        )}
        {...props}
      >
        {!active ? <Plus className="size-3.5 text-subtle" /> : null}
        {label}
        {active ? (
          <>
            <b className="font-semibold text-foreground">{value}</b>
            {!onClear ? <ChevronDown className="size-3.5 text-subtle" /> : null}
          </>
        ) : null}
      </button>
      {active && onClear ? (
        <button
          type="button"
          aria-label={`Limpar filtro ${label}`}
          onClick={onClear}
          className="absolute right-1 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded text-subtle hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </span>
  );
});
FilterChip.displayName = "FilterChip";
