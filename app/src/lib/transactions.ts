// What the transactions page derives from its answers, kept apart from the page for tests.
import { money } from './format';
import type { TxFilters, TxSort } from './imports';
import { HOUSEHOLD, HOUSEHOLD_ID } from './people';
import { parseDate } from './txEdit';
import type {
  Account,
  Category,
  Currency,
  CurrencyTotals,
  Member,
  Transaction,
  TransactionPage,
  TxKind,
} from './types';

export type Option = { id: string; name: string };

// A line's amount in the currency the screen shows and, when it was converted, the amount
// the statement has. "plain" drops the sign (money that only moved).
export function lineAmounts(
  t: Transaction,
  sign: 'signed' | 'plain' = 'signed',
): { shown: string; original: string | null } {
  const fmt = (amount: string, currency: Transaction['currency']) =>
    sign === 'signed' ? money(amount, currency, true) : money(amount.replace('-', ''), currency);
  const original = fmt(t.amount, t.currency);
  if (t.display_amount == null || !t.display_currency || t.display_currency === t.currency) {
    return { shown: original, original: null };
  }
  return { shown: fmt(t.display_amount, t.display_currency), original };
}

export function pagedItems(pages: TransactionPage[] | undefined): Transaction[] | null {
  return pages ? pages.flatMap((p) => p.items) : null;
}

// How many lines the server still has after the ones already shown.
export function remaining(pages: TransactionPage[] | undefined): number {
  if (!pages?.length) return 0;
  const shown = pages.reduce((n, p) => n + p.items.length, 0);
  return pages[pages.length - 1].total - shown;
}

// One dimension of the filters (Categoria, Responsável, Conta, Banco): the values to show,
// or, with "exclude", the values to hide ("everything but these").
export type Dim = 'category' | 'member' | 'account' | 'bank';

export interface Pick {
  ids: string[];
  exclude: boolean;
}

export const NO_PICK: Pick = { ids: [], exclude: false };

export const DIMS: Dim[] = ['category', 'member', 'account', 'bank'];

// The filters the page holds, apart from the period.
export interface PageFilters {
  q: string;
  category: Pick;
  member: Pick;
  account: Pick;
  bank: Pick;
  direction: 'in' | 'out' | null;
  accountCurrency: Currency | null;
}

export const NO_FILTERS: Omit<PageFilters, 'q'> = {
  category: NO_PICK,
  member: NO_PICK,
  account: NO_PICK,
  bank: NO_PICK,
  direction: null,
  accountCurrency: null,
};

export function isFiltered(f: PageFilters) {
  return (
    f.q.trim() !== '' ||
    DIMS.some((d) => f[d].ids.length > 0) ||
    f.direction !== null ||
    f.accountCurrency !== null
  );
}

// The page's filters as the list and the totals ask for them.
export function txFilters(f: PageFilters): TxFilters {
  const { q, direction, accountCurrency } = f;
  const picks = Object.fromEntries(DIMS.filter((d) => f[d].ids.length > 0).map((d) => [d, f[d]]));
  return { q, direction, accountCurrency, picks };
}

// Tapping a value in a menu: in or out of the pick, keeping whether it shows or hides.
export function toggled(pick: Pick, id: string): Pick {
  const ids = pick.ids.includes(id) ? pick.ids.filter((i) => i !== id) : [...pick.ids, id];
  return { ...pick, ids };
}

// The button's text: "Categoria", "Categoria: Moradia", "Categoria: Moradia +1",
// "Categoria: exceto Investimento +4". A phone shows only what comes after the colon.
export function pickLabel(label: string, pick: Pick, options: Option[], short = false): string {
  if (pick.ids.length === 0) return label;
  const first = options.find((o) => o.id === pick.ids[0])?.name ?? '…';
  const more = pick.ids.length > 1 ? ` +${pick.ids.length - 1}` : '';
  const names = `${first}${more}`;
  if (short) return pick.exclude ? `Exceto ${names}` : names;
  return `${label}: ${pick.exclude ? 'exceto ' : ''}${names}`;
}

// ── period: a month, everything, or the days between two dates ─────────────

export type PeriodKind = 'month' | 'all' | 'range';

export const PERIODS: { id: PeriodKind; name: string }[] = [
  { id: 'month', name: 'Mês' },
  { id: 'all', name: 'Todo o período' },
  { id: 'range', name: 'Entre datas' },
];

// The typed De/Até ("28/11/2026") as days for the API. An empty field leaves that side
// open; a wrong one, or De after Até, gives the error to show instead of asking.
export function rangeOf(
  fromText: string,
  toText: string,
): { from: string | null; to: string | null; error: string | null } {
  const side = (text: string) => (text.trim() === '' ? null : parseDate(text));
  const from = side(fromText);
  const to = side(toText);
  const bad = (text: string, day: string | null) => text.trim() !== '' && day === null;
  if (bad(fromText, from) || bad(toText, to)) {
    return { from: null, to: null, error: 'Data inválida (ex.: 28/11/2026).' };
  }
  if (from && to && from > to) {
    return { from: null, to: null, error: 'A data inicial é depois da final.' };
  }
  return { from, to, error: null };
}

export const TYPE_OPTIONS: Option[] = [
  { id: 'out', name: 'Gastos' },
  { id: 'in', name: 'Entradas' },
];

// The currencies the family's accounts are in, once each.
export function currencyOptions(accounts: Account[] | undefined): Option[] {
  const seen = [...new Set((accounts ?? []).map((a) => a.currency))];
  return seen.map((c) => ({ id: c, name: c }));
}

// ── what the list asks for ────────────────────────────────────────────────

// Transfers between the family's own accounts stay out of the list unless asked for.
export const LIST_KINDS: TxKind[] = ['regular', 'investment'];
export const ALL_KINDS: TxKind[] = ['regular', 'investment', 'transfer', 'pending'];

// What the list asks for besides the filters: the month (null for a free period or all of
// it), which kinds of line and the order.
export interface ListView {
  month: string | null;
  kinds: TxKind[];
  sort: TxSort;
}

// ── order ────────────────────────────────────────────────────────────────────

export type SortColumn = 'description' | 'amount';

// Clicking a column header: ascending, then descending, then back to by day.
export function nextSort(current: TxSort, column: SortColumn): TxSort {
  if (current === column) return `-${column}`;
  if (current === `-${column}`) return 'date';
  return column;
}

// The arrow beside a header while the list is sorted by it.
export function sortArrow(current: TxSort, column: SortColumn): string {
  if (current === column) return ' ↑';
  if (current === `-${column}`) return ' ↓';
  return '';
}

// The phone has no headers to click, so the same orders come in a menu.
export const SORT_OPTIONS: { id: TxSort; name: string }[] = [
  { id: 'date', name: 'Por dia' },
  { id: 'amount', name: 'Maiores gastos' },
  { id: '-amount', name: 'Maiores entradas' },
  { id: 'description', name: 'De A a Z' },
  { id: '-description', name: 'De Z a A' },
];

// What each day of the list adds up to (spending and income, transfers out), ready to show.
export function dayTotals(t: CurrencyTotals | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of t?.days ?? []) out[d.date] = money(d.total, t!.currency, true);
  return out;
}

// Lines with no category; the server filters them by this word.
export const NO_CATEGORY_ID = 'none';
export const NO_CATEGORY = 'Sem categoria';

// Transfers show with their own switch, so they are not a category to filter the list by.
// Lines with no category close the list.
export function categoryOptions(categories: Category[] | undefined): Option[] {
  return [
    ...(categories ?? [])
      .filter((c) => c.kind !== 'transfer')
      .map(({ id, name }) => ({ id, name })),
    { id: NO_CATEGORY_ID, name: NO_CATEGORY },
  ];
}

export function accountOptions(accounts: Account[] | undefined): Option[] {
  return (accounts ?? []).map(({ id, name }) => ({ id, name }));
}

// Each bank of the family's accounts once; a bank is filtered by its name.
export function bankOptions(accounts: Account[] | undefined): Option[] {
  const banks = [...new Set((accounts ?? []).map((a) => a.bank))].sort((a, b) =>
    a.localeCompare(b),
  );
  return banks.map((b) => ({ id: b, name: b }));
}

// Each person, then the household ("Casa"), whose lines have no member.
export function memberOptions(members: Member[] | undefined): Option[] {
  return [
    ...(members ?? []).map(({ id, name }) => ({ id, name })),
    { id: HOUSEHOLD_ID, name: HOUSEHOLD },
  ];
}

// ── totals of what the list shows ────────────────────────────────────────────

export type GroupBy = 'categories' | 'members' | 'accounts';

export const GROUP_BY: { value: GroupBy; label: string }[] = [
  { value: 'categories', label: 'Categoria' },
  { value: 'members', label: 'Responsável' },
  { value: 'accounts', label: 'Conta' },
];

// How many groups show before "Ver todos": two lines of three on a computer, fewer on a
// phone so the list still starts near the top.
export const GROUPS_SHOWN = 6;
export const GROUPS_SHOWN_PHONE = 4;

export function countText(n: number): string {
  return n === 1 ? '1 transação' : `${n} transações`;
}

// Entradas, saídas and the balance of the lines on screen, ready to show.
export function totalsFigures(t: CurrencyTotals) {
  return {
    income: money(t.income, t.currency, true),
    spending: money(t.spending, t.currency),
    balance: money(t.balance, t.currency, true),
    count: countText(t.count),
    // Green only when there is income; R$ 0,00 stays plain.
    hasIncome: Number(t.income) > 0,
  };
}

// Investments count by their net (put in beyond what came back); when money also came
// back, the gross amounts behind that net are said apart, so nothing looks lost.
export function investedText(
  g: { invested_in: string; invested_out: string },
  currency: Currency,
): string | null {
  if (Number(g.invested_out) <= 0) return null;
  return `aplicado ${money(g.invested_in, currency)}  ·  resgatado ${money(g.invested_out, currency)}`;
}

export type GroupRow = {
  key: string;
  name: string;
  spending: string | null;
  income: string | null;
  // The net shown when neither is set (what went in came back exactly).
  zero: string;
  // "aplicado … · resgatado …" when an investment also had money come back.
  invested: string | null;
  count: string;
  // Bar length against the biggest group; income-only groups get the income colour.
  width: `${number}%`;
  incomeOnly: boolean;
};

// The lines on screen added up by the chosen dimension, biggest spending first. Bar widths
// are only a picture of the share, so Number() is fine here; amounts stay as sent.
export function groupRows(
  t: CurrencyTotals,
  by: GroupBy,
  all: boolean,
  keep = GROUPS_SHOWN,
): { rows: GroupRow[]; hidden: number } {
  const groups = t[by];
  const size = (g: (typeof groups)[number]) => Math.max(Number(g.spending), Number(g.income));
  const top = Math.max(...groups.map(size), 0);
  const shown = all ? groups : groups.slice(0, keep);
  return {
    hidden: groups.length - shown.length,
    rows: shown.map((g) => ({
      key: g.id ?? `none-${g.name}`,
      name: g.name,
      spending: Number(g.spending) > 0 ? money(g.spending, t.currency) : null,
      income: Number(g.income) > 0 ? money(g.income, t.currency, true) : null,
      zero: money('0', t.currency),
      invested: investedText(g, t.currency),
      count: countText(g.count),
      width: `${top > 0 ? (size(g) / top) * 100 : 0}%`,
      incomeOnly: Number(g.spending) === 0,
    })),
  };
}

export function emptyListText(filtered: boolean, period: PeriodKind = 'month'): string {
  if (filtered) return 'Nada encontrado com esses filtros.';
  return period === 'month' ? 'Nenhum gasto ou entrada neste mês.' : 'Nenhum gasto ou entrada.';
}

// What a line that only moved money is called: its category when it has one ("Pago de
// Cartão de Crédito" says the money paid a bill), otherwise the generic name.
export function movedLabel(t: Transaction, generic: string): string {
  return t.kind === 'transfer' && t.category_name ? t.category_name : generic;
}
