import * as React from "react";
import type { Currency } from "@prisma/client";
import { ChevronRight, CreditCard } from "lucide-react";
import { TD, TR } from "@/components/ui/table";
import { Money } from "./money";

/**
 * As compras de um cartão no período, numa linha da lista de Transações. Cada compra
 * continua sendo um gasto com a sua categoria (o Resumo soma por categoria); aqui elas só
 * ficam juntas, e a linha abre todas. O valor é a soma das compras no período.
 */
export function CardGroupRow({
  label,
  bank,
  count,
  amount,
  lens,
  between,
  onOpen,
}: {
  /** Nome da conta: "Cartão de crédito". */
  label: string;
  bank: string | null;
  count: number;
  /** Soma das compras na moeda da lente (gasto negativo). */
  amount: string;
  lens: Currency;
  /**
   * Células entre o nome e o valor, iguais às das outras linhas (com as mesmas classes de
   * esconder no celular), para a tabela manter as colunas alinhadas em toda largura.
   */
  between?: React.ReactNode;
  onOpen: () => void;
}) {
  const name = bank ?? label;
  const negative = amount.trim().startsWith("-");
  return (
    <TR
      className="cursor-pointer has-[button[data-row-open]:focus-visible]:bg-muted has-[button[data-row-open]:focus-visible]:outline has-[button[data-row-open]:focus-visible]:outline-2 has-[button[data-row-open]:focus-visible]:-outline-offset-2 has-[button[data-row-open]:focus-visible]:outline-ring"
      onClick={onOpen}
    >
      <TD className="w-full max-w-0">
        <div className="flex min-w-0 items-center gap-2.5">
          <CreditCard aria-hidden className="size-4 shrink-0 text-subtle" />
          <div className="min-w-0">
            <button
              type="button"
              data-row-open
              className="block min-w-0 truncate text-left font-semibold focus-visible:outline-none"
            >
              {name}
              <span className="sr-only">, {label}, ver as compras</span>
            </button>
            <span className="mt-0.5 block text-meta text-subtle">
              {label} · {count} {count === 1 ? "compra" : "compras"} no período
            </span>
          </div>
        </div>
      </TD>
      {between}
      <TD className="text-right">
        <span className="inline-flex items-center gap-1.5">
          <Money value={amount} currency={lens} kind={negative ? "EXPENSE" : "NEUTRAL"} />
          <ChevronRight aria-hidden className="size-4 text-subtle" />
        </span>
      </TD>
    </TR>
  );
}
