"use client";

import * as React from "react";
import { MoreHorizontal, Search, Trash2 } from "lucide-react";
import { Decimal } from "@/lib/money";
import {
  useBanks,
  useCategories,
  useMembers,
  useCurrentMonth,
  useLatestDataMonth,
  useMonthStartDay,
  useTransactionList,
  type CardGroup,
  type Currency,
  type Transaction,
  type TransactionFilters,
  type TxType,
} from "@/hooks";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Segmented } from "@/components/ui/segmented";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { MemberAvatar } from "@/components/finance/member";
import { EmptyState, ErrorState } from "@/components/states";
import {
  CategoryFilter,
  FilterMenu,
  PeriodFilter,
  periodFilters,
  periodPhrase,
  type Period,
} from "./_components/filters";
import { CardPurchasesDialog } from "./_components/card-purchases-dialog";
import { CURRENCIES, TYPE_LABEL } from "./_components/shared";
import { SummaryStrip, SummaryStripSkeleton } from "./_components/summary-strip";
import { LoadMore } from "./_components/load-more";
import { DeleteAllDialog } from "./_components/delete-all-dialog";
import { TransactionSheet } from "./_components/transaction-sheet";
import { TransactionsTable, TransactionsTableSkeleton, type TableSort } from "./_components/transactions-table";

const LENS_OPTIONS = [
  { value: "EUR" as const, label: "€ EUR" },
  { value: "USD" as const, label: "US$ USD" },
  { value: "BRL" as const, label: "R$ BRL" },
];

// Só gasto/entrada: o que tira uma linha dos totais é o interruptor "Transferências internas".
const TYPE_OPTIONS = (["EXPENSE", "INCOME"] as TxType[]).map((t) => ({ value: t, label: TYPE_LABEL[t] }));
const CURRENCY_OPTIONS = CURRENCIES.map((c) => ({ value: c, label: c }));

interface Filters {
  type?: TxType;
  baseCurrency?: Currency;
  categoryId?: string;
  memberId?: string;
  bank?: string;
  includeInternal: boolean;
}

const NO_FILTERS: Filters = { includeInternal: false };

/** Atrasa a busca enquanto a pessoa digita (evita uma consulta por tecla). */
function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export default function TransactionsPage() {
  const banks = useBanks();
  const categories = useCategories();
  const members = useMembers();

  // Abre no mês mais recente com movimento (igual ao Resumo); depois o usuário escolhe.
  const latest = useLatestDataMonth();
  const current = useCurrentMonth();
  // O mês é o financeiro (pode começar no dia do salário): espera saber o dia de início.
  const startDay = useMonthStartDay();
  const [picked, setPeriod] = React.useState<Period | null>(null);
  const period: Period = picked ?? { kind: "month", month: latest ?? current };
  const [filters, setFilters] = React.useState<Filters>(NO_FILTERS);
  const [search, setSearch] = React.useState("");
  const [lens, setLens] = React.useState<Currency>("EUR");
  const [sort, setSort] = React.useState<TableSort>(null);
  const [selected, setSelected] = React.useState<Transaction | null>(null);
  const [deleteAll, setDeleteAll] = React.useState(false);

  const debouncedSearch = useDebounced(search.trim());
  const query: TransactionFilters = {
    ...periodFilters(period, startDay ?? 1),
    ...filters,
    search: debouncedSearch || undefined,
  };
  // Espera o mês inicial: senão busca o mês atual e troca (lista vazia piscando).
  // Lista por dia: as compras do cartão ficam numa linha por cartão, que abre todas.
  const tx = useTransactionList(query, sort, lens, {
    enabled: (picked !== null || latest !== undefined) && (period.kind !== "month" || startDay !== undefined),
    groupCards: sort === null,
  });
  const [openCard, setOpenCard] = React.useState<CardGroup | null>(null);

  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters((f) => ({ ...f, [k]: v }));
  const anyFilter =
    Boolean(filters.type || filters.baseCurrency || filters.categoryId || filters.memberId || filters.bank) ||
    filters.includeInternal ||
    Boolean(search.trim());
  const clearAll = () => {
    setFilters(NO_FILTERS);
    setSearch("");
  };

  const pages = React.useMemo(() => tx.data?.pages ?? [], [tx.data]);
  const first = pages[0];
  const list = React.useMemo(() => pages.flatMap((p) => p.transactions), [pages]);
  const cards = React.useMemo(() => first?.cards ?? [], [first]);
  // As compras do cartão saem das linhas, mas são transações do período.
  const count = (first?.total ?? 0) + cards.reduce((n, c) => n + c.count, 0);
  // Total de cada dia (do dia inteiro), juntando o que cada página trouxe.
  const dayTotals = React.useMemo(() => {
    const field = lens === "BRL" ? "amountBRL" : lens === "USD" ? "amountUSD" : "amountEUR";
    const m = new Map<string, Decimal>();
    for (const p of pages) for (const d of p.dayTotals) m.set(d.day, new Decimal(d._sum[field] ?? "0"));
    return m;
  }, [pages, lens]);
  // Com linhas na tela, uma falha (carregar mais ou atualizar) aparece no rodapé, sem
  // trocar a lista já carregada por uma tela de erro.
  const listError = tx.isError && first ? tx.error : null;
  const description = first
    ? `${count} ${count === 1 ? "transação" : "transações"} ${periodPhrase(period, startDay)}`
    : `Transações ${periodPhrase(period, startDay)}`;

  return (
    <div className="space-y-5">
      <PageHeader
        className="pb-1"
        title="Transações"
        description={description}
        actions={
          <div className="flex items-center gap-2">
            <Segmented aria-label="Moeda de exibição" options={LENS_OPTIONS} value={lens} onValueChange={setLens} />
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Mais ações">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem destructive onSelect={() => setDeleteAll(true)}>
                  <Trash2 />
                  Apagar todas as transações…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-64">
          <Input
            icon={<Search />}
            type="search"
            aria-label="Buscar descrição"
            placeholder="Buscar descrição…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <PeriodFilter value={period} onChange={setPeriod} current={current} startDay={startDay} />
        <FilterMenu
          label="Tipo"
          options={TYPE_OPTIONS}
          selected={filters.type}
          onSelect={(v) => set("type", v as TxType)}
          onClear={() => set("type", undefined)}
        />
        <CategoryFilter
          categories={categories.data ?? []}
          loading={categories.isLoading}
          error={categories.error}
          onRetry={() => categories.refetch()}
          selected={filters.categoryId}
          onSelect={(id) => set("categoryId", id)}
          onClear={() => set("categoryId", undefined)}
        />
        <FilterMenu
          label="Responsável"
          options={(members.data ?? []).map((m) => ({
            value: m.id,
            label: m.name,
            leading: <MemberAvatar member={m} size="xs" />,
          }))}
          loading={members.isLoading}
          error={members.error}
          onRetry={() => members.refetch()}
          emptyText="Nenhum responsável cadastrado"
          selected={filters.memberId}
          onSelect={(v) => set("memberId", v)}
          onClear={() => set("memberId", undefined)}
        />
        <FilterMenu
          label="Conta"
          options={(banks.data ?? []).map((b) => ({ value: b, label: b }))}
          loading={banks.isLoading}
          error={banks.error}
          onRetry={() => banks.refetch()}
          emptyText="Nenhuma conta ainda"
          selected={filters.bank}
          onSelect={(v) => set("bank", v)}
          onClear={() => set("bank", undefined)}
        />
        <FilterMenu
          label="Moeda"
          options={CURRENCY_OPTIONS}
          selected={filters.baseCurrency}
          onSelect={(v) => set("baseCurrency", v as Currency)}
          onClear={() => set("baseCurrency", undefined)}
        />
        {anyFilter ? (
          <Button variant="ghost" size="sm" onClick={clearAll}>
            Limpar filtros
          </Button>
        ) : null}
        <div className="ml-auto flex items-center gap-3">
          {tx.isFetching && !tx.isLoading && !tx.isFetchingNextPage ? <Spinner className="size-4" /> : null}
          <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Switch checked={filters.includeInternal} onCheckedChange={(v) => set("includeInternal", v)} />
            Transferências internas
          </label>
        </div>
      </div>

      {tx.isLoading ? (
        <>
          <SummaryStripSkeleton />
          <TransactionsTableSkeleton />
        </>
      ) : tx.isError && !first ? (
        <ErrorState error={tx.error} onRetry={() => tx.refetch()} title="Não deu para carregar as transações" />
      ) : count === 0 ? (
        <EmptyState
          title="Nenhuma transação encontrada"
          hint={
            anyFilter
              ? "Nada bate com os filtros escolhidos neste período."
              : "Nenhum lançamento neste período. Troque o período ou importe um extrato."
          }
          action={
            anyFilter ? (
              <Button variant="secondary" size="sm" onClick={clearAll}>
                Limpar filtros
              </Button>
            ) : null
          }
        />
      ) : (
        <>
          <SummaryStrip totals={first?.totals ?? []} pending={first!.pending} lens={lens} />
          <TransactionsTable
            transactions={list}
            dayTotals={dayTotals}
            lens={lens}
            sort={sort}
            onSortChange={setSort}
            selectedId={selected?.id ?? null}
            onOpen={setSelected}
            cards={cards}
            onOpenCard={setOpenCard}
          />
          <LoadMore
            shown={list.length}
            total={first?.total ?? 0}
            hasMore={Boolean(tx.hasNextPage)}
            loading={tx.isFetchingNextPage}
            error={listError}
            onLoadMore={() => (listError && !tx.isFetchNextPageError ? tx.refetch() : tx.fetchNextPage())}
          />
        </>
      )}

      <DeleteAllDialog open={deleteAll} onOpenChange={setDeleteAll} />

      {/* Some enquanto o detalhe de uma compra está aberto e volta quando ele fecha. */}
      <CardPurchasesDialog
        card={openCard}
        filters={query}
        lens={lens}
        open={openCard !== null && selected === null}
        onOpenChange={(o) => (o ? null : setOpenCard(null))}
        onOpenTx={setSelected}
      />

      <TransactionSheet
        tx={selected}
        onClose={() => setSelected(null)}
        categories={{ data: categories.data ?? [], loading: categories.isLoading, error: categories.error }}
        members={{ data: members.data ?? [], loading: members.isLoading, error: members.error }}
      />
    </div>
  );
}
