// State and answers behind the transactions page, kept apart from its layout.
import { useEffect, useState } from 'react';

import { currentMonth } from './format';
import { useAccounts, useCategories, useRefreshMoney, useRegular, useTransfers } from './queries';
import { accountOptions, categoryOptions, isFiltered, pagedItems } from './transactions';

export type Tab = 'lista' | 'transferencias';

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
  const [tab, setTab] = useState<Tab>(aba === 'transferencias' ? 'transferencias' : 'lista');
  const [seenAba, setSeenAba] = useState(aba);
  if (aba !== seenAba) {
    setSeenAba(aba);
    if (aba === 'transferencias') setTab('transferencias');
  }
  return [tab, setTab] as const;
}

// Search and filters only exist on a computer; the phone always lists the whole month.
export function useTransactionsPage(wide: boolean, aba: string | undefined) {
  const [tab, setTab] = useTabFromLink(aba);
  const [month, setMonth] = useState(currentMonth);
  const [search, setSearch] = useState('');
  const q = useDebounced(search, 300);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const filters = { q, categoryId, accountId };
  const regular = useRegular(month, true, wide ? filters : {});
  const transfers = useTransfers(month, true);
  const categories = useCategories(wide);
  const accounts = useAccounts(wide);
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
    selectedId,
    setSelectedId,
    selected: items?.find((t) => t.id === selectedId) ?? null,
    items,
    regular,
    transfers,
    categories: categoryOptions(categories.data),
    accounts: accountOptions(accounts.data),
    filtered: wide && isFiltered(filters),
    refreshMoney: useRefreshMoney(),
  };
}

export type TransactionsPage = ReturnType<typeof useTransactionsPage>;
