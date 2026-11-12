import { expect, test } from '@jest/globals';
import { ApiError, errorText } from '@/lib/api';
import {
  accountDetails,
  automaticAccounts,
  canReconnect,
  connectedAccounts,
  daysUntil,
  expiryWarning,
  providerName,
  statusLine,
  summary,
  when,
} from '@/lib/connections';
import type { Account, SyncResult } from '@/lib/types';

type ConnectedAccount = SyncResult['connection']['accounts'][number];

const base: SyncResult['connection'] = {
  id: '1',
  provider: 'enablebanking',
  bank: 'Wise',
  accounts: [],
  consent_expires_at: null,
  last_sync_at: null,
  last_error: null,
};

test('sync summary says what arrived per account', () => {
  const r: SyncResult = {
    connection: base,
    accounts: [
      { name: 'Wise EUR', new: 1, duplicate: 0, error: null },
      { name: 'Wise USD', new: 3, duplicate: 2, error: null },
      { name: 'Wise BRL', new: 0, duplicate: 0, error: null },
      { name: 'Cartão', new: 0, duplicate: 0, error: 'A autorização venceu.' },
    ],
  };
  expect(summary(r)).toBe(
    'Wise EUR: 1 nova · Wise USD: 3 novas, 2 já existiam · Wise BRL: nada novo · Cartão: A autorização venceu.',
  );
  expect(summary({ connection: base, accounts: [] })).toBe('Nenhuma conta para ler.');
});

test('days until an authorization ends and when it last synced', () => {
  const now = new Date(2026, 10, 10, 12, 0);
  expect(daysUntil(new Date(2026, 10, 13, 12, 0).toISOString(), now.getTime())).toBe(3);
  expect(when(new Date(2026, 10, 10, 6, 5).toISOString(), now)).toBe('hoje às 06:05');
  expect(when(new Date(2026, 10, 9, 6, 5).toISOString(), now)).toBe('ontem às 06:05');
  expect(when(new Date(2026, 10, 1, 6, 5).toISOString(), now)).toBe('em 01/11/2026 às 06:05');
});

const at = (days: number) => new Date(NOW + days * 86_400_000).toISOString();
const NOW = new Date(2026, 10, 10, 12, 0).getTime();
const account = (o: Partial<ConnectedAccount> = {}): ConnectedAccount => ({
  account_id: 'a1',
  name: 'Wise EUR',
  currency: 'EUR',
  is_card: false,
  ...o,
});

test('lists which accounts arrive by themselves', () => {
  const pluggy = { ...base, bank: 'Nubank', accounts: [account({ account_id: 'a2' })] };
  const wise = { ...base, accounts: [account(), account({ account_id: null })] };
  expect([...automaticAccounts([wise, pluggy]).entries()]).toEqual([
    ['a1', 'Wise'],
    ['a2', 'Nubank'],
  ]);
  expect(connectedAccounts(wise)).toBe('Wise EUR · Wise EUR');
  expect(connectedAccounts(base)).toBe('Nenhuma conta lida ainda');
  expect(providerName(base)).toBe('Enable Banking');
  expect(providerName({ ...base, provider: 'pluggy' })).toBe('Meu Pluggy');
});

test('says when a bank was read and how long it stays authorized', () => {
  const now = new Date(NOW);
  expect(statusLine(base, now)).toBe('Ainda não sincronizado');
  expect(
    statusLine(
      {
        ...base,
        last_sync_at: new Date(2026, 10, 10, 6, 0).toISOString(),
        consent_expires_at: at(90),
      },
      now,
    ),
  ).toBe('Atualizado hoje às 06:00 · autorizado até 08/02/2027');
});

test('warns before the authorization ends and offers to reconnect', () => {
  expect(expiryWarning(base, NOW)).toBeNull();
  expect(expiryWarning({ ...base, consent_expires_at: at(30) }, NOW)).toBeNull();
  expect(expiryWarning({ ...base, consent_expires_at: at(14) }, NOW)).toBe(
    'A autorização vence em 14 dias.',
  );
  expect(expiryWarning({ ...base, consent_expires_at: at(1) }, NOW)).toBe(
    'A autorização vence em 1 dia.',
  );
  expect(expiryWarning({ ...base, consent_expires_at: at(-1) }, NOW)).toMatch(
    /^A autorização venceu/,
  );
  expect(canReconnect(base, NOW)).toBe(false);
  expect(canReconnect({ ...base, last_error: 'Falhou' }, NOW)).toBe(true);
  expect(canReconnect({ ...base, consent_expires_at: at(2) }, NOW)).toBe(true);
  expect(canReconnect({ ...base, provider: 'pluggy', last_error: 'Falhou' }, NOW)).toBe(false);
});

test('describes an account and an error', () => {
  const nubank = {
    id: 'a',
    name: 'Conta',
    bank: 'Nubank',
    currency: 'BRL',
    is_card: false,
  } as Account;
  expect(accountDetails(nubank)).toBe('Nubank · BRL · Conta');
  expect(accountDetails({ ...nubank, name: 'Nubank roxinho', is_card: true })).toBe('BRL · Cartão');
  expect(accountDetails({ ...nubank, bank: '' })).toBe('BRL · Conta');
  expect(errorText(new ApiError(409, 'Já conectado'), 'x')).toBe('Já conectado');
  expect(errorText(new Error('boom'), 'Não deu.')).toBe('Não deu.');
});
