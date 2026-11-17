import {
  QueryClient,
  focusManager,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { AppState, Platform } from 'react-native';

import {
  getAnalysis,
  getCardBills,
  getConnections,
  getDashboard,
  getInvestments,
  getReviewQueue,
  getSummary,
  getTransfers,
  listBankRequests,
  listAccounts,
  listCategories,
  listCategoryRules,
  listImports,
  listTransactions,
  type TxFilters,
} from './imports';
import { useDisplayCurrency } from './displayCurrency';
import { getFamily } from './people';

// Server data for the money screens. Every key starts with "money" so one invalidation
// after an import or a reclassified transaction refreshes all tabs, which stay mounted.
export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

// On phones there is no window focus: the app coming back to the foreground counts.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (status) => focusManager.setFocused(status === 'active'));
}

const PAGE = 50;

// Amounts in the currency chosen on screen (useDisplayCurrency): it is part of every key.
export function useSummary(month: string, enabled: boolean) {
  const { currency } = useDisplayCurrency();
  return useQuery({
    queryKey: ['money', 'summary', month, currency],
    queryFn: () => getSummary(month, currency),
    enabled,
  });
}

// Spending per day, category and account, for the computer's Início.
export function useDashboard(month: string, enabled: boolean) {
  const { currency } = useDisplayCurrency();
  return useQuery({
    queryKey: ['money', 'dashboard', month, currency],
    queryFn: () => getDashboard(month, currency),
    enabled,
  });
}

// Análises: the chosen month against the months before it.
export function useAnalysis(month: string, months: number, enabled: boolean) {
  const { currency } = useDisplayCurrency();
  return useQuery({
    queryKey: ['money', 'analysis', month, months, currency],
    queryFn: () => getAnalysis(month, months, currency),
    enabled,
  });
}

export function useRecent(month: string, enabled: boolean) {
  const { currency } = useDisplayCurrency();
  return useQuery({
    queryKey: ['money', 'recent', month, currency],
    queryFn: () => listTransactions({ month, limit: 8, currency }),
    enabled,
  });
}

// Spending and income (investments included, as Investimento), 50 at a time; on a computer also searched and filtered.
export function useRegular(month: string, enabled: boolean, filters: TxFilters = {}) {
  const { currency } = useDisplayCurrency();
  return useInfiniteQuery({
    queryKey: ['money', 'regular', month, filters, currency],
    queryFn: ({ pageParam }) =>
      listTransactions({
        month,
        kinds: ['regular', 'investment'],
        limit: PAGE,
        offset: pageParam,
        currency,
        ...filters,
      }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.items.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
    enabled,
  });
}

export function useInvestments(month: string, enabled: boolean) {
  const { currency } = useDisplayCurrency();
  return useQuery({
    queryKey: ['money', 'investments', month, currency],
    queryFn: () => getInvestments(month, currency),
    enabled,
  });
}

// Each card's bill of a calendar month (paid or not) and the next one.
export function useCardBills(month: string, enabled: boolean) {
  const { currency } = useDisplayCurrency();
  return useQuery({
    queryKey: ['money', 'card-bills', month, currency],
    queryFn: () => getCardBills(month, currency),
    enabled,
  });
}

// The purchases charged in one bill of one card.
export function useBillPurchases(accountId: string, bill: string, enabled: boolean) {
  const { currency } = useDisplayCurrency();
  return useQuery({
    queryKey: ['money', 'bill-purchases', accountId, bill, currency],
    queryFn: () => listTransactions({ accountId, cardBill: bill, limit: 200, currency }),
    enabled,
  });
}

export function useTransfers(month: string, enabled: boolean) {
  return useQuery({
    queryKey: ['money', 'transfers', month],
    queryFn: () => getTransfers(month),
    enabled,
  });
}

// Imported lines waiting for approval; under "money" so every change refreshes it.
export function useReviewQueue(enabled: boolean) {
  const { currency } = useDisplayCurrency();
  return useQuery({
    queryKey: ['money', 'review', currency],
    queryFn: () => getReviewQueue(currency),
    enabled,
  });
}

export function useRefreshMoney(): () => Promise<void> {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: ['money'] });
}

export function useAccounts(enabled: boolean) {
  return useQuery({ queryKey: ['money', 'accounts'], queryFn: listAccounts, enabled });
}

export function useImports(enabled: boolean) {
  return useQuery({ queryKey: ['money', 'imports'], queryFn: listImports, enabled });
}

export function useCategories(enabled: boolean) {
  return useQuery({ queryKey: ['money', 'categories'], queryFn: listCategories, enabled });
}

export function useCategoryRules(id: string | null) {
  return useQuery({
    queryKey: ['money', 'categories', id, 'rules'],
    queryFn: () => listCategoryRules(id!),
    enabled: id !== null,
  });
}

// Under "money": a sync brings transactions, so it refreshes with the rest.
export function useConnections(enabled: boolean) {
  return useQuery({ queryKey: ['money', 'connections'], queryFn: getConnections, enabled });
}

// Not money data: kept out of the "money" key so imports don't refetch it.
export function useBankRequests(enabled: boolean) {
  return useQuery({ queryKey: ['bank-requests'], queryFn: listBankRequests, enabled });
}

// The family and its people (Responsáveis). Under "money" so changing an account's owner
// refreshes the lines that follow it.
export function useFamily(enabled: boolean) {
  return useQuery({ queryKey: ['money', 'family'], queryFn: getFamily, enabled });
}
