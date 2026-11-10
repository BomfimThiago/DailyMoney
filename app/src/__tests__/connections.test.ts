import { expect, test } from '@jest/globals';
import { daysUntil, summary, when } from '@/lib/connections';
import type { SyncResult } from '@/lib/types';

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
