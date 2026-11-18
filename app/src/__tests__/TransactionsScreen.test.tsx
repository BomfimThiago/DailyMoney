import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';

import TransactionsScreen from '@/app/(tabs)/transacoes';
import { useAuth } from '@/lib/auth';
import { decideReview } from '@/lib/imports';
import {
  useAccounts,
  useCategories,
  useFamily,
  useRegular,
  useReviewQueue,
  useTotals,
  useTransfers,
} from '@/lib/queries';
import type { ReviewQueue, Transaction, TransactionTotals, TransferOverview } from '@/lib/types';
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
  useReviewQueue: jest.fn(),
  useTotals: jest.fn(),
  useFamily: jest.fn(),
  useRefreshMoney: () => mockRefreshMoney,
}));
jest.mock('@/lib/imports', () => ({ decideReview: jest.fn() }));
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
const mockReview = jest.mocked(useReviewQueue);
const mockTotals = jest.mocked(useTotals);
const mockFamily = jest.mocked(useFamily);

const sums: TransactionTotals = {
  count: 3,
  currencies: [
    {
      currency: 'BRL',
      income: '8500.0000',
      spending: '1023.9000',
      balance: '7476.1000',
      count: 3,
      categories: [
        { id: 'c3', name: 'Moradia', spending: '1000.0000', income: '0', count: 1 },
        { id: 'c1', name: 'Transporte', spending: '23.9000', income: '0', count: 1 },
        { id: 'c4', name: 'Salário', spending: '0', income: '8500.0000', count: 1 },
      ],
      members: [{ id: 'm1', name: 'Thiago', spending: '1023.9000', income: '8500.0000', count: 3 }],
      accounts: [
        { id: 'a1', name: 'Nubank', spending: '1023.9000', income: '8500.0000', count: 3 },
      ],
    },
  ],
};
const mockDecide = jest.mocked(decideReview);
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

const taxi = movement({
  id: 'r1',
  description: 'Taxi',
  kind: 'regular',
  amount: '-12.0000',
  review: 'pending',
});
const bakery = movement({
  id: 'r2',
  description: 'Padaria',
  kind: 'regular',
  amount: '-8.0000',
  review: 'pending',
});
const queue: ReviewQueue = {
  total: 2,
  groups: [
    {
      import_id: 'i1',
      label: 'Revolut · Conta EUR',
      source: 'bank',
      imported_at: '2026-11-16T06:00:00Z',
      items: [taxi, bakery],
    },
  ],
};
const review = (o: Partial<ReturnType<typeof useReviewQueue>> = {}) =>
  mockReview.mockReturnValue({
    data: { total: 0, groups: [] },
    isError: false,
    ...o,
  } as ReturnType<typeof useReviewQueue>);

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
  review();
  mockDecide.mockReset();
  mockCategories.mockReturnValue({
    data: [
      { id: 'c1', name: 'Transporte', kind: 'expense' },
      { id: 'c2', name: 'Transferência', kind: 'transfer' },
    ],
  } as ReturnType<typeof useCategories>);
  mockAccounts.mockReturnValue({ data: [{ id: 'a1', name: 'Nubank' }] } as ReturnType<
    typeof useAccounts
  >);
  mockTotals.mockReturnValue({ data: sums } as ReturnType<typeof useTotals>);
  mockFamily.mockReturnValue({
    data: { members: [{ id: 'm1', name: 'Thiago' }] },
  } as ReturnType<typeof useFamily>);
});

const NO_FILTERS = { q: '', categoryId: null, accountId: null, memberId: null };

const lastTotals = () => {
  const calls = mockTotals.mock.calls;
  return calls[calls.length - 1];
};

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
    expect(lastFilters()).toEqual(NO_FILTERS);
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

describe('TransactionsScreen: imported lines to review', () => {
  it('hides the tab when nothing waits', async () => {
    await render(<TransactionsScreen />);
    expect(screen.queryByTestId('segment-revisar')).toBeNull();
  });

  it('opens on the link from Início and approves a whole import', async () => {
    review({ data: queue });
    mockParams.mockReturnValue({ aba: 'revisar' });
    mockDecide.mockResolvedValue({ count: 2, left: 0 });
    await render(<TransactionsScreen />);
    expect(screen.getByText('Revolut · Conta EUR')).toBeTruthy();
    expect(screen.getByText('Sincronizado em 16 nov · 2 transações')).toBeTruthy();
    await fireEvent.press(screen.getByText('Aprovar todas (2)'));
    expect(mockDecide).toHaveBeenCalledWith(['r1', 'r2'], 'approve');
    expect(mockRefreshMoney).toHaveBeenCalled();
  });

  it('turns down one line and shows when it fails', async () => {
    review({ data: queue });
    mockParams.mockReturnValue({ aba: 'revisar' });
    mockDecide.mockRejectedValue(new Error('caiu'));
    await render(<TransactionsScreen />);
    await fireEvent.press(screen.getAllByText('Rejeitar')[1]);
    expect(mockDecide).toHaveBeenCalledWith(['r2'], 'reject');
    expect(screen.getByText('Algo deu errado. Tente de novo.')).toBeTruthy();
  });

  it('opens a line to correct it before approving', async () => {
    wide();
    review({ data: queue });
    await render(<TransactionsScreen />);
    await fireEvent.press(screen.getByTestId('segment-revisar'));
    await fireEvent.press(screen.getByText('Taxi'));
    expect(screen.getByText('detalhe Taxi')).toBeTruthy();
  });

  it('says when nothing is left and when loading fails', async () => {
    mockParams.mockReturnValue({ aba: 'revisar' });
    await render(<TransactionsScreen />);
    expect(screen.getByText(/Nada para revisar/)).toBeTruthy();
    review({ isError: true, data: undefined });
    await render(<TransactionsScreen />);
    expect(screen.getByText('Não consegui carregar. Tente de novo.')).toBeTruthy();
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
    expect(lastFilters()).toEqual({ ...NO_FILTERS, q: 'uber' });
    jest.useRealTimers();

    await fireEvent.press(screen.getByText('Categoria ▾'));
    expect(screen.queryByText('Transferência')).toBeNull();
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Transporte' }));
    expect(screen.getByText('Categoria: Transporte ▾')).toBeTruthy();
    await fireEvent.press(screen.getByText('Conta ▾'));
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Nubank' }));
    expect(lastFilters()).toEqual({ ...NO_FILTERS, q: 'uber', categoryId: 'c1', accountId: 'a1' });
    expect(lastTotals()[2]).toEqual(lastFilters());

    await fireEvent.press(screen.getByText('Conta: Nubank ▾'));
    await fireEvent.press(screen.getByText('Todas'));
    expect(lastFilters()).toEqual({ ...NO_FILTERS, q: 'uber', categoryId: 'c1' });
  });

  it('says when filters find nothing', async () => {
    wide();
    regular({ data: { pages: [{ total: 0, items: [] }], pageParams: [0] } } as Partial<Regular>);
    await render(<TransactionsScreen />);
    await fireEvent.press(screen.getByText('Conta ▾'));
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Nubank' }));
    expect(screen.getByText('Nada encontrado com esses filtros.')).toBeTruthy();
  });

  it('adds up what the list shows and groups it by the filter picked last', async () => {
    wide();
    await render(<TransactionsScreen />);
    expect(screen.getByText('TOTAL DO MÊS')).toBeTruthy();
    const box = within(screen.getByTestId('totals'));
    expect(box.getAllByText('3 transações').length).toBeGreaterThan(0);
    expect(box.getAllByText('+R$\u00a08.500,00').length).toBeGreaterThan(0);
    expect(box.getAllByText('R$\u00a01.023,90').length).toBeGreaterThan(0);
    expect(box.getByText('+R$\u00a07.476,10')).toBeTruthy();
    expect(screen.getByText('Moradia')).toBeTruthy();

    await fireEvent.press(screen.getByText('Responsável ▾'));
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Casa' }));
    expect(lastTotals()[2]).toEqual({ ...NO_FILTERS, memberId: 'casa' });
    expect(screen.getByText('TOTAL DO QUE ESTÁ FILTRADO')).toBeTruthy();
    // Picking a Responsável groups by Responsável; the chips switch it back.
    expect(screen.getByRole('radio', { name: 'Responsável' }).props.accessibilityState).toEqual({
      selected: true,
    });
    expect(screen.queryByText('Moradia')).toBeNull();
    await fireEvent.press(screen.getByRole('radio', { name: 'Conta' }));
    expect(screen.getAllByText('Nubank').length).toBeGreaterThan(0);
    await fireEvent.press(screen.getByRole('radio', { name: 'Categoria' }));
    expect(screen.getByText('Moradia')).toBeTruthy();
  });

  it('shows the first groups and the rest on request', async () => {
    wide();
    const [brl] = sums.currencies;
    const categories = Array.from({ length: 8 }, (_, i) => ({
      id: `g${i}`,
      name: `Grupo ${i}`,
      spending: String(100 - i),
      income: '0',
      count: 1,
    }));
    mockTotals.mockReturnValue({
      data: { ...sums, currencies: [{ ...brl, categories }] },
    } as ReturnType<typeof useTotals>);
    await render(<TransactionsScreen />);
    expect(screen.queryByText('Grupo 7')).toBeNull();
    await fireEvent.press(screen.getByText('Ver todos (2 a mais)'));
    expect(screen.getByText('Grupo 7')).toBeTruthy();
    await fireEvent.press(screen.getByText('Mostrar menos'));
    expect(screen.queryByText('Grupo 7')).toBeNull();
  });

  it('shows no totals while loading or when nothing is listed', async () => {
    wide();
    mockTotals.mockReturnValue({ data: undefined } as ReturnType<typeof useTotals>);
    await render(<TransactionsScreen />);
    expect(screen.queryByTestId('totals')).toBeNull();
    mockTotals.mockReturnValue({
      data: { count: 0, currencies: [] },
    } as unknown as ReturnType<typeof useTotals>);
    await render(<TransactionsScreen />);
    expect(screen.queryByTestId('totals')).toBeNull();
  });

  it('hides the filters on the transfers tab', async () => {
    wide();
    await render(<TransactionsScreen />);
    await fireEvent.press(screen.getByTestId('segment-transferencias'));
    expect(screen.getByText('lista de transferências')).toBeTruthy();
    expect(screen.queryByLabelText('Buscar descrição')).toBeNull();
    expect(lastTotals()[1]).toBe(false);
  });
});

describe('TransactionsScreen on the phone: study the month', () => {
  it('filters and adds up on the phone too', async () => {
    await render(<TransactionsScreen />);
    expect(screen.getByTestId('totals')).toBeTruthy();
    await fireEvent.press(screen.getByText('Categoria ▾'));
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Transporte' }));
    expect(lastFilters()).toEqual({ ...NO_FILTERS, categoryId: 'c1' });
    expect(lastTotals()[2]).toEqual({ ...NO_FILTERS, categoryId: 'c1' });
  });
});
