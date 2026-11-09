"use client";

import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cn } from "@/lib/utils";

const TONE = {
  primary: "bg-primary",
  info: "bg-transfer",
  warning: "bg-warning",
  danger: "bg-destructive",
} as const;

/** Barra fina de progresso. `value` 0–100; sem `value` = indeterminado. */
export function Progress({
  value,
  tone = "primary",
  className,
  label,
}: {
  value?: number;
  tone?: keyof typeof TONE;
  className?: string;
  label?: string;
}) {
  return (
    <ProgressPrimitive.Root
      value={value ?? null}
      aria-label={label}
      className={cn("relative h-1 w-full overflow-hidden rounded-full bg-secondary", className)}
    >
      {/* Anima `transform` (GPU), não `width`. Indeterminado: um bloco que atravessa o trilho. */}
      <ProgressPrimitive.Indicator
        className={cn(
          "h-full rounded-full",
          TONE[tone],
          value === undefined
            ? "w-1/3 animate-progress-indeterminate"
            : "w-full transition-transform duration-300 ease-out-strong",
        )}
        style={
          value !== undefined ? { transform: `translateX(-${100 - Math.max(0, Math.min(100, value))}%)` } : undefined
        }
      />
    </ProgressPrimitive.Root>
  );
}
