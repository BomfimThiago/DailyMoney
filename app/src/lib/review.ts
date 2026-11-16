// Imported lines waiting for approval (like the old app's review screen), kept apart
// from the screens for tests.
import { dayMonth } from './format';
import type { ReviewGroup, ReviewQueue, Transaction } from './types';
import { plural, reviewLabel } from './upload';

export { reviewLabel };

// "Extrato nu.csv" or "Revolut · Conta EUR", the way it came in.
export function groupTitle(g: ReviewGroup): string {
  return g.source === 'bank' ? g.label : `Extrato ${g.label}`;
}

// "Sincronizado em 16 nov · 12 transações"
export function groupSub(g: ReviewGroup): string {
  const how = g.source === 'bank' ? 'Sincronizado' : 'Enviado';
  const when = g.imported_at ? `${how} em ${dayMonth(g.imported_at)}` : null;
  const count = plural(g.items.length, '1 transação', (n) => `${n} transações`);
  return [when, count].filter(Boolean).join(' · ');
}

export function reviewItems(queue: ReviewQueue | undefined): Transaction[] {
  return queue?.groups.flatMap((g) => g.items) ?? [];
}

export function approveAllLabel(g: ReviewGroup): string {
  return g.items.length === 1 ? 'Aprovar' : `Aprovar todas (${g.items.length})`;
}
