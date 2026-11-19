import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';

import TransactionsScreen from '@/app/(tabs)/transacoes';
import { drillParams } from '@/lib/drill';
import { useAuth } from '@/lib/auth';
import { decideReview } from '@/lib/imports';
import {
  useAccounts,
  useCategories,
  useFamily,
  useLatestMonth,
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
  useMovements: () => ({ data: undefined }),
  useCategories: jest.fn(),
  useAccounts: jest.fn(),
  useReviewQueue: jest.fn(),
  useTotals: jest.fn(),
  useFamily: jest.fn(),
  useLatestMonth: jest.fn(),
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
      invested_in: '0',
      invested_out: '0',
      count: 3,
      categories: [
        {
          id: 'c3',
          name: 'Moradia',
          spending: '1000.0000',
          income: '0',
          invested_in: '0',
          invested_out: '0',
          count: 1,
        },
        {
          id: 'c1',
          name: 'Transporte',
          spending: '23.9000',
          income: '0',
          invested_in: '0',
          invested_out: '0',
          count: 1,
        },
        {
          id: 'c4',
          name: 'Salário',
          spending: '0',
          income: '8500.0000',
          invested_in: '0',
          invested_out: '0',
          count: 1,
        },
      ],
      members: [
        {
          id: 'm1',
          name: 'Thiago',
          spending: '1023.9000',
          income: '8500.0000',
          invested_in: '0',
          invested_out: '0',
          count: 3,
        },
      ],
      accounts: [
        {
          id: 'a1',
          name: 'Nubank',
          spending: '1023.9000',
          income: '8500.0000',
          invested_in: '0',
          invested_out: '0',
          count: 3,
        },
      ],
      days: [{ date: '2026-11-20', total: '8476.1000' }],
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
  jest.mocked(useLatestMonth).mockReturnValue({
    data: { month: null },
    isPending: false,
  } as unknown as ReturnType<typeof useLatestMonth>);
  mockFamily.mockReturnValue({
    data: { members: [{ id: 'm1', name: 'Thiago' }] },
  } as ReturnType<typeof useFamily>);
});

const NO_FILTERS = {
  q: '',
  picks: {},
  direction: null,
  accountCurrency: null,
  dateFrom: null,
  dateTo: null,
};

const only = (...ids: string[]) => ({ ids, exclude: false });

const lastView = () => {
  const calls = mockRegular.mock.calls;
  return calls[calls.length - 1][0];
};

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
    // Only the list: no tabs while nothing waits for review.
    expect(screen.queryByTestId('segment-lista')).toBeNull();
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

  it('opens with internal transfers from the link, the waiting ones first', async () => {
    mockParams.mockReturnValue({ aba: 'transferencias' });
    await render(<TransactionsScreen />);
    expect(lastView().kinds).toContain('pending');
    expect(screen.getByText('lista de transferências')).toBeTruthy();
    expect(screen.getByText(' · 2 a confirmar')).toBeTruthy();
    // Without the answer there is nothing to show above the list.
    transfers({ data: undefined });
    await render(<TransactionsScreen />);
    expect(screen.queryByText('lista de transferências')).toBeNull();
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
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Transporte' }));
    expect(screen.getByText('Categoria: Transporte ▾')).toBeTruthy();
    await fireEvent.press(screen.getByText('Categoria: Transporte ▾'));
    await fireEvent.press(screen.getByText('Conta ▾'));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Nubank' }));
    const both = { category: only('c1'), account: only('a1') };
    expect(lastFilters()).toEqual({ ...NO_FILTERS, q: 'uber', picks: both });
    expect(lastTotals()[2]).toEqual(lastFilters());

    await fireEvent.press(screen.getByText('Todas'));
    expect(lastFilters()).toEqual({ ...NO_FILTERS, q: 'uber', picks: { category: only('c1') } });
  });

  it('says when filters find nothing', async () => {
    wide();
    regular({ data: { pages: [{ total: 0, items: [] }], pageParams: [0] } } as Partial<Regular>);
    await render(<TransactionsScreen />);
    await fireEvent.press(screen.getByText('Conta ▾'));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Nubank' }));
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
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Casa' }));
    expect(lastTotals()[2]).toEqual({ ...NO_FILTERS, picks: { member: only('casa') } });
    await fireEvent.press(screen.getByText('Responsável: Casa ▾'));
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
});

describe('TransactionsScreen on the phone: study the month', () => {
  it('filters and adds up on the phone too', async () => {
    await render(<TransactionsScreen />);
    expect(screen.getByTestId('totals')).toBeTruthy();
    await fireEvent.press(screen.getByText('Categoria ▾'));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Transporte' }));
    expect(lastFilters()).toEqual({ ...NO_FILTERS, picks: { category: only('c1') } });
    expect(lastTotals()[2]).toEqual({ ...NO_FILTERS, picks: { category: only('c1') } });
  });
});

describe('TransactionsScreen: what the old app had', () => {
  it("shows each day's total and who each line belongs to", async () => {
    wide();
    await render(<TransactionsScreen />);
    expect(screen.getByText('RESPONSÁVEL')).toBeTruthy();
    expect(screen.getByText('+R$\u00a08.476,10')).toBeTruthy();
    expect(screen.getAllByText('Casa').length).toBeGreaterThan(0);
  });

  it('filters by type and currency, and clears everything at once', async () => {
    wide();
    mockAccounts.mockReturnValue({
      data: [
        { id: 'a1', name: 'Nubank', currency: 'BRL' },
        { id: 'a2', name: 'Revolut', currency: 'EUR' },
      ],
    } as ReturnType<typeof useAccounts>);
    await render(<TransactionsScreen />);
    await fireEvent.press(screen.getByText('Tipo ▾'));
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Gastos' }));
    await fireEvent.press(screen.getByText('Moeda ▾'));
    await fireEvent.press(screen.getByRole('menuitem', { name: 'EUR' }));
    expect(lastFilters()).toEqual({ ...NO_FILTERS, direction: 'out', accountCurrency: 'EUR' });
    await fireEvent.press(screen.getByLabelText('Limpar filtros'));
    expect(lastFilters()).toEqual(NO_FILTERS);
    expect(screen.queryByLabelText('Limpar filtros')).toBeNull();
  });

  it('clears the period and the transfers switch too, in one tap', async () => {
    wide();
    await render(<TransactionsScreen />);
    expect(screen.queryByLabelText('Limpar filtros')).toBeNull();
    await fireEvent.press(screen.getByText('Período: Mês ▾'));
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Todo o período' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Transferências internas' }));
    expect(lastView().month).toBeNull();
    await fireEvent.press(screen.getByLabelText('Limpar filtros'));
    expect(lastView().month).not.toBeNull();
    expect(lastView().kinds).toEqual(['regular', 'investment']);
    expect(screen.getByText('Período: Mês ▾')).toBeTruthy();
  });

  it('studies all the time there is, or the days between two dates', async () => {
    wide();
    await render(<TransactionsScreen />);
    expect(lastView().month).toMatch(/^\d{4}-\d{2}$/);
    await fireEvent.press(screen.getByText('Período: Mês ▾'));
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Todo o período' }));
    expect(lastView().month).toBeNull();
    expect(screen.getByText('TOTAL DO PERÍODO')).toBeTruthy();
    expect(screen.queryByLabelText('Mês anterior')).toBeNull();

    await fireEvent.press(screen.getByText('Período: Todo o período ▾'));
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Entre datas' }));
    await fireEvent.changeText(screen.getByLabelText('De'), '01/10/2026');
    await fireEvent.changeText(screen.getByLabelText('Até'), '15/10/2026');
    expect(lastFilters()).toEqual({ ...NO_FILTERS, dateFrom: '2026-10-01', dateTo: '2026-10-15' });
    const asked = mockRegular.mock.calls.length;
    await fireEvent.changeText(screen.getByLabelText('De'), '20/10/2026');
    expect(screen.getByText('A data inicial é depois da final.')).toBeTruthy();
    // A wrong period is not asked for.
    expect(mockRegular.mock.calls[mockRegular.mock.calls.length - 1][1]).toBe(false);
    expect(mockRegular.mock.calls.length).toBeGreaterThan(asked);
  });

  it('sorts by clicking a column and goes back to by day', async () => {
    wide();
    await render(<TransactionsScreen />);
    await fireEvent.press(screen.getByLabelText('Ordenar por valor'));
    expect(lastView().sort).toBe('amount');
    expect(screen.getByText('DATA')).toBeTruthy();
    expect(screen.getByText('VALOR ↑')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Ordenar por valor'));
    expect(lastView().sort).toBe('-amount');
    await fireEvent.press(screen.getByLabelText('Ordenar por valor'));
    expect(lastView().sort).toBe('date');
    await fireEvent.press(screen.getByLabelText('Ordenar por descrição'));
    expect(lastView().sort).toBe('description');
  });

  it('lists internal transfers when asked, without counting them', async () => {
    wide();
    await render(<TransactionsScreen />);
    expect(lastView().kinds).toEqual(['regular', 'investment']);
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Transferências internas' }));
    expect(lastView().kinds).toEqual(['regular', 'investment', 'transfer', 'pending']);
    expect(screen.getByText(/✓ Transferências internas/)).toBeTruthy();
    expect(screen.getByText('lista de transferências')).toBeTruthy();
  });

  it('opens on the newest month with lines', async () => {
    jest.mocked(useLatestMonth).mockReturnValue({
      data: { month: '2026-03' },
      isPending: false,
    } as ReturnType<typeof useLatestMonth>);
    await render(<TransactionsScreen />);
    expect(lastView().month).toBe('2026-03');
    await fireEvent.press(screen.getByLabelText('Próximo mês'));
    expect(lastView().month).toBe('2026-04');
  });

  it('orders the phone list from a menu, with day headings only by day', async () => {
    await render(<TransactionsScreen />);
    expect(screen.getByText('+R$\u00a08.476,10')).toBeTruthy();
    await fireEvent.press(screen.getByText('Por dia ▾'));
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Maiores gastos' }));
    expect(lastView().sort).toBe('amount');
    expect(screen.queryByText('+R$\u00a08.476,10')).toBeNull();
  });
});

describe('TransactionsScreen: several values, shown or hidden', () => {
  it('ticks several categories and hides them instead of showing them', async () => {
    wide();
    mockCategories.mockReturnValue({
      data: [
        { id: 'c1', name: 'Transporte', kind: 'expense' },
        { id: 'c3', name: 'Moradia', kind: 'expense' },
      ],
    } as ReturnType<typeof useCategories>);
    mockAccounts.mockReturnValue({
      data: [
        { id: 'a1', name: 'Nubank', bank: 'Nubank' },
        { id: 'a2', name: 'Inter', bank: 'Inter' },
      ],
    } as ReturnType<typeof useAccounts>);
    await render(<TransactionsScreen />);
    await fireEvent.press(screen.getByText('Categoria ▾'));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Moradia' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Transporte' }));
    expect(screen.getByText('Categoria: Moradia +1 ▾')).toBeTruthy();
    expect(lastFilters()).toEqual({ ...NO_FILTERS, picks: { category: only('c3', 'c1') } });

    await fireEvent.press(screen.getByRole('radio', { name: 'Esconder' }));
    expect(screen.getByText('Categoria: exceto Moradia +1 ▾')).toBeTruthy();
    expect(lastFilters()).toEqual({
      ...NO_FILTERS,
      picks: { category: { ids: ['c3', 'c1'], exclude: true } },
    });
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Moradia' }));
    expect(screen.getByText('Categoria: exceto Transporte ▾')).toBeTruthy();

    // With accounts in two banks, Banco is a filter too.
    await fireEvent.press(screen.getByText('Banco ▾'));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Inter' }));
    expect(lastFilters()?.picks?.bank).toEqual(only('Inter'));
    await fireEvent.press(screen.getByLabelText('Limpar filtros'));
    expect(lastFilters()).toEqual(NO_FILTERS);
  });

  it('opens "Demais" from Início: the month\'s spending except the top rows', async () => {
    wide();
    mockParams.mockReturnValue({ ...drillParams('2026-08', 'categoria', ['c1'], true, '1') });
    await render(<TransactionsScreen />);
    expect(lastView().month).toBe('2026-08');
    expect(lastFilters()).toEqual({
      ...NO_FILTERS,
      direction: 'out',
      picks: { category: { ids: ['c1'], exclude: true } },
    });
    expect(screen.getByText('Categoria: exceto Transporte ▾')).toBeTruthy();
    expect(screen.getByText('Tipo: Gastos ▾')).toBeTruthy();
  });

  it('opens a person from Início grouped by Responsável, once per tap', async () => {
    wide();
    mockParams.mockReturnValue({ ...drillParams('2026-08', 'pessoa', ['m1'], false, '1') });
    const view = await render(<TransactionsScreen />);
    expect(lastFilters()?.picks).toEqual({ member: only('m1') });
    expect(screen.getByRole('radio', { name: 'Responsável' }).props.accessibilityState).toEqual({
      selected: true,
    });
    // The person clears the filters; the same link does not come back by itself.
    await fireEvent.press(screen.getByLabelText('Limpar filtros'));
    await view.rerender(<TransactionsScreen />);
    expect(lastFilters()).toEqual(NO_FILTERS);
    // A new tap on Início (new "n") opens it again.
    mockParams.mockReturnValue({ ...drillParams('2026-08', 'pessoa', ['m1'], false, '2') });
    await view.rerender(<TransactionsScreen />);
    expect(lastFilters()?.picks).toEqual({ member: only('m1') });
  });
});
