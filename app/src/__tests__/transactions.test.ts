import { describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';

import {
  accountOptions,
  categoryOptions,
  emptyListText,
  isFiltered,
  pagedItems,
  remaining,
  transferLine,
} from '@/lib/transactions';
import type { Account, Category, Transaction, Transfer } from '@/lib/types';
import { useDebounced, useTabFromLink } from '@/lib/useTransactionsPage';

const tx = (id: string) => ({ id }) as Transaction;

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
    const none = { q: '  ', categoryId: null, accountId: null };
    expect(isFiltered(none)).toBe(false);
    expect(isFiltered({ ...none, q: 'uber' })).toBe(true);
    expect(isFiltered({ ...none, categoryId: 'c' })).toBe(true);
    expect(isFiltered({ ...none, accountId: 'a' })).toBe(true);
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
