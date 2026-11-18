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
import { type Drill, type DrillParams, drillOf } from './drill';
import {
  accountOptions,
  bankOptions,
  type Dim,
  type Pick,
  txFilters,
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

export type Tab = 'lista' | 'revisar';

// Links from Início: ?aba=revisar opens the lines waiting for review; ?aba=transferencias
// (transfers waiting to be confirmed) opens the list with internal transfers shown.
type Link = 'revisar' | 'transferencias';

function linkOf(aba: string | undefined): Link | null {
  return aba === 'revisar' || aba === 'transferencias' ? aba : null;
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
  const first = linkOf(aba);
  const [tab, setTab] = useState<Tab>(first === 'revisar' ? 'revisar' : 'lista');
  const [withTransfers, setWithTransfers] = useState(first === 'transferencias');
  const [seenAba, setSeenAba] = useState(aba);
  if (aba !== seenAba) {
    setSeenAba(aba);
    const linked = linkOf(aba);
    if (linked === 'revisar') setTab('revisar');
    if (linked === 'transferencias') {
      setTab('lista');
      setWithTransfers(true);
    }
  }
  return { tab, setTab, withTransfers, setWithTransfers };
}

// Which grouping of the totals goes with each filter (banks have none).
const GROUP_OF: Partial<Record<Dim, GroupBy>> = {
  category: 'categories',
  member: 'members',
  account: 'accounts',
};

// A filter that also groups the totals by its own dimension once it is picked: filter by
// Moradia and the totals show by category; by a person, they show by Responsável.
function useFilters() {
  const [search, setSearch] = useState('');
  const q = useDebounced(search, 300);
  const [menus, setMenus] = useState(NO_FILTERS);
  const [groupBy, setGroupBy] = useState<GroupBy>('categories');
  const setter =
    <K extends 'direction' | 'accountCurrency'>(key: K) =>
    (value: (typeof NO_FILTERS)[K]) =>
      setMenus((m) => ({ ...m, [key]: value }));
  const setPick = (dim: Dim) => (pick: Pick) => {
    setMenus((m) => ({ ...m, [dim]: pick }));
    const by = GROUP_OF[dim];
    if (pick.ids.length > 0 && by) setGroupBy(by);
  };
  const filters: PageFilters = { q, ...menus };
  return {
    search,
    setSearch,
    ...menus,
    setCategory: setPick('category'),
    setMember: setPick('member'),
    setAccount: setPick('account'),
    setBank: setPick('bank'),
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
    // A row of Início's breakdown: only that pick, on the month's spending.
    showDrill: (dim: Dim, pick: Pick) => {
      setSearch('');
      setMenus({ ...NO_FILTERS, [dim]: pick, direction: 'out' });
      const by = GROUP_OF[dim];
      if (by) setGroupBy(by);
    },
  };
}

// A link from Início's breakdown: applied once per tap (its "n" changes every time), while
// rendering, like the ?aba= links, because the screen stays mounted between tabs.
function useDrillLink(link: DrillParams, apply: (drill: Drill) => void) {
  const [seen, setSeen] = useState<string | undefined>(undefined);
  const drill = drillOf(link);
  if (drill && link.n !== seen) {
    setSeen(link.n);
    apply(drill);
  }
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
    resetPeriod: () => {
      setPeriod('month');
      setFromText('');
      setToText('');
    },
    ready: ready && (period !== 'range' || range.error === null),
    listMonth: period === 'month' ? month : null,
    dates,
  };
}

// Transações is a page to study the money: whatever the filters leave on screen is also
// added up (entradas, saídas, by day, and by category, Responsável or account).
export function useTransactionsPage(aba: string | undefined, link: DrillParams = {}) {
  const { tab, setTab, withTransfers, setWithTransfers } = useTabFromLink(aba);
  const period = usePeriod();
  const f = useFilters();
  useDrillLink(link, (drill) => {
    setTab('lista');
    setWithTransfers(false);
    period.resetPeriod();
    period.setMonth(drill.month);
    f.showDrill(drill.dim, drill.pick);
  });
  const [sort, setSort] = useState<TxSort>('date');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const view: ListView = {
    month: period.listMonth,
    kinds: withTransfers ? ALL_KINDS : LIST_KINDS,
    sort,
  };
  const query = { ...txFilters(f.filters), ...period.dates };
  const onList = tab === 'lista';
  const regular = useRegular(view, period.ready, query);
  const totals = useTotals(view, onList && period.ready, query);
  const transfers = useTransfers(period.month, true);
  const movements = useMovements(period.month, withTransfers);
  const review = useReviewQueue(true);
  const categories = useCategories(true);
  const accounts = useAccounts(true);
  const family = useFamily(true);
  const items = pagedItems(regular.data?.pages);
  const { filters: _filters, clearFilters, ...filterState } = f;
  // Anything that narrows the list away from "the month, as it is": one tap undoes it all.
  const narrowed = f.filtered || period.period !== 'month' || withTransfers;
  const clearAll = () => {
    clearFilters();
    period.resetPeriod();
    setWithTransfers(false);
  };
  return {
    tab,
    setTab,
    ...period,
    ...filterState,
    sort,
    setSort,
    withTransfers,
    setWithTransfers,
    narrowed,
    clearAll,
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
    // Lines that may be transfers, waiting for the person to say what they were.
    toConfirm: transfers.data?.pending.length ?? 0,
    review,
    categories: categoryOptions(categories.data),
    accounts: accountOptions(accounts.data),
    banks: bankOptions(accounts.data),
    currencies: currencyOptions(accounts.data),
    members: memberOptions(family.data?.members),
    refreshMoney: useRefreshMoney(),
  };
}

export type TransactionsPage = ReturnType<typeof useTransactionsPage>;
