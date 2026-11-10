import { monthLabel, shiftMonth } from './format';

// Below this width the app uses the phone layout (bottom tabs, one column).
export const WIDE_MIN = 900;
export const SIDEBAR_WIDTH = 232;

// Running total of a per-day list (index 0 is day 1).
export function cumulative(daily: string[]): number[] {
  let total = 0;
  return daily.map((v) => (total += Number(v)));
}

// The last day of `month` that has already happened: today in the current month,
// the whole month for past months, none for future ones.
export function paceDay(month: string, days: number, today = new Date()): number {
  const current = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  if (month === current) return Math.min(today.getDate(), days);
  return month < current ? days : 0;
}

// Spending up to `day` against the month before up to the same day, as a fraction
// (-0.13 is 13% less). null when the month before has nothing to compare with.
export function paceChange(daily: string[], previous: string[], day: number): number | null {
  if (day <= 0 || previous.length === 0) return null;
  const now = cumulative(daily)[day - 1] ?? 0;
  const before = cumulative(previous)[Math.min(day, previous.length) - 1] ?? 0;
  if (before === 0) return null;
  return (now - before) / before;
}

// "13% a menos que outubro" for the Gastos figure.
export function paceSentence(change: number | null, month: string): string | null {
  if (change === null) return null;
  const before = monthLabel(shiftMonth(month, -1)).split(' ')[0].toLowerCase();
  const pct = Math.round(Math.abs(change) * 100);
  if (pct === 0) return `igual a ${before}`;
  return `${pct}% a ${change < 0 ? 'menos' : 'mais'} que ${before}`;
}

// Weeks of the month, Sunday first, with null where a week spills into another month.
export function calendarWeeks(month: string): (number | null)[][] {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1).getDay();
  const days = new Date(y, m, 0).getDate();
  const cells: (number | null)[] = [
    ...Array<null>(first).fill(null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];
  while (cells.length % 7) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

// Chart axis labels: "800", "2 mil", "12 mil".
export function axisLabel(value: number): string {
  if (value < 1000) return String(Math.round(value));
  const k = value / 1000;
  return `${Number.isInteger(k) ? k : k.toFixed(1).replace('.', ',')} mil`;
}

// A round step so the chart gets 2 or 3 gridlines above zero.
export function niceMax(value: number): { max: number; step: number } {
  if (value <= 0) return { max: 100, step: 50 };
  const raw = value / 3;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * pow).find((s) => s >= raw) ?? 10 * pow;
  return { max: Math.ceil(value / step) * step, step };
}

// Top entries plus the rest summed into one line, so the list stays short.
export function topShares<T extends { name: string; amount: string }>(
  items: T[],
  keep = 6,
): { name: string; amount: number }[] {
  const rows = items.map((i) => ({ name: i.name, amount: Number(i.amount) }));
  if (rows.length <= keep) return rows;
  const rest = rows.slice(keep - 1).reduce((s, r) => s + r.amount, 0);
  return [...rows.slice(0, keep - 1), { name: 'Demais', amount: rest }];
}
