import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import CardsScreen from '@/app/(tabs)/cartoes';
import { useAuth } from '@/lib/auth';
import { useBillPurchases, useCardBills } from '@/lib/queries';
import type { CardBills, Transaction } from '@/lib/types';

jest.mock('expo-router', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Redirect: ({ href }: { href: string }) => <Text>{`redirect ${href}`}</Text>,
    Link: ({ children }: { children: string }) => <Text>{children}</Text>,
  };
});
jest.mock('@/lib/auth', () => ({ useAuth: jest.fn() }));
jest.mock('@/lib/displayCurrency', () => ({
  ...jest.requireActual<typeof import('@/lib/displayCurrency')>('@/lib/displayCurrency'),
  useDisplayCurrency: () => ({ currency: 'BRL', setCurrency: jest.fn() }),
}));
jest.mock('@/lib/queries', () => ({ useCardBills: jest.fn(), useBillPurchases: jest.fn() }));

const card: CardBills = {
  account_id: 'a-card',
  account_name: 'Nubank cartão',
  bank: 'Nubank',
  currency: 'BRL',
  bill: { month: '2026-11', total: '450.00', count: 1 },
  next: { month: '2026-12', total: '80.00', count: 0 },
  payments: [{ date: '2026-11-10', amount: '450.00' }],
  paid: '450.00',
  status: 'paid',
  months: ['2026-11'],
};

const sofa: Transaction = {
  id: 't1',
  date: '2026-10-25',
  description: 'Loja de sofás',
  amount: '-300.0000',
  currency: 'BRL',
  kind: 'regular',
  account_id: 'a-card',
  account_name: 'Nubank cartão',
  category_id: null,
  category_name: 'Casa',
  member_id: null,
  review: 'approved',
  card_bill: '2026-11',
  installment: '3/10',
};

function answer(cards: CardBills[]) {
  jest.mocked(useCardBills).mockReturnValue({
    data: { month: '2026-11', bills_known: cards.length > 0, cards },
    isError: false,
  } as unknown as ReturnType<typeof useCardBills>);
  jest.mocked(useBillPurchases).mockReturnValue({
    data: { total: 1, items: [sofa] },
    isError: false,
  } as unknown as ReturnType<typeof useBillPurchases>);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(useAuth)
    .mockReturnValue({ state: { status: 'signedIn', me: {} } } as ReturnType<typeof useAuth>);
});

describe('Cartões', () => {
  it('shows the bill, whether it was paid, the next one and the purchases', async () => {
    answer([card]);
    await render(<CardsScreen />);
    expect(screen.getByText('NUBANK CARTÃO')).toBeTruthy();
    expect(screen.getByText('Paga em 10 nov')).toBeTruthy();
    expect(screen.getByText('Próxima fatura · dezembro')).toBeTruthy();
    expect(screen.getByText(/parcela 3\/10/)).toBeTruthy();
    expect(useBillPurchases).toHaveBeenLastCalledWith('a-card', '2026-11', true);

    await fireEvent.press(screen.getByRole('tab', { name: 'Próxima (dezembro)' }));
    expect(screen.getByText('Nenhuma compra nesta fatura.')).toBeTruthy();
  });

  it('says how bills show up when there is none', async () => {
    answer([]);
    await render(<CardsScreen />);
    expect(screen.getByText(/Nenhuma fatura ainda/)).toBeTruthy();
  });
});
