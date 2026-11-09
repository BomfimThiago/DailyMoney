"use client";

import * as React from "react";
import { CreditCard } from "lucide-react";
import { Decimal } from "@/lib/money";
import type { CardGroup, Currency, Transaction } from "@/hooks";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TBody, TD, TGroupRow, TH, THead, TR, type SortDirection } from "@/components/ui/table";
import { CardGroupRow } from "@/components/finance/card-group-row";
import { CategoryPill, CategoryTag } from "@/components/finance/category";
import { CurrencyTag } from "@/components/finance/currency-tag";
import { MemberChip } from "@/components/finance/member";
import { Money } from "@/components/finance/money";
import { amountIn, dayKey, dayLabel, moneyKind, shortDate, totalKind } from "./shared";

type SortKey = "description" | "value";
export type TableSort = { key: SortKey; dir: SortDirection } | null;

const COLS = 4;
const AMOUNT_FIELD = { BRL: "amountBRL", USD: "amountUSD", EUR: "amountEUR" } as const;

/**
 * Tabela de transações. Padrão: agrupada por dia (total do dia no cabeçalho).
 * Clicar em Descrição/Valor ordena e vira lista plana; o 3º clique volta aos dias.
 * A ordem vem do servidor (a lista é paginada: ordenar só o que foi carregado mentiria);
 * `dayTotals`, também do servidor, é o total do dia inteiro, mesmo com o dia cortado
 * entre duas páginas. `cards` (lista por dia): as compras de cada cartão no período, numa
 * linha que abre todas, antes dos dias.
 */
export function TransactionsTable({
  transactions,
  dayTotals,
  lens,
  sort,
  onSortChange,
  selectedId,
  onOpen,
  cards = [],
  onOpenCard,
}: {
  transactions: Transaction[];
  dayTotals?: Map<string, Decimal>;
  cards?: CardGroup[];
  onOpenCard?: (card: CardGroup) => void;
  lens: Currency;
  sort: TableSort;
  onSortChange: (sort: TableSort) => void;
  selectedId: string | null;
  onOpen: (tx: Transaction) => void;
}) {
  const on = (key: SortKey) => (next: SortDirection | undefined) => onSortChange(next ? { key, dir: next } : null);
  const dirOf = (key: SortKey) => (sort?.key === key ? sort.dir : undefined);

  const days = React.useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const t of transactions) {
      const d = dayKey(t.date);
      map.set(d, [...(map.get(d) ?? []), t]);
    }
    return [...map.entries()].map(([day, items]) => {
      // Total do dia: gastos + entradas (transferências ficam fora dos totais).
      const counted = items.filter((t) => !t.isInternalTransfer && t.type !== "TRANSFER");
      const total = dayTotals?.get(day) ?? counted.reduce((s, t) => s.plus(amountIn(t, lens)), new Decimal(0));
      return { day, items, total, hasTotal: counted.length > 0 || Boolean(dayTotals?.has(day)) };
    });
  }, [transactions, lens, dayTotals]);

  const row = (t: Transaction, flat: boolean) => (
    <TxRow key={t.id} tx={t} lens={lens} showDate={flat} selected={t.id === selectedId} onOpen={() => onOpen(t)} />
  );

  return (
    <Card className="overflow-hidden">
      <Table>
        <THead>
          <TR className="hover:bg-transparent">
            <TH sort={dirOf("description")} onSort={on("description")}>
              Descrição
            </TH>
            <TH className="hidden md:table-cell">Categoria</TH>
            <TH className="hidden lg:table-cell">Responsável</TH>
            <TH className="text-right" sort={dirOf("value")} onSort={on("value")}>
              Valor
            </TH>
          </TR>
        </THead>
        <TBody>
          {!sort && cards.length ? (
            <>
              <TGroupRow colSpan={COLS} label={cards.length === 1 ? "Cartão de crédito" : "Cartões de crédito"} />
              {cards.map((c) => (
                <CardGroupRow
                  key={`${c.bank}|${c.account}`}
                  label={c.account ?? "Cartão"}
                  bank={c.bank}
                  count={c.count}
                  amount={c._sum[AMOUNT_FIELD[lens]] ?? "0"}
                  lens={lens}
                  between={
                    <>
                      <TD className="hidden md:table-cell" />
                      <TD className="hidden lg:table-cell" />
                    </>
                  }
                  onOpen={() => onOpenCard?.(c)}
                />
              ))}
            </>
          ) : null}
          {sort
            ? transactions.map((t) => row(t, true))
            : days.map(({ day, items, total, hasTotal }) => (
                <React.Fragment key={day}>
                  <TGroupRow
                    colSpan={COLS}
                    label={dayLabel(day)}
                    aside={hasTotal ? <Money value={total} currency={lens} kind={totalKind(total)} size="sm" /> : null}
                  />
                  {items.map((t) => row(t, false))}
                </React.Fragment>
              ))}
        </TBody>
      </Table>
    </Card>
  );
}

function TxRow({
  tx,
  lens,
  showDate,
  selected,
  onOpen,
}: {
  tx: Transaction;
  lens: Currency;
  showDate: boolean;
  selected: boolean;
  onOpen: () => void;
}) {
  // Texto do extrato só aparece quando acrescenta algo à descrição.
  const raw =
    tx.merchantRaw && tx.merchantRaw.trim().toLowerCase() !== tx.description.trim().toLowerCase()
      ? tx.merchantRaw
      : null;
  return (
    <TR
      state={selected ? "selected" : undefined}
      // A linha inteira abre o detalhe com o mouse; pelo teclado, o botão da descrição
      // (Tab chega nele com nome; Enter/Espaço disparam o clique, que sobe até aqui).
      className="cursor-pointer has-[button[data-row-open]:focus-visible]:bg-muted has-[button[data-row-open]:focus-visible]:outline has-[button[data-row-open]:focus-visible]:outline-2 has-[button[data-row-open]:focus-visible]:-outline-offset-2 has-[button[data-row-open]:focus-visible]:outline-ring"
      onClick={onOpen}
    >
      <TD className="w-full max-w-0">
        <div className="flex min-w-0 items-center gap-2 font-semibold">
          <button
            type="button"
            data-row-open
            className="min-w-0 truncate text-left focus-visible:outline-none"
            title={tx.description}
          >
            {tx.description}
            <span className="sr-only">, abrir detalhe</span>
          </button>
          {tx.state === "PENDING" ? <Badge variant="warning">pendente</Badge> : null}
          {tx.isInternalTransfer ? <Badge variant="info">interna</Badge> : null}
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-meta text-subtle">
          {showDate ? <span className="shrink-0">{shortDate(dayKey(tx.date))}</span> : null}
          {showDate && (raw || tx.bank) ? <span aria-hidden>·</span> : null}
          {raw ? <span className="truncate font-mono text-[11px]">{raw}</span> : null}
          {raw && tx.bank ? <span aria-hidden>·</span> : null}
          {tx.bank ? <span className="shrink-0">{tx.bank}</span> : null}
          {tx.isCard ? (
            <span className="inline-flex shrink-0 items-center gap-1" title="Compra no cartão de crédito">
              <CreditCard aria-hidden className="size-3.5" />
              <span className={tx.installment ? undefined : "sr-only"}>
                {tx.installment ? `parcela ${tx.installment}` : "cartão"}
              </span>
            </span>
          ) : null}
          <CurrencyTag currency={tx.baseCurrency} className="shrink-0" />
          {tx.category && !tx.isInternalTransfer ? (
            <CategoryTag category={tx.category} size="sm" className="md:hidden" />
          ) : null}
        </div>
      </TD>
      <TD className="hidden md:table-cell">
        {tx.isInternalTransfer ? (
          <span className="text-meta text-subtle">fora dos totais</span>
        ) : (
          <CategoryPill category={tx.category} />
        )}
      </TD>
      <TD className="hidden lg:table-cell">
        <MemberChip member={tx.member} />
      </TD>
      <TD className="text-right">
        <Money
          value={amountIn(tx, lens)}
          currency={lens}
          kind={moneyKind(tx)}
          original={{ value: tx.baseAmount, currency: tx.baseCurrency }}
        />
      </TD>
    </TR>
  );
}

export function TransactionsTableSkeleton() {
  return (
    <Card className="overflow-hidden" aria-busy aria-label="Carregando transações">
      <Table>
        <THead>
          <TR className="hover:bg-transparent">
            <TH>Descrição</TH>
            <TH className="hidden md:table-cell">Categoria</TH>
            <TH className="hidden lg:table-cell">Responsável</TH>
            <TH className="text-right">Valor</TH>
          </TR>
        </THead>
        <TBody>
          {Array.from({ length: 7 }, (_, i) => (
            <TR key={i} className="hover:bg-transparent">
              <TD>
                <Skeleton className="h-4 w-48" />
                <Skeleton className="mt-1.5 h-3 w-32" />
              </TD>
              <TD className="hidden md:table-cell">
                <Skeleton className="h-6 w-24" />
              </TD>
              <TD className="hidden lg:table-cell">
                <Skeleton className="h-5 w-20" />
              </TD>
              <TD>
                <Skeleton className="ml-auto h-4 w-20" />
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </Card>
  );
}
