import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';

import TransactionsScreen from '@/app/(tabs)/transacoes';
import { useAuth } from '@/lib/auth';
import { useAccounts, useCategories, useRegular, useTransfers } from '@/lib/queries';
import type { Transaction, TransferOverview } from '@/lib/types';
import { movement } from '@/testing/investments';

jest.mock('expo-router', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Redirect: ({ href }: { href: string }) => <Text>{`redirect ${href}`}</Text>,
    useLocalSearchParams: jest.fn(),
  };
});
jest.mock('@/lib/auth', () => ({ useAuth: jest.fn() }));
const mockRefreshMoney = jest.fn();
jest.mock('@/lib/queries', () => ({
  useRegular: jest.fn(),
  useTransfers: jest.fn(),
  useCategories: jest.fn(),
  useAccounts: jest.fn(),
  useRefreshMoney: () => mockRefreshMoney,
}));
jest.mock('@/components/TxDetail', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return { TxDetail: ({ t }: { t: Transaction }) => <Text>{`detalhe ${t.description}`}</Text> };
});
jest.mock('@/components/Transfers', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return { Transfers: () => <Text>lista de transferências</Text> };
});

const mockAuth = jest.mocked(useAuth);
const mockParams = jest.mocked(useLocalSearchParams);
const mockRegular = jest.mocked(useRegular);
const mockTransfers = jest.mocked(useTransfers);
const mockCategories = jest.mocked(useCategories);
const mockAccounts = jest.mocked(useAccounts);
const fetchNextPage = jest.fn();

const uber = movement({ id: 't1', description: 'Uber', kind: 'regular', amount: '-23.9000' });
const salary = movement({ id: 't2', description: 'Salário', kind: 'regular', amount: '8500' });

type Regular = ReturnType<typeof useRegular>;
const regular = (o: Partial<Regular> = {}) =>
  mockRegular.mockReturnValue({
    data: { pages: [{ total: 3, items: [uber, salary] }], pageParams: [0] },
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage,
    ...o,
  } as unknown as Regular);
const transfers = (o: Partial<ReturnType<typeof useTransfers>> = {}) =>
  mockTransfers.mockReturnValue({
    data: { pending: [{}, {}], transfers: [] } as unknown as TransferOverview,
    isError: false,
    ...o,
  } as ReturnType<typeof useTransfers>);

const wide = () =>
  jest
    .spyOn(jest.requireActual<typeof import('react-native')>('react-native'), 'useWindowDimensions')
    .mockReturnValue({ width: 1440, height: 900, scale: 1, fontScale: 1 });

const lastFilters = () => {
  const calls = mockRegular.mock.calls;
  return calls[calls.length - 1][2];
};

beforeEach(() => {
  jest.restoreAllMocks();
  mockAuth.mockReturnValue({ state: { status: 'signedIn', me: {} } } as ReturnType<typeof useAuth>);
  mockParams.mockReturnValue({});
  regular();
  transfers();
  mockCategories.mockReturnValue({
    data: [
      { id: 'c1', name: 'Transporte', kind: 'expense' },
      { id: 'c2', name: 'Transferência', kind: 'transfer' },
    ],
  } as ReturnType<typeof useCategories>);
  mockAccounts.mockReturnValue({ data: [{ id: 'a1', name: 'Nubank' }] } as ReturnType<
    typeof useAccounts
  >);
});

describe('TransactionsScreen on the phone', () => {
  it('sends signed-out people to login', async () => {
    mockAuth.mockReturnValue({ state: { status: 'signedOut' } } as ReturnType<typeof useAuth>);
    await render(<TransactionsScreen />);
    expect(screen.getByText('redirect /login')).toBeTruthy();
  });

  it('lists the month and opens a line as a sheet', async () => {
    await render(<TransactionsScreen />);
    expect(screen.getByText('Uber')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(lastFilters()).toEqual({});
    await fireEvent.press(screen.getByText('Uber'));
    expect(screen.getByText('detalhe Uber')).toBeTruthy();
    await fireEvent.press(screen.getByText('Fechar'));
    expect(screen.queryByText('detalhe Uber')).toBeNull();
  });

  it('shows loading, error and empty lists', async () => {
    regular({ data: undefined });
    await render(<TransactionsScreen />);
    expect(screen.queryByText('Uber')).toBeNull();
    regular({ isError: true, data: undefined });
    await render(<TransactionsScreen />);
    expect(screen.getByText('Não consegui carregar. Tente de novo.')).toBeTruthy();
    regular({ data: { pages: [{ total: 0, items: [] }], pageParams: [0] } } as Partial<Regular>);
    await render(<TransactionsScreen />);
    expect(screen.getByText('Nenhum gasto ou entrada neste mês.')).toBeTruthy();
  });

  it('loads more lines on request', async () => {
    regular({ hasNextPage: true });
    await render(<TransactionsScreen />);
    await fireEvent.press(screen.getByText('Mostrar mais (1)'));
    expect(fetchNextPage).toHaveBeenCalled();
    regular({ hasNextPage: true, isFetchingNextPage: true });
    await render(<TransactionsScreen />);
    expect(screen.queryByText(/Mostrar mais/)).toBeNull();
  });

  it('switches to transfers, with their own states', async () => {
    mockParams.mockReturnValue({ aba: 'transferencias' });
    await render(<TransactionsScreen />);
    expect(screen.getByText('lista de transferências')).toBeTruthy();
    transfers({ isError: true, data: undefined });
    await render(<TransactionsScreen />);
    expect(screen.getByText('Não consegui carregar. Tente de novo.')).toBeTruthy();
    transfers({ data: undefined });
    await render(<TransactionsScreen />);
    expect(screen.queryByText('lista de transferências')).toBeNull();
    expect(screen.queryByText('2')).toBeNull();
  });
});

describe('TransactionsScreen on a computer', () => {
  it('shows the table and the chosen line beside it', async () => {
    wide();
    await render(<TransactionsScreen />);
    expect(screen.getByText('DESCRIÇÃO')).toBeTruthy();
    expect(screen.getByText(/Clique numa linha/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Uber'));
    expect(screen.getByText('detalhe Uber')).toBeTruthy();
  });

  it('searches after a pause and filters by category and account', async () => {
    jest.useFakeTimers();
    wide();
    await render(<TransactionsScreen />);
    await fireEvent.changeText(screen.getByLabelText('Buscar descrição'), 'uber');
    await fireEvent(screen.getByLabelText('Buscar descrição'), 'focus');
    await fireEvent(screen.getByLabelText('Buscar descrição'), 'blur');
    await act(() => jest.advanceTimersByTime(300));
    expect(lastFilters()).toEqual({ q: 'uber', categoryId: null, accountId: null });
    jest.useRealTimers();

    await fireEvent.press(screen.getByText('Categoria ▾'));
    expect(screen.queryByText('Transferência')).toBeNull();
    await fireEvent.press(screen.getByText('Transporte'));
    expect(screen.getByText('Categoria: Transporte ▾')).toBeTruthy();
    await fireEvent.press(screen.getByText('Conta ▾'));
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Nubank' }));
    expect(lastFilters()).toEqual({ q: 'uber', categoryId: 'c1', accountId: 'a1' });

    await fireEvent.press(screen.getByText('Conta: Nubank ▾'));
    await fireEvent.press(screen.getByText('Todas'));
    expect(lastFilters()).toEqual({ q: 'uber', categoryId: 'c1', accountId: null });
  });

  it('says when filters find nothing', async () => {
    wide();
    regular({ data: { pages: [{ total: 0, items: [] }], pageParams: [0] } } as Partial<Regular>);
    await render(<TransactionsScreen />);
    await fireEvent.press(screen.getByText('Conta ▾'));
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Nubank' }));
    expect(screen.getByText('Nada encontrado com esses filtros.')).toBeTruthy();
  });

  it('hides the filters on the transfers tab', async () => {
    wide();
    await render(<TransactionsScreen />);
    await fireEvent.press(screen.getByTestId('segment-transferencias'));
    expect(screen.getByText('lista de transferências')).toBeTruthy();
    expect(screen.queryByLabelText('Buscar descrição')).toBeNull();
  });
});
