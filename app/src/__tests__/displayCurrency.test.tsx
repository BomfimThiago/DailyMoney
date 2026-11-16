import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { DisplayCurrencyProvider, useDisplayCurrency } from '@/lib/displayCurrency';
import { lineAmounts } from '@/lib/transactions';
import type { Transaction } from '@/lib/types';

jest.mock('@/lib/auth', () => ({ useAuth: jest.fn() }));
jest.mock('@/lib/api', () => ({ api: jest.fn(() => Promise.reject(new Error('offline'))) }));

const signedIn = (display_currency: string) =>
  jest.mocked(useAuth).mockReturnValue({
    state: { status: 'signedIn', me: { family: { display_currency } } },
  } as unknown as ReturnType<typeof useAuth>);

const wrapper = ({ children }: { children: ReactNode }) => (
  <DisplayCurrencyProvider>{children}</DisplayCurrencyProvider>
);

beforeEach(() => {
  jest.mocked(api).mockClear();
});

describe('display currency', () => {
  it("starts with the family's saved choice and keeps a new one even if saving fails", async () => {
    signedIn('EUR');
    const { result } = await renderHook(() => useDisplayCurrency(), { wrapper });
    expect(result.current.currency).toBe('EUR');
    await act(async () => result.current.setCurrency('USD'));
    expect(result.current.currency).toBe('USD');
    expect(api).toHaveBeenCalledWith('/family', {
      method: 'PATCH',
      body: JSON.stringify({ display_currency: 'USD' }),
    });
  });

  it('is BRL before signing in and outside the provider', async () => {
    jest
      .mocked(useAuth)
      .mockReturnValue({ state: { status: 'loading' } } as ReturnType<typeof useAuth>);
    const inside = await renderHook(() => useDisplayCurrency(), { wrapper });
    expect(inside.result.current.currency).toBe('BRL');
    const outside = await renderHook(() => useDisplayCurrency());
    expect(outside.result.current.currency).toBe('BRL');
    outside.result.current.setCurrency('EUR');
    expect(api).not.toHaveBeenCalled();
  });
});

describe('lineAmounts', () => {
  const t = { amount: '-10.0000', currency: 'USD' } as Transaction;
  const plain = (s: string | null) => s?.replace(/\s/g, ' ') ?? null;

  it('keeps the statement amount when nothing was converted', () => {
    const a = lineAmounts(t);
    expect([plain(a.shown), a.original]).toEqual(['-US$ 10,00', null]);
  });

  it('drops the sign for money that only moved', () => {
    const a = lineAmounts({ ...t, display_amount: '-50.0000', display_currency: 'BRL' }, 'plain');
    expect([plain(a.shown), plain(a.original)]).toEqual(['R$ 50,00', 'US$ 10,00']);
  });
});
