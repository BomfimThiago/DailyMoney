// What the transactions page derives from its answers, kept apart from the page for tests.
import { dayMonth, money } from './format';
import type { Account, Category, Transaction, TransactionPage, Transfer } from './types';

export type Option = { id: string; name: string };

export function pagedItems(pages: TransactionPage[] | undefined): Transaction[] | null {
  return pages ? pages.flatMap((p) => p.items) : null;
}

// How many lines the server still has after the ones already shown.
export function remaining(pages: TransactionPage[] | undefined): number {
  if (!pages?.length) return 0;
  const shown = pages.reduce((n, p) => n + p.items.length, 0);
  return pages[pages.length - 1].total - shown;
}

export function isFiltered(f: { q: string; categoryId: string | null; accountId: string | null }) {
  return f.q.trim() !== '' || f.categoryId !== null || f.accountId !== null;
}

// Transfers have their own tab, so they are not a category to filter the list by.
export function categoryOptions(categories: Category[] | undefined): Option[] {
  return (categories ?? [])
    .filter((c) => c.kind !== 'transfer')
    .map(({ id, name }) => ({ id, name }));
}

export function accountOptions(accounts: Account[] | undefined): Option[] {
  return (accounts ?? []).map(({ id, name }) => ({ id, name }));
}

export function emptyListText(filtered: boolean): string {
  return filtered ? 'Nada encontrado com esses filtros.' : 'Nenhum gasto ou entrada neste mês.';
}

const TRANSFER_SUB: Record<Transfer['kind'], (t: Transfer) => string> = {
  exchange: (t) => `Câmbio · ${dayMonth(t.date)}`,
  pair: (t) => `${dayMonth(t.date)} · as duas pontas encontradas`,
  single: (t) => `${dayMonth(t.date)} · ${t.description}`,
};

// A matched transfer: "Wise → Nubank", when and how it was found, and what arrived in the
// other currency after an exchange.
export function transferLine(t: Transfer): { title: string; sub: string; arrived: string | null } {
  return {
    title: `${t.from_account ?? 'outra conta'} → ${t.to_account ?? 'outra conta'}`,
    sub: TRANSFER_SUB[t.kind](t),
    arrived: t.to_amount && t.to_currency ? money(t.to_amount, t.to_currency) : null,
  };
}
