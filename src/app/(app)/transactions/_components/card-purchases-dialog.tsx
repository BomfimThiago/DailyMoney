"use client";

import * as React from "react";
import { format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Decimal } from "@/lib/money";
import { useTransactionList, type CardGroup, type Currency, type Transaction, type TransactionFilters } from "@/hooks";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { TransactionListItem } from "@/components/finance/transaction-list-item";
import { Money } from "@/components/finance/money";
import { ErrorState } from "@/components/states";
import { LoadMore } from "./load-more";
import { amountIn, totalKind } from "./shared";

/** "2026-12" → "Fatura de dezembro de 2026". */
function billLabel(month: string | null): string {
  if (!month) return "Sem fatura informada";
  const d = parse(month, "yyyy-MM", new Date());
  return `Fatura de ${format(d, "MMMM 'de' yyyy", { locale: ptBR })}`;
}

/**
 * As compras de um cartão no período, separadas pela fatura em que caem. Cada uma abre o
 * detalhe (categoria, responsável…), como qualquer transação.
 */
export function CardPurchasesDialog({
  card,
  filters,
  lens,
  open,
  onOpenChange,
  onOpenTx,
}: {
  card: CardGroup | null;
  /** Período e filtros da lista; aqui só se somam banco, conta e "só cartão". */
  filters: TransactionFilters;
  lens: Currency;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenTx: (tx: Transaction) => void;
}) {
  const query: TransactionFilters = {
    ...filters,
    bank: card?.bank ?? undefined,
    account: card?.account ?? undefined,
    card: "only",
  };
  const list = useTransactionList(query, null, lens, { enabled: open && card !== null });
  const pages = list.data?.pages ?? [];
  const items = pages.flatMap((p) => p.transactions);
  const total = pages[0]?.total ?? 0;

  const bills = React.useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const t of items) map.set(t.cardBill ?? "", [...(map.get(t.cardBill ?? "") ?? []), t]);
    return [...map.entries()]
      .sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : b.localeCompare(a)))
      .map(([bill, txs]) => ({
        bill,
        txs,
        sum: txs.filter((t) => !t.isInternalTransfer).reduce((s, t) => s.plus(amountIn(t, lens)), new Decimal(0)),
      }));
  }, [items, lens]);

  const name = card ? `${card.account ?? "Cartão"}${card.bank ? ` ${card.bank}` : ""}` : "Cartão";
  const field = lens === "BRL" ? "amountBRL" : lens === "USD" ? "amountUSD" : "amountEUR";
  const sum = new Decimal(card?._sum[field] ?? "0");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>{name}</DialogTitle>
          <DialogDescription>
            {card ? (
              <>
                {card.count} {card.count === 1 ? "compra" : "compras"} no período, somando{" "}
                <Money value={sum} currency={lens} kind={totalKind(sum)} size="sm" />. Cada uma conta na sua categoria.
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 pb-4">
          {list.isLoading ? (
            <div className="space-y-3 px-6" aria-busy aria-label="Carregando compras">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : list.isError && !items.length ? (
            <div className="px-6">
              <ErrorState error={list.error} title="Não deu para carregar as compras" onRetry={() => list.refetch()} />
            </div>
          ) : (
            <>
              {bills.map(({ bill, txs, sum: billSum }) => (
                <section key={bill || "none"} aria-label={billLabel(bill || null)}>
                  <div className="flex items-center justify-between border-t bg-muted px-6 py-2 text-meta">
                    <span className="font-semibold text-foreground">{billLabel(bill || null)}</span>
                    <Money value={billSum} currency={lens} kind={totalKind(billSum)} size="sm" />
                  </div>
                  <div className="divide-y">
                    {txs.map((t) => (
                      <TransactionListItem key={t.id} tx={t} lens={lens} onClick={() => onOpenTx(t)} />
                    ))}
                  </div>
                </section>
              ))}
              <div className="px-6 pt-3">
                <LoadMore
                  shown={items.length}
                  total={total}
                  hasMore={Boolean(list.hasNextPage)}
                  loading={list.isFetchingNextPage}
                  error={list.isError ? list.error : null}
                  onLoadMore={() => list.fetchNextPage()}
                />
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
