import { fullDate } from './format';
import type { Account, Connection, SyncResult } from './types';

// An authorization this close to its end gets a warning.
export const WARN_DAYS = 14;

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

// Account id → the bank that sends its transactions on its own.
export function automaticAccounts(connections: Connection[]): Map<string, string> {
  const automatic = new Map<string, string>();
  for (const c of connections) {
    for (const a of c.accounts) if (a.account_id) automatic.set(a.account_id, c.bank);
  }
  return automatic;
}

export function connectedAccounts(c: Connection): string {
  return c.accounts.length === 0
    ? 'Nenhuma conta lida ainda'
    : c.accounts.map((a) => a.name).join(' · ');
}

export function providerName(c: Connection): string {
  return c.provider === 'pluggy' ? 'Meu Pluggy' : 'Enable Banking';
}

// "Atualizado hoje às 06:00 · autorizado até 10/02/2027"
export function statusLine(c: Connection, now = new Date()): string {
  const synced = c.last_sync_at
    ? `Atualizado ${when(c.last_sync_at, now)}`
    : 'Ainda não sincronizado';
  if (!c.consent_expires_at) return synced;
  return `${synced} · autorizado até ${fullDate(localDay(c.consent_expires_at))}`;
}

// A warning once the authorization is about to end or has ended; null otherwise.
export function expiryWarning(c: Connection, now = Date.now()): string | null {
  if (!c.consent_expires_at) return null;
  const days = daysUntil(c.consent_expires_at, now);
  if (days > WARN_DAYS) return null;
  if (days <= 0)
    return 'A autorização venceu. Conecte de novo para continuar recebendo as transações.';
  return `A autorização vence em ${days} ${days === 1 ? 'dia' : 'dias'}.`;
}

// Only Enable Banking connections are authorized from here, so only they reconnect here.
export function canReconnect(c: Connection, now = Date.now()): boolean {
  return c.provider === 'enablebanking' && (!!c.last_error || expiryWarning(c, now) !== null);
}

// "Nubank · BRL · Conta": the bank only adds something when the name doesn't say it.
export function accountDetails(account: Account): string {
  const bank =
    account.bank && !account.name.toLowerCase().includes(account.bank.toLowerCase())
      ? account.bank
      : null;
  return [bank, account.currency, account.is_card ? 'Cartão' : 'Conta'].filter(Boolean).join(' · ');
}
