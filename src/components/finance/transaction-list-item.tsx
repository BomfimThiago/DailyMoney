import * as React from "react";
import type { Currency } from "@prisma/client";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CreditCard } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CategoryTag } from "./category";
import { MemberAvatar } from "./member";
import { Money } from "./money";

export interface ListTx {
  id: string;
  date: string;
  description: string;
  type: "EXPENSE" | "INCOME" | "TRANSFER";
  state: "COMPLETED" | "PENDING";
  isInternalTransfer: boolean;
  baseCurrency: Currency;
  baseAmount: string;
  /** Compra no cartão de crédito. */
  isCard?: boolean;
  /** Parcela no cartão ("3/10"). */
  installment?: string | null;
  amountBRL: string;
  amountUSD: string;
  amountEUR: string;
  bank: string | null;
  category: { name: string; color: string; icon: string | null } | null;
  member: { name: string; color: string } | null;
}

// Sem cor: os componentes pintam com o neutro de tint() (o mesmo cinza em todo o app).
const TRANSFER = { name: "Transferência", color: "", icon: "transfer" };
const NONE = { name: "Sem categoria", color: "", icon: null };

/** Linha de transação para listas (Resumo, celular): nome, data · categoria · conta, responsável, valor. */
export function TransactionListItem({
  tx,
  lens,
  onClick,
  className,
}: {
  tx: ListTx;
  lens: Currency;
  onClick?: () => void;
  className?: string;
}) {
  const amount = lens === "BRL" ? tx.amountBRL : lens === "USD" ? tx.amountUSD : tx.amountEUR;
  const cat = tx.isInternalTransfer ? TRANSFER : (tx.category ?? NONE);
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      className={cn(
        "flex min-h-[64px] w-full items-center gap-3 px-6 py-3 text-left",
        onClick && "transition-colors hover:bg-muted",
        className,
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-[15px] font-medium">
          <span className="truncate">{tx.description}</span>
          {tx.state === "PENDING" ? <Badge variant="warning">pendente</Badge> : null}
          {tx.isInternalTransfer ? <Badge variant="info">interna</Badge> : null}
        </span>
        <span className="mt-1 flex min-w-0 items-center gap-1.5 text-meta text-subtle">
          {/* a data é o dia do lançamento (meia-noite UTC): ler só "AAAA-MM-DD", sem fuso */}
          <span className="flex-none">{format(parseISO(tx.date.slice(0, 10)), "d MMM", { locale: ptBR })}</span>
          <CategoryTag category={cat} size="sm" />
          {tx.isCard ? (
            <span className="inline-flex flex-none items-center gap-1" title="Compra no cartão de crédito">
              <CreditCard aria-hidden className="size-3.5" />
              <span className={tx.installment ? undefined : "sr-only"}>
                {tx.installment ? `parcela ${tx.installment}` : "cartão"}
              </span>
            </span>
          ) : null}
          {tx.bank ? (
            <span className="min-w-0 truncate">
              {tx.bank} {tx.baseCurrency}
            </span>
          ) : null}
        </span>
      </span>
      {tx.member ? <MemberAvatar member={tx.member} size="xs" /> : null}
      <Money
        value={amount}
        currency={lens}
        kind={tx.isInternalTransfer ? "TRANSFER" : tx.type}
        original={{ value: tx.baseAmount, currency: tx.baseCurrency }}
        className="w-28"
      />
    </Comp>
  );
}
