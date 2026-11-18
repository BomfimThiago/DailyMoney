// State and answers behind the transactions page, kept apart from its layout.
import { useEffect, useState } from 'react';

import { useMonthState } from './monthStart';
import {
  useAccounts,
  useCategories,
  useFamily,
  useRefreshMoney,
  useRegular,
  useReviewQueue,
  useTotals,
  useTransfers,
} from './queries';
import { reviewItems } from './review';
import {
  accountOptions,
  categoryOptions,
  type GroupBy,
  isFiltered,
  memberOptions,
  pagedItems,
} from './transactions';

export type Tab = 'lista' | 'transferencias' | 'revisar';

const LINKED: Tab[] = ['transferencias', 'revisar'];

function linkedTab(aba: string | undefined): Tab | null {
  return LINKED.find((t) => t === aba) ?? null;
}

// The value once it has stayed the same for a while: search as the person types,
// without a request per key.
export function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

// The screen stays mounted between tabs, so a link from Início with ?aba= must switch
// here; adjusting state while rendering is React's pattern for following a prop.
export function useTabFromLink(aba: string | undefined) {
  const [tab, setTab] = useState<Tab>(linkedTab(aba) ?? 'lista');
  const [seenAba, setSeenAba] = useState(aba);
  if (aba !== seenAba) {
    setSeenAba(aba);
    const linked = linkedTab(aba);
    if (linked) setTab(linked);
  }
  return [tab, setTab] as const;
}

// A filter that also groups the totals by its own dimension once it is picked: filter by
// Moradia and the totals show by category; by a person, they show by Responsável.
function useFilter(setGroupBy: (by: GroupBy) => void, by: GroupBy) {
  const [value, setValue] = useState<string | null>(null);
  const set = (id: string | null) => {
    setValue(id);
    if (id !== null) setGroupBy(by);
  };
  return [value, set] as const;
}

// Transações is a page to study the month: whatever the filters leave on screen is also
// added up (entradas, saídas, and by category, Responsável or account), on both layouts.
export function useTransactionsPage(aba: string | undefined) {
  const [tab, setTab] = useTabFromLink(aba);
  const [month, setMonth] = useMonthState();
  const [search, setSearch] = useState('');
  const q = useDebounced(search, 300);
  const [groupBy, setGroupBy] = useState<GroupBy>('categories');
  const [categoryId, setCategoryId] = useFilter(setGroupBy, 'categories');
  const [accountId, setAccountId] = useFilter(setGroupBy, 'accounts');
  const [memberId, setMemberId] = useFilter(setGroupBy, 'members');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const filters = { q, categoryId, accountId, memberId };
  const onList = tab === 'lista';
  const regular = useRegular(month, true, filters);
  const totals = useTotals(month, onList, filters);
  const transfers = useTransfers(month, true);
  const review = useReviewQueue(true);
  const categories = useCategories(true);
  const accounts = useAccounts(true);
  const family = useFamily(true);
  const items = pagedItems(regular.data?.pages);
  return {
    tab,
    setTab,
    month,
    setMonth,
    search,
    setSearch,
    categoryId,
    setCategoryId,
    accountId,
    setAccountId,
    memberId,
    setMemberId,
    groupBy,
    setGroupBy,
    selectedId,
    setSelectedId,
    // The line open in the detail, from the list or from the lines waiting for review.
    selected:
      [...(items ?? []), ...reviewItems(review.data)].find((t) => t.id === selectedId) ?? null,
    items,
    regular,
    totals,
    transfers,
    review,
    categories: categoryOptions(categories.data),
    accounts: accountOptions(accounts.data),
    members: memberOptions(family.data?.members),
    filtered: isFiltered(filters),
    refreshMoney: useRefreshMoney(),
  };
}

export type TransactionsPage = ReturnType<typeof useTransactionsPage>;
