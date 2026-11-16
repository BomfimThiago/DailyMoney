import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { MonthStartPicker } from '@/components/settings/MonthStartPicker';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { MonthStartProvider, useMonthStart, useMonthState } from '@/lib/monthStart';
import { currentPeriod } from '@/lib/period';

jest.mock('@/lib/auth', () => ({ useAuth: jest.fn() }));
jest.mock('@/lib/api', () => ({ api: jest.fn(() => Promise.resolve({})) }));

const signedIn = (month_start_day: number) =>
  jest.mocked(useAuth).mockReturnValue({
    state: { status: 'signedIn', me: { family: { month_start_day } } },
  } as unknown as ReturnType<typeof useAuth>);

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  return (
    <QueryClientProvider client={client}>
      <MonthStartProvider>{children}</MonthStartProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  jest.mocked(api).mockClear();
});

describe('month start day', () => {
  it("starts with the family's day and saves a new one", async () => {
    signedIn(5);
    const { result } = await renderHook(() => useMonthStart(), { wrapper });
    expect(result.current.startDay).toBe(5);
    await act(async () => result.current.saveStartDay(27));
    expect(result.current.startDay).toBe(27);
    expect(api).toHaveBeenCalledWith('/family', {
      method: 'PATCH',
      body: JSON.stringify({ month_start_day: 27 }),
    });
  });

  it('goes back to the current month when the start day changes', async () => {
    signedIn(1);
    const { result } = await renderHook(() => ({ s: useMonthStart(), m: useMonthState() }), {
      wrapper,
    });
    await act(async () => result.current.m[1]('2020-01'));
    expect(result.current.m[0]).toBe('2020-01');
    await act(async () => result.current.s.saveStartDay(20));
    expect(result.current.m[0]).toBe(currentPeriod(20));
  });

  it('is the calendar month outside the provider', async () => {
    const { result } = await renderHook(() => useMonthStart());
    expect(result.current.startDay).toBe(1);
  });

  it('picks a day, previews it and saves it', async () => {
    signedIn(1);
    await render(<MonthStartPicker />, { wrapper });
    expect(screen.getByRole('button', { name: 'Salvar início do mês' })).toBeDisabled();
    await fireEvent.press(screen.getByTestId('month-start-27'));
    expect(screen.getByText(/de 27 \w{3} a 26 \w{3}\./)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Salvar início do mês' }));
    expect(api).toHaveBeenCalledWith('/family', {
      method: 'PATCH',
      body: JSON.stringify({ month_start_day: 27 }),
    });
    expect(await screen.findByText('O mês agora começa no dia 27.')).toBeTruthy();
  });

  it('says when saving fails', async () => {
    signedIn(1);
    jest.mocked(api).mockRejectedValueOnce(new Error('offline'));
    await render(<MonthStartPicker />, { wrapper });
    await fireEvent.press(screen.getByTestId('month-start-10'));
    await fireEvent.press(screen.getByRole('button', { name: 'Salvar início do mês' }));
    expect(await screen.findByText('Não consegui salvar. Tente de novo.')).toBeTruthy();
  });
});
