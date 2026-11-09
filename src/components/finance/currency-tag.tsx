import type { Currency } from "@prisma/client";
import { cn } from "@/lib/utils";

/** Código da moeda em mono, discreto (contas, moeda original). */
export function CurrencyTag({ currency, className }: { currency: Currency; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded bg-secondary px-1.5 py-px font-mono text-[10.5px] font-semibold tracking-wide text-muted-foreground",
        className,
      )}
    >
      {currency}
    </span>
  );
}
