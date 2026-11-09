"use client";

import * as React from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { format, subMonths } from "date-fns";
import { api } from "@/hooks/api-client";
import {
  cumulativeExpenses,
  dailyExpenses,
  spendingCalendar,
  groupExpenses,
  monthFlow,
  halfwayDay,
  monthPace,
  monthTotals,
  pctChange,
  savingsRate,
  seriesStats,
  trimLeadingEmpty,
  type Lens,
} from "@/lib/transactions/aggregate";
import { localIso, periodDates, periodRange, daysBetween } from "@/lib/period";
import { useApiMutation } from "./mutation";
import { useMonthStartDay } from "./settings";
import type {
  CardBillsResponse,
  MovementsResponse,
  Currency,
  SummaryRow,
  TransactionFilters,
  TransactionPage,
  TransactionPatch,
  TransactionSort,
} from "./types";

function toQuery(f: TransactionFilters): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (v === undefined || v === "" || v === false) continue;
    p.set(k, String(v));
  }
  return p.toString();
}

/**
 * Período [início, fim] do mês de `d` no formato que a API aceita. O mês é o financeiro:
 * com `startDay` 27, "novembro" vai de 27/out a 26/nov (src/lib/period.ts).
 */
export function monthRange(d: Date, startDay = 1): { from: string; to: string } {
  return periodRange(format(d, "yyyy-MM"), startDay);
}

/** Tamanho da página da lista de Transações ("Carregar mais" traz a próxima). */
export const TRANSACTIONS_PAGE_SIZE = 50;

/**
 * Lista de Transações paginada (50 por vez), ordenada no servidor. `pages` acumula o que
 * já foi carregado; totais, pendentes e contagem são do período inteiro.
 */
/**
 * `enabled: false` espera (ex.: o mês inicial ainda não foi decidido), sem buscar um período errado antes.
 * `groupCards`: as compras do cartão saem das linhas e voltam resumidas em `cards` (lista por dia).
 */
export function useTransactionList(
  filters: TransactionFilters,
  sort: TransactionSort,
  lens: Currency,
  { enabled = true, groupCards = false }: { enabled?: boolean; groupCards?: boolean } = {},
) {
  const qs = toQuery(filters);
  const sortParam = sort ? `${sort.key}:${sort.dir}` : "";
  return useInfiniteQuery({
    queryKey: ["transactions", "list", qs, sortParam, sort?.key === "value" ? lens : "", groupCards],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => {
      const p = new URLSearchParams(qs);
      p.set("limit", String(TRANSACTIONS_PAGE_SIZE));
      p.set("offset", String(pageParam));
      if (sortParam) p.set("sort", sortParam);
      if (sort?.key === "value") p.set("lens", lens);
      if (groupCards) p.set("groupCards", "true");
      return api.get<TransactionPage>(`/api/transactions?${p}`);
    },
    getNextPageParam: (last) =>
      last.offset + last.transactions.length < last.total ? last.offset + last.limit : undefined,
    placeholderData: (prev) => prev,
    enabled,
  });
}

/** Um mês inteiro de uma vez (Resumo). `truncated`: passou do teto da API e a lista veio cortada. */
const MONTH_LIMIT = 1000;
function useMonthTransactions(range: { from: string; to: string } | null) {
  const qs = range ? toQuery(range) : "";
  return useQuery({
    queryKey: ["transactions", "month", qs],
    // Sem o dia de início do mês ainda: espera, em vez de buscar o período errado.
    enabled: range !== null,
    // Sem dados do mês anterior no lugar: categorias e "últimas transações" de outro mês,
    // com o título do mês novo, seriam um dado errado na tela.
    queryFn: () => api.get<TransactionPage>(`/api/transactions?${qs}&limit=${MONTH_LIMIT}`),
  });
}

export function useUpdateTransaction() {
  return useApiMutation((v: { id: string; data: TransactionPatch }) => api.patch(`/api/transactions/${v.id}`, v.data), {
    invalidate: [["transactions"], ["summary"], ["uploads"]],
    errorTitle: "Erro ao salvar transação",
    success: () => ({ title: "Transação atualizada" }),
  });
}

export function useDeleteTransaction() {
  return useApiMutation((id: string) => api.del(`/api/transactions/${id}`), {
    invalidate: [["transactions"], ["summary"], ["uploads"]],
    errorTitle: "Erro ao excluir transação",
    success: () => ({ title: "Transação excluída" }),
  });
}

export interface PurgeOverview {
  transactions: number;
  imports: number;
  openReviews: number;
}

/** O que "Apagar todas as transações" leva junto. Só busca com o diálogo aberto. */
export function usePurgeOverview(enabled: boolean) {
  return useQuery({
    queryKey: ["transactions", "purge-overview"],
    queryFn: () => api.get<PurgeOverview>("/api/transactions/all"),
    enabled,
    staleTime: 0,
  });
}

/** Apaga todas as transações (e as importações confirmadas). `expected` = número que o usuário viu. */
export function useDeleteAllTransactions() {
  return useApiMutation(
    (expected: number) =>
      api.del<{ removedTransactions: number; removedImports: number; warning?: string }>("/api/transactions/all", {
        confirm: "APAGAR",
        expected,
      }),
    {
      invalidate: [["transactions"], ["summary"], ["uploads"], ["banks"], ["connections"], ["staged"]],
      errorTitle: "Não deu para apagar as transações",
      success: (r) => ({
        title: `${r.removedTransactions} ${r.removedTransactions === 1 ? "transação apagada" : "transações apagadas"}`,
        description: r.warning,
      }),
    },
  );
}

// --- Resumo ------------------------------------------------------------------

/** Mês mais recente com movimento (para o Resumo abrir num mês com dados). */
/**
 * O mês mais recente com movimento. `undefined` enquanto carrega; `null` quando não há
 * nada (ou o resumo falhou: aí vale o mês atual, e a própria lista mostra o erro dela).
 */
export function useLatestDataMonth(): Date | null | undefined {
  const summary = useSummary();
  return React.useMemo(() => {
    if (summary.isLoading) return undefined;
    const last = summary.data
      ?.map((r) => r.month)
      .sort()
      .at(-1);
    if (!last) return null;
    const [y, m] = last.split("-").map(Number);
    return new Date(y, m - 1, 1);
  }, [summary.isLoading, summary.data]);
}

export function useSummary() {
  return useQuery({
    queryKey: ["summary"],
    queryFn: () => api.get<{ summary: SummaryRow[] }>("/api/summary").then((d) => d.summary),
  });
}

/**
 * Tudo que o Resumo precisa para um mês, na moeda da lente: totais do mês,
 * variação vs mês anterior, série de 12 meses e gastos por categoria /
 * responsável / conta (transferências internas excluídas).
 */
export function useMonthOverview(month: Date, lens: Lens) {
  const summary = useSummary();
  const startDay = useMonthStartDay();
  const txs = useMonthTransactions(startDay === undefined ? null : monthRange(month, startDay));

  const data = React.useMemo(() => {
    if (!summary.data || !txs.data) return undefined;
    const key = format(month, "yyyy-MM");
    const prevKey = format(subMonths(month, 1), "yyyy-MM");
    const allMonths = monthTotals(summary.data, lens);
    const perLens = (l: Lens) => monthTotals(summary.data!, l).find((m) => m.month === key);
    const current = allMonths.find((m) => m.month === key) ?? {
      month: key,
      income: "0.00",
      expense: "0.00",
      net: "0.00",
    };
    const prev = allMonths.find((m) => m.month === prevKey);

    // Série dos 12 meses terminando no mês escolhido (meses vazios = 0).
    const series = Array.from({ length: 12 }, (_, i) => {
      const k = format(subMonths(month, 11 - i), "yyyy-MM");
      return allMonths.find((m) => m.month === k) ?? { month: k, income: "0.00", expense: "0.00", net: "0.00" };
    });

    const list = txs.data.transactions;
    return {
      current,
      prev,
      byLens: { BRL: perLens("BRL"), USD: perLens("USD"), EUR: perLens("EUR") },
      incomeChange: pctChange(current.income, prev?.income),
      expenseChange: pctChange(current.expense, prev?.expense),
      savingsRate: savingsRate(current),
      series,
      /** Para o gráfico: sem os meses vazios antes do primeiro dado. */
      chartSeries: trimLeadingEmpty(series),
      stats: seriesStats(series),
      byCategory: groupExpenses(list, lens, (t) => ({
        key: t.categoryId ?? "none",
        label: t.category?.name ?? "Sem categoria",
        // Sem categoria: sem cor, e o componente pinta com o neutro de tint() (um cinza só).
        color: t.category?.color ?? undefined,
        icon: t.category?.icon,
      })),
      /** Entradas → gastos por categoria e o que sobrou (ou o que veio das reservas). */
      flow: monthFlow(list, lens, (t) => ({
        key: t.categoryId ?? "none",
        label: t.category?.name ?? "Sem categoria",
        color: t.category?.color ?? undefined,
        icon: t.category?.icon,
      })),
      byMember: groupExpenses(list, lens, (t) => ({
        key: t.memberId ?? "none",
        label: t.member?.name ?? "Sem responsável",
        color: t.member?.color ?? undefined,
      })),
      byBank: groupExpenses(list, lens, (t) => ({
        key: `${t.bank ?? "?"}|${t.baseCurrency}`,
        label: t.bank ?? "Sem conta",
      })),
      transactions: list,
      /** O mês tem mais transações do que a lista trouxe: as divisões por categoria/pessoa ficam parciais. */
      truncated: txs.data.total > list.length,
    };
  }, [summary.data, txs.data, month, lens]);

  return {
    data,
    isLoading: summary.isLoading || txs.isLoading || startDay === undefined,
    isError: summary.isError || txs.isError,
    error: summary.error ?? txs.error,
    refetch: () => {
      summary.refetch();
      txs.refetch();
    },
  };
}

/** Faturas dos cartões vistas de um mês (Resumo): a do mês, o pagamento e a próxima. */
export function useCardBills(month: Date) {
  const key = format(month, "yyyy-MM");
  return useQuery({
    queryKey: ["transactions", "card-bills", key],
    queryFn: () => api.get<CardBillsResponse>(`/api/cards/bills?month=${key}`),
  });
}

/** Movimentações do mês (Resumo): o que só mudou de lugar, por categoria e sentido. */
export function useMovements(month: Date) {
  const key = format(month, "yyyy-MM");
  return useQuery({
    queryKey: ["transactions", "movements", key],
    queryFn: () => api.get<MovementsResponse>(`/api/movements?month=${key}`),
  });
}

/**
 * Ritmo do mês (Resumo): gasto acumulado dia a dia neste mês e no anterior, e quanto se
 * gastou até hoje comparado com o mesmo dia do mês passado. No mês corrente a linha vai
 * até hoje; num mês passado, até o fim. `truncated`: o mês passou do teto da lista e a
 * soma por dia ficaria errada (a tela não mostra o gráfico).
 *
 * O mês é o financeiro: as posições são os dias do período (posição 1 = o dia de início),
 * e `dates` diz qual dia do calendário cada posição é.
 */
export function useMonthPace(month: Date, lens: Lens, today: Date = new Date()) {
  const startDay = useMonthStartDay();
  const key = format(month, "yyyy-MM");
  const prevKey = format(subMonths(month, 1), "yyyy-MM");
  const cur = useMonthTransactions(startDay === undefined ? null : monthRange(month, startDay));
  const prev = useMonthTransactions(startDay === undefined ? null : monthRange(subMonths(month, 1), startDay));
  const todayIso = localIso(today);

  const data = React.useMemo(() => {
    if (!cur.data || !prev.data || startDay === undefined) return undefined;
    const dates = periodDates(key, startDay);
    const prevDates = periodDates(prevKey, startDay);
    const days = dates.length;
    const current = cumulativeExpenses(cur.data.transactions, lens, dates[0], days);
    const previous = cumulativeExpenses(prev.data.transactions, lens, prevDates[0], prevDates.length);
    const todayAt = daysBetween(dates[0], todayIso) + 1;
    const isCurrentMonth = todayAt >= 1 && todayAt <= days;
    const upTo = isCurrentMonth ? todayAt : days;
    return {
      days,
      /** O dia do calendário de cada posição ("AAAA-MM-DD"). */
      dates,
      current,
      previous,
      pace: monthPace(current, previous, upTo),
      /** Gasto de cada dia, com intensidade, para o calendário. */
      calendar: spendingCalendar(dailyExpenses(cur.data.transactions, lens, dates[0], days), upTo, dates[0]),
      /** As transações do mês (o calendário abre as do dia escolhido). */
      transactions: cur.data.transactions,
      /** Mês fechado: a posição do dia em que metade dos gastos já tinha saído. */
      halfway: halfwayDay(current),
      isCurrentMonth,
      truncated: cur.data.total > cur.data.transactions.length || prev.data.total > prev.data.transactions.length,
    };
  }, [cur.data, prev.data, lens, key, prevKey, startDay, todayIso]);

  return {
    data,
    isLoading: cur.isLoading || prev.isLoading || startDay === undefined,
    isError: cur.isError || prev.isError,
    error: cur.error ?? prev.error,
    refetch: () => Promise.all([cur.refetch(), prev.refetch()]),
  };
}
