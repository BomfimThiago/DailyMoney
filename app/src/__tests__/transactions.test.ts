import { describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';

import {
  accountOptions,
  categoryOptions,
  emptyListText,
  isFiltered,
  pagedItems,
  remaining,
} from '@/lib/transactions';
import type { Account, Category, Transaction } from '@/lib/types';
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
