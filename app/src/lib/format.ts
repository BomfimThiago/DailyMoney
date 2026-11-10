import type { Currency } from './types';

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const formatters: Partial<Record<Currency, Intl.NumberFormat>> = {};

// Display only: amounts arrive as decimal strings and are never added up in the app.
export function money(amount: string, currency: Currency, signed = false): string {
  formatters[currency] ??= new Intl.NumberFormat('pt-BR', { style: 'currency', currency });
  const value = Number(amount);
  const text = formatters[currency].format(value);
  return signed && value > 0 ? `+${text}` : text;
}

export function isIncome(amount: string): boolean {
  return Number(amount) > 0;
}

// "YYYY-MM-DD" read as a calendar day, not an instant, so no timezone shift.
function parts(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return { y, m, d };
}

export function shortDate(iso: string): string {
  const { m, d } = parts(iso);
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

export function dayMonth(iso: string): string {
  const { m, d } = parts(iso);
  return `${d} ${MONTHS[m - 1]}`;
}

export function fullDate(iso: string): string {
  const { y, m, d } = parts(iso);
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

export function period(start: string | null, end: string | null): string | null {
  if (!start || !end) return null;
  const a = parts(start);
  const b = parts(end);
  if (start === end) return dayMonth(start);
  if (a.y !== b.y) return `${dayMonth(start)} ${a.y} a ${dayMonth(end)} ${b.y}`;
  if (a.m === b.m) return `${a.d} a ${b.d} ${MONTHS[b.m - 1]}`;
  return `${dayMonth(start)} a ${dayMonth(end)}`;
}

export function addDays(iso: string, days: number): string {
  const { y, m, d } = parts(iso);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

export function daysBetween(start: string, end: string): number {
  const a = parts(start);
  const b = parts(end);
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000);
}

export function initials(name: string): string {
  const text = name.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2);
  return text ? text[0].toUpperCase() + text.slice(1) : '··';
}
