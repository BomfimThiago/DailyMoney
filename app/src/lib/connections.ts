import { fullDate } from './format';
import type { SyncResult } from './types';

// One line per account after reading a bank: what arrived and what was already there.
export function summary(r: SyncResult): string {
  const parts = r.accounts.map((a) => {
    if (a.new === 0 && a.error) return `${a.name}: ${a.error}`;
    const news = a.new === 0 ? 'nada novo' : `${a.new} ${a.new === 1 ? 'nova' : 'novas'}`;
    return a.duplicate ? `${a.name}: ${news}, ${a.duplicate} já existiam` : `${a.name}: ${news}`;
  });
  return parts.length ? parts.join(' · ') : 'Nenhuma conta para ler.';
}

export function localDay(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function daysUntil(iso: string, now = Date.now()): number {
  return Math.ceil((new Date(iso).getTime() - now) / 86_400_000);
}

export function when(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const today = now;
  const yesterday = new Date(today.getTime() - 86_400_000);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return `hoje às ${time}`;
  if (same(d, yesterday)) return `ontem às ${time}`;
  return `em ${fullDate(localDay(iso))} às ${time}`;
}
