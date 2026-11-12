// What Início derives from the month summary, kept apart from the page for tests.
import type { Currency, CurrencySummary, MonthSummary } from './types';

// The chosen currency if the month has it, otherwise the first one.
export function shownCurrency(
  summary: MonthSummary | null,
  chosen: Currency | null,
): CurrencySummary | null {
  if (!summary) return null;
  return summary.currencies.find((c) => c.currency === chosen) ?? summary.currencies[0] ?? null;
}

// Nothing was ever uploaded: Início invites the first statement instead of showing zeros.
export function hasNoAccounts(summary: MonthSummary | null): boolean {
  return summary !== null && summary.currencies.length === 0;
}

export function pendingLabel(count: number): string {
  return count === 1 ? '1 transferência para confirmar' : `${count} transferências para confirmar`;
}

export function firstName(name: string): string {
  return name.split(' ')[0];
}
