// State and answers behind the transactions page, kept apart from its layout.
import { useEffect, useState } from 'react';

import { useMonthState } from './monthStart';
import type { TxSort } from './imports';
import {
  useAccounts,
  useCategories,
  useFamily,
  useLatestMonth,
  useRefreshMoney,
  useRegular,
  useReviewQueue,
  useMovements,
  useTotals,
  useTransfers,
} from './queries';
import { reviewItems } from './review';
import {
  accountOptions,
  ALL_KINDS,
  LIST_KINDS,
  type ListView,
  categoryOptions,
  currencyOptions,
  dayTotals,
  type GroupBy,
  isFiltered,
  memberOptions,
  NO_FILTERS,
  type PageFilters,
  pagedItems,
  type PeriodKind,
  rangeOf,
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
function useFilters() {
  const [search, setSearch] = useState('');
  const q = useDebounced(search, 300);
  const [menus, setMenus] = useState(NO_FILTERS);
  const [groupBy, setGroupBy] = useState<GroupBy>('categories');
  const setter =
    <K extends keyof typeof NO_FILTERS>(key: K, by?: GroupBy) =>
    (value: (typeof NO_FILTERS)[K]) => {
      setMenus((m) => ({ ...m, [key]: value }));
      if (value !== null && by) setGroupBy(by);
    };
  const filters: PageFilters = { q, ...menus };
  return {
    search,
    setSearch,
    ...menus,
    setCategoryId: setter('categoryId', 'categories'),
    setAccountId: setter('accountId', 'accounts'),
    setMemberId: setter('memberId', 'members'),
    setDirection: setter('direction'),
    setAccountCurrency: setter('accountCurrency'),
    groupBy,
    setGroupBy,
    filters,
    filtered: isFiltered(filters),
    clearFilters: () => {
      setSearch('');
      setMenus(NO_FILTERS);
    },
  };
}

// The month shown: the newest one with lines until the person picks another, so the page
// never opens on an empty month just because the statements end earlier.
function useOpeningMonth() {
  const [month, setMonth] = useMonthState();
  const [picked, setPicked] = useState(false);
  const latest = useLatestMonth(!picked);
  const newest = latest.data?.month;
  const shown = !picked && newest && newest < month ? newest : month;
  const pick = (m: string) => {
    setPicked(true);
    setMonth(m);
  };
  // Until the answer comes, the list waits rather than asking for a month it may leave.
  return { month: shown, setMonth: pick, ready: picked || !latest.isPending };
}

// A month, everything there is, or the days between two dates.
function usePeriod() {
  const { month, setMonth, ready } = useOpeningMonth();
  const [period, setPeriod] = useState<PeriodKind>('month');
  const [fromText, setFromText] = useState('');
  const [toText, setToText] = useState('');
  const range = rangeOf(fromText, toText);
  const dates =
    period === 'range'
      ? { dateFrom: range.from, dateTo: range.to }
      : { dateFrom: null, dateTo: null };
  return {
    month,
    setMonth,
    period,
    setPeriod,
    fromText,
    setFromText,
    toText,
    setToText,
    rangeError: period === 'range' ? range.error : null,
    ready: ready && (period !== 'range' || range.error === null),
    listMonth: period === 'month' ? month : null,
    dates,
  };
}

// Transações is a page to study the money: whatever the filters leave on screen is also
// added up (entradas, saídas, by day, and by category, Responsável or account).
export function useTransactionsPage(aba: string | undefined) {
  const [tab, setTab] = useTabFromLink(aba);
  const period = usePeriod();
  const f = useFilters();
  const [sort, setSort] = useState<TxSort>('date');
  const [withTransfers, setWithTransfers] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const view: ListView = {
    month: period.listMonth,
    kinds: withTransfers ? ALL_KINDS : LIST_KINDS,
    sort,
  };
  const query = { ...f.filters, ...period.dates };
  const onList = tab === 'lista';
  const regular = useRegular(view, period.ready, query);
  const totals = useTotals(view, onList && period.ready, query);
  const transfers = useTransfers(period.month, true);
  const movements = useMovements(period.month, tab === 'transferencias');
  const review = useReviewQueue(true);
  const categories = useCategories(true);
  const accounts = useAccounts(true);
  const family = useFamily(true);
  const items = pagedItems(regular.data?.pages);
  const { filters: _filters, ...filterState } = f;
  return {
    tab,
    setTab,
    ...period,
    ...filterState,
    sort,
    setSort,
    withTransfers,
    setWithTransfers,
    movements,
    selectedId,
    setSelectedId,
    // The line open in the detail, from the list or from the lines waiting for review.
    selected:
      [...(items ?? []), ...reviewItems(review.data)].find((t) => t.id === selectedId) ?? null,
    items,
    regular,
    totals,
    days: dayTotals(totals.data?.currencies[0]),
    transfers,
    review,
    categories: categoryOptions(categories.data),
    accounts: accountOptions(accounts.data),
    currencies: currencyOptions(accounts.data),
    members: memberOptions(family.data?.members),
    refreshMoney: useRefreshMoney(),
  };
}

export type TransactionsPage = ReturnType<typeof useTransactionsPage>;
