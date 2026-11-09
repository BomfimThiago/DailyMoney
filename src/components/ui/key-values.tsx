import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Lista rótulo → valor em linhas de 40px (rótulo à esquerda, número à direita, tabular).
 * Para números de apoio dentro de um cartão ("nos últimos 12 meses").
 */
export function KeyValues({
  title,
  items,
  className,
}: {
  /** Cabeçalho cinza, alinhado com o cabeçalho de uma tabela vizinha. */
  title?: React.ReactNode;
  items: { key: string; label: React.ReactNode; value: React.ReactNode }[];
  className?: string;
}) {
  return (
    <div className={cn("text-[15px]", className)}>
      {title ? <div className="flex h-9 items-center text-[13px] text-subtle">{title}</div> : null}
      <dl>
        {items.map((it) => (
          <div
            key={it.key}
            className="flex h-9 items-center justify-between gap-4 border-t border-[hsl(var(--border)/.6)]"
          >
            <dt className="text-muted-foreground">{it.label}</dt>
            <dd className="text-right font-semibold tabular-nums">{it.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
