import { describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';

import { drillOf, drillParams } from '@/lib/drill';
import {
  accountOptions,
  bankOptions,
  categoryOptions,
  countText,
  currencyOptions,
  dayTotals,
  emptyListText,
  groupRows,
  GROUPS_SHOWN,
  isFiltered,
  NO_PICK,
  pickLabel,
  toggled,
  txFilters,
  memberOptions,
  nextSort,
  NO_FILTERS,
  rangeOf,
  sortArrow,
  totalsFigures,
  pagedItems,
  remaining,
} from '@/lib/transactions';
import type {
  Account,
  Category,
  CurrencyTotals,
  GroupTotal,
  Member,
  Transaction,
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
    expect(isFiltered({ ...none, category: { ids: ['c'], exclude: false } })).toBe(true);
    expect(isFiltered({ ...none, account: { ids: ['a'], exclude: true } })).toBe(true);
    expect(isFiltered({ ...none, member: { ids: ['casa'], exclude: false } })).toBe(true);
    expect(isFiltered({ ...none, bank: { ids: [], exclude: true } })).toBe(false);
    expect(isFiltered({ ...none, direction: 'out' })).toBe(true);
    expect(isFiltered({ ...none, accountCurrency: 'EUR' })).toBe(true);
    expect(emptyListText(false, 'all')).toBe('Nenhum gasto ou entrada.');
    expect(emptyListText(true)).toBe('Nada encontrado com esses filtros.');
    expect(emptyListText(false)).toBe('Nenhum gasto ou entrada neste mês.');
  });

  it('offers categories without transfers (plus "Sem categoria"), accounts and banks', () => {
    const cats = [
      { id: '1', name: 'Mercado', kind: 'expense' },
      { id: '2', name: 'Transferência', kind: 'transfer' },
    ] as Category[];
    const none = { id: 'none', name: 'Sem categoria' };
    expect(categoryOptions(cats)).toEqual([{ id: '1', name: 'Mercado' }, none]);
    expect(categoryOptions(undefined)).toEqual([none]);
    expect(accountOptions([{ id: 'a', name: 'Nubank' } as Account])).toEqual([
      { id: 'a', name: 'Nubank' },
    ]);
    expect(accountOptions(undefined)).toEqual([]);
    const accounts = [
      { id: 'a', bank: 'Nubank' },
      { id: 'b', bank: 'Inter' },
      { id: 'c', bank: 'Nubank' },
    ] as Account[];
    expect(bankOptions(accounts)).toEqual([
      { id: 'Inter', name: 'Inter' },
      { id: 'Nubank', name: 'Nubank' },
    ]);
  });

  it('picks several values to show or to hide, and names the pick on the button', () => {
    const options = [
      { id: 'm', name: 'Moradia' },
      { id: 'a', name: 'Assinaturas' },
    ];
    const one = toggled(NO_PICK, 'm');
    expect(one).toEqual({ ids: ['m'], exclude: false });
    const two = toggled(one, 'a');
    expect(two.ids).toEqual(['m', 'a']);
    expect(toggled(two, 'm').ids).toEqual(['a']);
    expect(pickLabel('Categoria', NO_PICK, options)).toBe('Categoria');
    expect(pickLabel('Categoria', one, options)).toBe('Categoria: Moradia');
    expect(pickLabel('Categoria', two, options)).toBe('Categoria: Moradia +1');
    expect(pickLabel('Categoria', { ...two, exclude: true }, options)).toBe(
      'Categoria: exceto Moradia +1',
    );
    expect(pickLabel('Categoria', two, options, true)).toBe('Moradia +1');
    expect(pickLabel('Categoria', { ...one, exclude: true }, options, true)).toBe('Exceto Moradia');
  });

  it('sends only the dimensions that have a pick', () => {
    const f = {
      q: 'x',
      ...NO_FILTERS,
      category: { ids: ['m', 'a'], exclude: false },
      bank: { ids: ['Nubank'], exclude: true },
      direction: 'out' as const,
    };
    expect(txFilters(f)).toEqual({
      q: 'x',
      direction: 'out',
      accountCurrency: null,
      picks: { category: f.category, bank: f.bank },
    });
  });
});

describe('links from the breakdown on Início', () => {
  it('round-trips a row and "Demais", and ignores broken links', () => {
    const row = drillParams('2026-11', 'categoria', ['c1', 'c2'], false, '7');
    expect(drillOf(row)).toEqual({
      month: '2026-11',
      dim: 'category',
      pick: { ids: ['c1', 'c2'], exclude: false },
    });
    const rest = drillOf(drillParams('2026-11', 'banco', ['Nubank'], true));
    expect(rest).toEqual({
      month: '2026-11',
      dim: 'bank',
      pick: { ids: ['Nubank'], exclude: true },
    });
    expect(drillOf({})).toBeNull();
    expect(drillOf({ ...row, mes: 'nov' })).toBeNull();
    expect(drillOf({ ...row, filtro: 'cor' })).toBeNull();
    expect(drillOf({ ...row, ids: '{' })).toBeNull();
    expect(drillOf({ ...row, ids: '[]' })).toBeNull();
    expect(drillOf({ ...row, ids: '[1]' })).toBeNull();
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
    expect(result.current.tab).toBe('lista');
    expect(result.current.withTransfers).toBe(false);
    await rerender({ aba: 'outra' });
    expect(result.current.withTransfers).toBe(false);
    await rerender({ aba: 'revisar' });
    expect(result.current.tab).toBe('revisar');
    // Transfers are in the list now: the link opens it with them shown.
    await rerender({ aba: 'transferencias' });
    expect(result.current.tab).toBe('lista');
    expect(result.current.withTransfers).toBe(true);
    const opened = await renderHook(() => useTabFromLink('transferencias'));
    expect(opened.result.current.withTransfers).toBe(true);
    const review = await renderHook(() => useTabFromLink('revisar'));
    expect(review.result.current.tab).toBe('revisar');
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
