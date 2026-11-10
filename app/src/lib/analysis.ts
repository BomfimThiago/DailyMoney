import { dayMonth, money, monthLabel, shiftMonth, shortMonth } from './format';
import type { CurrencyAnalysis } from './types';

// The API sends weekdays Monday first.
export const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const WEEKDAY_NAMES = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];

export const PERIODS = [3, 6, 12] as const;
export type Period = (typeof PERIODS)[number];

// How much `amount` moved from `average`, as a fraction (0.38 is 38% more). null when
// there is nothing to compare with.
export function changeOf(amount: string, average: string | null): number | null {
  const before = Number(average ?? 0);
  if (before === 0) return null;
  return (Number(amount) - before) / before;
}

export function percent(change: number): string {
  const pct = Math.round(Math.abs(change) * 100);
  return `${change < 0 ? '−' : '+'}${pct}%`;
}

// "Outubro ficou 12% acima da média dos meses anteriores (R$ 3.050,00)."
export function monthSentence(a: CurrencyAnalysis, month: string): string {
  const name = monthLabel(month).split(' ')[0];
  const now = a.months[a.months.length - 1]?.amount ?? '0';
  const change = changeOf(now, a.average);
  if (change === null || a.average === null) {
    return 'Ainda não há meses anteriores com gastos para comparar.';
  }
  const avg = money(a.average, a.currency);
  const pct = Math.round(Math.abs(change) * 100);
  if (pct === 0) return `${name} ficou na média dos meses anteriores (${avg}).`;
  return `${name} ficou ${pct}% ${change > 0 ? 'acima' : 'abaixo'} da média dos meses anteriores (${avg}).`;
}

// Index of the costliest weekday, or null when nothing was spent.
export function topWeekday(weekdays: string[]): number | null {
  const values = weekdays.map(Number);
  const max = Math.max(...values, 0);
  return max > 0 ? values.indexOf(max) : null;
}

export function weekdaySentence(a: CurrencyAnalysis): string {
  const top = topWeekday(a.weekdays);
  if (top === null) return 'Nenhum gasto no período.';
  const name = WEEKDAY_NAMES[top];
  const value = money(a.weekdays[top], a.currency);
  return `${name[0].toUpperCase()}${name.slice(1)} é o dia mais caro: ${value} em média, sem contar moradia.`;
}

// "+2 vs set", "igual a set", "−1 vs set".
export function habitTrend(count: number, previous: number, month: string): string {
  const before = shortMonth(shiftMonth(month, -1));
  if (count === previous) return `igual a ${before}`;
  const diff = count - previous;
  return `${diff > 0 ? '+' : '−'}${Math.abs(diff)} vs ${before}`;
}

// "Sábado, 17 out".
export function dayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const weekday = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  const name = WEEKDAY_NAMES[weekday];
  return `${name[0].toUpperCase()}${name.slice(1)}, ${dayMonth(iso)}`;
}

// The currency to open with: the first that has any spending in the period.
export function firstWithSpending(currencies: CurrencyAnalysis[]): CurrencyAnalysis | null {
  return (
    currencies.find((c) => c.months.some((m) => Number(m.amount) > 0)) ?? currencies[0] ?? null
  );
}
