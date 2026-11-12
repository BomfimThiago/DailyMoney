import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import HomeScreen from '@/app/(tabs)/index';
import { useAuth } from '@/lib/auth';
import { useDashboard, useRecent, useSummary } from '@/lib/queries';
import { movement } from '@/testing/investments';
import { dashboard, monthSummary } from '@/testing/home';

jest.mock('expo-router', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Redirect: ({ href }: { href: string }) => <Text>{`redirect ${href}`}</Text>,
    router: { navigate: jest.fn(), push: jest.fn() },
  };
});
jest.mock('@/lib/auth', () => ({ useAuth: jest.fn() }));
jest.mock('@/lib/queries', () => ({
  useSummary: jest.fn(),
  useRecent: jest.fn(),
  useDashboard: jest.fn(),
}));

const mockAuth = jest.mocked(useAuth);
const mockSummary = jest.mocked(useSummary);
const mockRecent = jest.mocked(useRecent);
const mockDashboard = jest.mocked(useDashboard);
const signOut = jest.fn();

const summary = (o: Partial<ReturnType<typeof useSummary>>) =>
  mockSummary.mockReturnValue({ data: undefined, isError: false, ...o } as ReturnType<
    typeof useSummary
  >);
const recent = (o: Partial<ReturnType<typeof useRecent>>) =>
  mockRecent.mockReturnValue({ data: undefined, isError: false, ...o } as ReturnType<
    typeof useRecent
  >);
const dash = (o: Partial<ReturnType<typeof useDashboard>>) =>
  mockDashboard.mockReturnValue({ data: undefined, isError: false, ...o } as ReturnType<
    typeof useDashboard
  >);

const money = (t: string) =>
  new RegExp(`^${t.replace(/[.$+]/g, (c) => `\\${c}`).replace(/ /g, String.raw`\s`)}$`);

const wide = (width = 1440) =>
  jest
    .spyOn(jest.requireActual<typeof import('react-native')>('react-native'), 'useWindowDimensions')
    .mockReturnValue({ width, height: 900, scale: 1, fontScale: 1 });

beforeEach(() => {
  jest.restoreAllMocks();
  jest.mocked(router.navigate).mockClear();
  jest.mocked(router.push).mockClear();
  mockAuth.mockReturnValue({
    state: { status: 'signedIn', me: { name: 'Thiago Bomfim' } },
    signOut,
  } as unknown as ReturnType<typeof useAuth>);
  summary({ data: monthSummary() });
  recent({ data: { total: 9, items: [movement({ description: 'Uber', kind: 'regular' })] } });
  dash({ data: { month: '2026-10', currencies: [dashboard()] } });
});

describe('HomeScreen session', () => {
  it('sends signed-out people to login', async () => {
    mockAuth.mockReturnValue({ state: { status: 'signedOut' } } as ReturnType<typeof useAuth>);
    await render(<HomeScreen />);
    expect(screen.getByText('redirect /login')).toBeTruthy();
  });
});

describe('HomeScreen on the phone', () => {
  it('shows the month figures, pending transfers and the latest lines', async () => {
    await render(<HomeScreen />);
    expect(screen.getByText('8.500')).toBeTruthy();
    expect(screen.getByText(money('R$ 3.094,20'))).toBeTruthy();
    expect(screen.getByText(/Só contas em BRL/)).toBeTruthy();
    expect(screen.getByText('Uber')).toBeTruthy();
    await fireEvent.press(screen.getByText('2 transferências para confirmar'));
    expect(router.navigate).toHaveBeenCalledWith({
      pathname: '/transacoes',
      params: { aba: 'transferencias' },
    });
    await fireEvent.press(screen.getByText('Ver todas as 9'));
    expect(router.navigate).toHaveBeenCalledWith('/transacoes');
    await fireEvent.press(screen.getByText('Enviar extrato'));
    expect(router.push).toHaveBeenCalledWith('/upload');
    await fireEvent.press(screen.getByText('Sair'));
    expect(signOut).toHaveBeenCalled();
  });

  it('switches currency', async () => {
    await render(<HomeScreen />);
    await fireEvent.press(screen.getByText('EUR'));
    expect(screen.getByText('1.200')).toBeTruthy();
    expect(screen.getByText(/Só contas em EUR/)).toBeTruthy();
  });

  it('keeps it short with one currency, no pending and every line shown', async () => {
    summary({
      data: monthSummary({ currencies: [monthSummary().currencies[0]], pending_transfers: 0 }),
    });
    recent({ data: { total: 1, items: [movement({ description: 'Uber', kind: 'regular' })] } });
    await render(<HomeScreen />);
    expect(screen.queryByText('EUR')).toBeNull();
    expect(screen.queryByText(/Só contas em/)).toBeNull();
    expect(screen.queryByText(/para confirmar/)).toBeNull();
    expect(screen.queryByText(/Ver todas/)).toBeNull();
  });

  it('invites the first statement', async () => {
    summary({ data: monthSummary({ currencies: [], pending_transfers: 0 }) });
    await render(<HomeScreen />);
    expect(screen.getByText('Olá, Thiago')).toBeTruthy();
    expect(screen.queryByText('Últimos movimentos')).toBeNull();
  });

  it('shows loading and error states for the summary and the lines', async () => {
    summary({});
    recent({});
    await render(<HomeScreen />);
    expect(screen.queryByText('ENTRADAS')).toBeNull();
    summary({ isError: true });
    recent({ isError: true });
    await render(<HomeScreen />);
    expect(screen.getByText('Não consegui carregar. Tente de novo.')).toBeTruthy();
    expect(screen.getByText('Não consegui carregar os movimentos.')).toBeTruthy();
    summary({ data: monthSummary() });
    recent({ data: { total: 0, items: [] } });
    await render(<HomeScreen />);
    expect(screen.getByText('Nenhum movimento neste mês.')).toBeTruthy();
  });
});

describe('HomeScreen on a computer', () => {
  it('shows the figures and the three charts', async () => {
    wide();
    await render(<HomeScreen />);
    expect(screen.getByText('SOBROU NO MÊS')).toBeTruthy();
    expect(screen.getByText('RITMO DO MÊS')).toBeTruthy();
    expect(screen.getByText('DIVISÃO DOS GASTOS')).toBeTruthy();
    expect(screen.getByText('CALENDÁRIO DE GASTOS')).toBeTruthy();
    expect(screen.getByText('Mercado')).toBeTruthy();
    await fireEvent.press(screen.getByText('Conta'));
    expect(screen.getByText('Nubank')).toBeTruthy();
    expect(screen.getByLabelText(/^1: /)).toBeTruthy();
    expect(screen.getByLabelText('2: sem gastos')).toBeTruthy();
    await fireEvent.press(screen.getByText('EUR'));
    expect(screen.getByText('1.200')).toBeTruthy();
  });

  it('stacks the cards on a narrow computer, even for a month without spending', async () => {
    wide(1000);
    dash({
      data: {
        month: '2026-10',
        currencies: [dashboard({ daily: [], previous_daily: [], categories: [] })],
      },
    });
    await render(<HomeScreen />);
    expect(screen.getAllByText('Nenhum gasto neste mês.')).toHaveLength(2);
  });

  it('invites the first statement and handles chart loading and errors', async () => {
    wide();
    summary({ data: monthSummary({ currencies: [] }) });
    await render(<HomeScreen />);
    expect(screen.getByText('Olá, Thiago')).toBeTruthy();
    summary({ data: monthSummary() });
    dash({ isError: true });
    await render(<HomeScreen />);
    expect(screen.getByText('Não consegui carregar os gráficos. Tente de novo.')).toBeTruthy();
    dash({});
    await render(<HomeScreen />);
    expect(screen.queryByText('RITMO DO MÊS')).toBeNull();
    expect(screen.getByText('GASTOS')).toBeTruthy();
  });
});
