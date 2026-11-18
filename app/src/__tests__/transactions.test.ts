import { describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';

import {
  accountOptions,
  categoryOptions,
  countText,
  currencyOptions,
  dayTotals,
  emptyListText,
  groupRows,
  GROUPS_SHOWN,
  isFiltered,
  memberOptions,
  nextSort,
  NO_FILTERS,
  rangeOf,
  sortArrow,
  totalsFigures,
  pagedItems,
  remaining,
  transferLine,
} from '@/lib/transactions';
import type {
  Account,
  Category,
  CurrencyTotals,
  GroupTotal,
  Member,
  Transaction,
  Transfer,
} from '@/lib/types';
import { useDebounced, useTabFromLink } from '@/lib/useTransactionsPage';

const tx = (id: string) => ({ id }) as Transaction;

const group = (name: string, spending: string, income = '0', count = 1): GroupTotal => ({
  id: name === 'Casa' ? null : `id-${name}`,
  name,
  spending,
  income,
  count,
});

const totals = (categories: GroupTotal[]): CurrencyTotals => ({
  currency: 'BRL',
  income: '5300.0000',
  spending: '1350.0000',
  balance: '3950.0000',
  count: 5,
  categories,
  members: [group('Casa', '200')],
  accounts: [],
  days: [],
});

describe('totals of what the list shows', () => {
  it('shows entradas, saídas, the balance and how many lines', () => {
    const f = totalsFigures(totals([]));
    expect(f.income).toBe('+R$\u00a05.300,00');
    expect(f.spending).toBe('R$\u00a01.350,00');
    expect(f.balance).toBe('+R$\u00a03.950,00');
    expect(f.count).toBe('5 transações');
    expect(f.hasIncome).toBe(true);
    expect(totalsFigures({ ...totals([]), income: '0' }).hasIncome).toBe(false);
    expect(countText(1)).toBe('1 transação');
  });

  it('groups by the chosen dimension, bars against the biggest group', () => {
    const t = totals([
      group('Moradia', '1000', '0', 2),
      group('Mercado', '250'),
      group('Salário', '0', '5000'),
    ]);
    const { rows, hidden } = groupRows(t, 'categories', false);
    expect(hidden).toBe(0);
    expect(rows.map((r) => [r.name, r.spending, r.income, r.width])).toEqual([
      ['Moradia', 'R$\u00a01.000,00', null, '20%'],
      ['Mercado', 'R$\u00a0250,00', null, '5%'],
      ['Salário', null, '+R$\u00a05.000,00', '100%'],
    ]);
    expect(rows[0].count).toBe('2 transações');
    expect(rows[2].incomeOnly).toBe(true);
    const [casa] = groupRows(t, 'members', false).rows;
    expect([casa.key, casa.name]).toEqual(['none-Casa', 'Casa']);
  });

  it('shows the first groups and tells how many more there are', () => {
    const many = Array.from({ length: GROUPS_SHOWN + 3 }, (_, i) =>
      group(`G${i}`, String(100 - i)),
    );
    expect(groupRows(totals(many), 'categories', false)).toMatchObject({ hidden: 3 });
    expect(groupRows(totals(many), 'categories', true).rows).toHaveLength(GROUPS_SHOWN + 3);
    expect(groupRows(totals([]), 'accounts', false)).toEqual({ rows: [], hidden: 0 });
  });

  it('offers each person and then the household as Responsável', () => {
    const people = [{ id: 'm1', name: 'Thiago' }] as Member[];
    expect(memberOptions(people)).toEqual([
      { id: 'm1', name: 'Thiago' },
      { id: 'casa', name: 'Casa' },
    ]);
    expect(memberOptions(undefined)).toEqual([{ id: 'casa', name: 'Casa' }]);
  });
});

describe('transaction pages', () => {
  it('joins the loaded pages and counts what is left', () => {
    const pages = [
      { total: 5, items: [tx('a'), tx('b')] },
      { total: 5, items: [tx('c')] },
    ];
    expect(pagedItems(pages)?.map((t) => t.id)).toEqual(['a', 'b', 'c']);
    expect(pagedItems(undefined)).toBeNull();
    expect(remaining(pages)).toBe(2);
    expect(remaining(undefined)).toBe(0);
    expect(remaining([])).toBe(0);
  });

  it('knows when a search or a filter is on', () => {
    const none = { q: '  ', ...NO_FILTERS };
    expect(isFiltered(none)).toBe(false);
    expect(isFiltered({ ...none, q: 'uber' })).toBe(true);
    expect(isFiltered({ ...none, categoryId: 'c' })).toBe(true);
    expect(isFiltered({ ...none, accountId: 'a' })).toBe(true);
    expect(isFiltered({ ...none, memberId: 'casa' })).toBe(true);
    expect(isFiltered({ ...none, direction: 'out' })).toBe(true);
    expect(isFiltered({ ...none, accountCurrency: 'EUR' })).toBe(true);
    expect(emptyListText(false, 'all')).toBe('Nenhum gasto ou entrada.');
    expect(emptyListText(true)).toBe('Nada encontrado com esses filtros.');
    expect(emptyListText(false)).toBe('Nenhum gasto ou entrada neste mês.');
  });

  it('offers categories without transfers, and every account', () => {
    const cats = [
      { id: '1', name: 'Mercado', kind: 'expense' },
      { id: '2', name: 'Transferência', kind: 'transfer' },
    ] as Category[];
    expect(categoryOptions(cats)).toEqual([{ id: '1', name: 'Mercado' }]);
    expect(categoryOptions(undefined)).toEqual([]);
    expect(accountOptions([{ id: 'a', name: 'Nubank' } as Account])).toEqual([
      { id: 'a', name: 'Nubank' },
    ]);
    expect(accountOptions(undefined)).toEqual([]);
  });
});

describe('transaction page hooks', () => {
  it('settles a typed value after the pause', async () => {
    jest.useFakeTimers();
    const { result, rerender } = await renderHook(({ v }: { v: string }) => useDebounced(v, 300), {
      initialProps: { v: 'a' },
    });
    await rerender({ v: 'ab' });
    expect(result.current).toBe('a');
    await act(() => jest.advanceTimersByTime(300));
    expect(result.current).toBe('ab');
    jest.useRealTimers();
  });

  it('opens transfers when a link asks for them', async () => {
    const { result, rerender } = await renderHook(
      ({ aba }: { aba?: string }) => useTabFromLink(aba),
      {
        initialProps: { aba: undefined as string | undefined },
      },
    );
    expect(result.current[0]).toBe('lista');
    await rerender({ aba: 'outra' });
    expect(result.current[0]).toBe('lista');
    await rerender({ aba: 'transferencias' });
    expect(result.current[0]).toBe('transferencias');
    const opened = await renderHook(() => useTabFromLink('transferencias'));
    expect(opened.result.current[0]).toBe('transferencias');
  });
});

describe('transferLine', () => {
  const t: Transfer = {
    id: 't1',
    date: '2026-11-08',
    description: 'Pix',
    from_account: 'Nubank',
    to_account: null,
    amount: '100.0000',
    currency: 'BRL',
    to_amount: null,
    to_currency: null,
    kind: 'single',
  };

  it('names both ends and says how it was found', () => {
    expect(transferLine(t)).toEqual({
      title: 'Nubank → outra conta',
      sub: '8 nov · Pix',
      arrived: null,
    });
    expect(transferLine({ ...t, from_account: null, kind: 'pair' }).sub).toBe(
      '8 nov · as duas pontas encontradas',
    );
  });

  it('shows what arrived after an exchange', () => {
    const line = transferLine({ ...t, kind: 'exchange', to_amount: '18.0000', to_currency: 'EUR' });
    expect(line.sub).toBe('Câmbio · 8 nov');
    expect(line.arrived).toMatch(/18,00/);
  });
});

describe('period, order and the extra filters', () => {
  it('turns the typed De/Até into days, or says what is wrong', () => {
    expect(rangeOf('01/10/2026', '15/10/2026')).toEqual({
      from: '2026-10-01',
      to: '2026-10-15',
      error: null,
    });
    expect(rangeOf('', '15/10/2026')).toEqual({ from: null, to: '2026-10-15', error: null });
    expect(rangeOf('  ', '')).toEqual({ from: null, to: null, error: null });
    expect(rangeOf('31/02/2026', '').error).toBe('Data inválida (ex.: 28/11/2026).');
    expect(rangeOf('15/10/2026', '01/10/2026').error).toBe('A data inicial é depois da final.');
  });

  it('cycles a column header: ascending, descending, back to by day', () => {
    expect(nextSort('date', 'amount')).toBe('amount');
    expect(nextSort('amount', 'amount')).toBe('-amount');
    expect(nextSort('-amount', 'amount')).toBe('date');
    expect(nextSort('-amount', 'description')).toBe('description');
    expect(sortArrow('description', 'description')).toBe(' ↑');
    expect(sortArrow('-description', 'description')).toBe(' ↓');
    expect(sortArrow('amount', 'description')).toBe('');
  });

  it("offers each account currency once and shows each day's total", () => {
    const accounts = [
      { id: 'a', currency: 'BRL' },
      { id: 'b', currency: 'EUR' },
      { id: 'c', currency: 'BRL' },
    ] as Account[];
    expect(currencyOptions(accounts)).toEqual([
      { id: 'BRL', name: 'BRL' },
      { id: 'EUR', name: 'EUR' },
    ]);
    expect(currencyOptions(undefined)).toEqual([]);
    const t = { ...totals([]), days: [{ date: '2026-10-03', total: '-200.0000' }] };
    expect(dayTotals(t)).toEqual({ '2026-10-03': '-R$\u00a0200,00' });
    expect(dayTotals(undefined)).toEqual({});
  });
});
