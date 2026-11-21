import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { CardMonthSetting } from '@/components/settings/CardMonthSetting';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { listAccounts } from '@/lib/imports';
import { billDay } from '@/lib/people';
import type { Account } from '@/lib/types';

jest.mock('@/lib/api', () => ({ api: jest.fn() }));
jest.mock('@/lib/auth', () => ({ useAuth: jest.fn() }));
jest.mock('@/lib/imports', () => ({
  ...jest.requireActual<object>('@/lib/imports'),
  listAccounts: jest.fn(),
}));

const CARD: Account = {
  id: 'card-1',
  name: 'Nubank cartão',
  bank: 'Nubank',
  currency: 'BRL',
  is_card: true,
  member_id: null,
  bill_close_day: null,
  bill_due_day: null,
};

async function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <QueryClientProvider client={client}>
      <CardMonthSetting />
    </QueryClientProvider>,
  );
}

describe('CardMonthSetting', () => {
  beforeEach(() => {
    jest.mocked(api).mockReset();
    jest.mocked(api).mockResolvedValue({} as never);
    jest.mocked(listAccounts).mockResolvedValue([CARD]);
    jest.mocked(useAuth).mockReturnValue({
      state: { status: 'signedIn', me: { family: { card_purchases_by: 'bill' } } },
    } as never);
  });

  it('asks each card for its closing and due days and saves them', async () => {
    await show();
    expect(await screen.findByText('Nubank cartão')).toBeTruthy();
    expect(screen.getByText(/Sem os dois dias/)).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('card-1-close'), '3');
    await fireEvent.changeText(screen.getByTestId('card-1-due'), '10');
    await fireEvent.press(screen.getByText('Salvar'));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith('/accounts/card-1', {
        method: 'PATCH',
        body: JSON.stringify({ bill_close_day: 3, bill_due_day: 10 }),
      }),
    );
  });

  it('switches to counting on the purchase day and hides the days', async () => {
    await show();
    await screen.findByText('Nubank cartão');
    await fireEvent.press(screen.getByTestId('card-month-purchase'));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith('/family', {
        method: 'PATCH',
        body: JSON.stringify({ card_purchases_by: 'purchase' }),
      }),
    );
    await waitFor(() => expect(screen.queryByText('Nubank cartão')).toBeNull());
  });

  it('refuses a day that does not exist', async () => {
    await show();
    await screen.findByText('Nubank cartão');
    await fireEvent.changeText(screen.getByTestId('card-1-close'), '40');
    expect(screen.getByText('Escreva um dia de 1 a 31.')).toBeTruthy();
  });
});

describe('billDay', () => {
  it('reads a day of the month', () => {
    expect(billDay(' 7 ')).toBe(7);
    expect(billDay('31')).toBe(31);
    expect(billDay('0')).toBeNull();
    expect(billDay('32')).toBeNull();
    expect(billDay('')).toBeNull();
    expect(billDay('a')).toBeNull();
  });
});
