import { dayMonth, money, monthLabel, shiftMonth, shortMonth } from './format';
import type { Currency, CurrencyAnalysis } from './types';

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

// The currency to show: the chosen one, else the first with spending; null when the
// period has no spending at all in it, so the page can say so instead of empty cards.
export function shownAnalysis(
  currencies: CurrencyAnalysis[],
  chosen: Currency | null,
): CurrencyAnalysis | null {
  const a = currencies.find((c) => c.currency === chosen) ?? firstWithSpending(currencies);
  return a && a.months.some((m) => Number(m.amount) > 0) ? a : null;
}

// Bar height in points: any spending shows at least a sliver.
export function barHeight(value: number, top: number, height: number): number {
  return Math.max((value / top) * height, value > 0 ? 3 : 0);
}

// One line of "O que mais mudou": a bar from the middle, right when up, left when down.
export function changeRows(changes: CurrencyAnalysis['changes']) {
  const rows = changes.map((c) => ({ ...c, change: changeOf(c.amount, c.average) }));
  const widest = Math.max(...rows.map((r) => Math.abs(r.change ?? 0)), 0.01);
  return rows.map((r) => ({
    name: r.name,
    up: (r.change ?? 1) >= 0,
    width: r.change === null ? 50 : (Math.abs(r.change) / widest) * 50,
    label: r.change === null ? 'novo' : percent(r.change),
  }));
}

// "R$ 12,50 por vez · Padaria"
export function habitDetail(h: CurrencyAnalysis['habits'][number], currency: Currency): string {
  const each = money(String(Number(h.total) / h.count), currency);
  return h.category ? `${each} por vez · ${h.category}` : `${each} por vez`;
}

// "3 cobranças, cerca de R$ 90,00 por mês (R$ 1.080,00 por ano)."
export function recurringSentence(a: CurrencyAnalysis): string | undefined {
  const n = a.recurring.length;
  if (n === 0) return undefined;
  const count = n === 1 ? '1 cobrança' : `${n} cobranças`;
  const year = money(String(Number(a.recurring_total) * 12), a.currency);
  return `${count}, cerca de ${money(a.recurring_total, a.currency)} por mês (${year} por ano).`;
}

export function recurringDetail(r: CurrencyAnalysis['recurring'][number]): string {
  return [r.category, `última em ${dayMonth(r.last_date)}`].filter(Boolean).join(' · ');
}
