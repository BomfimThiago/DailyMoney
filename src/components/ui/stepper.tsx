import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/** Passos de um fluxo linear (Upload → Leitura → Revisão → Confirmado). No celular quebra linha
 * em vez de rolar de lado (rolagem sem foco não é alcançável pelo teclado). */
export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-2 sm:gap-3">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className="flex items-center gap-2 sm:gap-3">
            {i > 0 ? <span aria-hidden className="h-0.5 w-4 rounded bg-input sm:w-10" /> : null}
            <span className="flex items-center gap-2" aria-current={active ? "step" : undefined}>
              <span
                className={cn(
                  "grid size-[22px] place-items-center rounded-full text-[11.5px] font-semibold",
                  done && "bg-primary text-primary-foreground",
                  active && "bg-field text-primary ring-2 ring-primary",
                  !done && !active && "bg-secondary text-subtle",
                )}
              >
                {done ? <Check aria-hidden className="size-3 !stroke-[3]" /> : i + 1}
              </span>
              <span
                className={cn(
                  "text-[13px]",
                  active
                    ? "font-semibold text-foreground"
                    : done
                      ? "font-medium text-foreground"
                      : "font-medium text-subtle",
                )}
              >
                {label}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
