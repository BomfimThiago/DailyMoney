import {
  QueryClient,
  focusManager,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { AppState, Platform } from 'react-native';

import {
  getDashboard,
  getInvestments,
  getSummary,
  getTransfers,
  listBankRequests,
  listAccounts,
  listCategories,
  listImports,
  listTransactions,
  type TxFilters,
} from './imports';

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

export function useSummary(month: string, enabled: boolean) {
  return useQuery({
    queryKey: ['money', 'summary', month],
    queryFn: () => getSummary(month),
    enabled,
  });
}

// Spending per day, category and account, for the computer's Início.
export function useDashboard(month: string, enabled: boolean) {
  return useQuery({
    queryKey: ['money', 'dashboard', month],
    queryFn: () => getDashboard(month),
    enabled,
  });
}

export function useRecent(month: string, enabled: boolean) {
  return useQuery({
    queryKey: ['money', 'recent', month],
    queryFn: () => listTransactions({ month, limit: 8 }),
    enabled,
  });
}

// Spending and income only, 50 at a time; on a computer also searched and filtered.
export function useRegular(month: string, enabled: boolean, filters: TxFilters = {}) {
  return useInfiniteQuery({
    queryKey: ['money', 'regular', month, filters],
    queryFn: ({ pageParam }) =>
      listTransactions({ month, kinds: ['regular'], limit: PAGE, offset: pageParam, ...filters }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.items.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
    enabled,
  });
}

export function useInvestments(month: string, enabled: boolean) {
  return useQuery({
    queryKey: ['money', 'investments', month],
    queryFn: () => getInvestments(month),
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

// Not money data: kept out of the "money" key so imports don't refetch it.
export function useBankRequests(enabled: boolean) {
  return useQuery({ queryKey: ['bank-requests'], queryFn: listBankRequests, enabled });
}
