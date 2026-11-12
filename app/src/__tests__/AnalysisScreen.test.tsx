import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import AnalysisScreen from '@/app/(tabs)/analises';
import { useAuth } from '@/lib/auth';
import { useAnalysis } from '@/lib/queries';
import type { Analysis } from '@/lib/types';
import { analysis } from '@/testing/analysis';

jest.mock('expo-router', () => ({ Redirect: () => null }));
jest.mock('@/lib/auth', () => ({ useAuth: jest.fn() }));
jest.mock('@/lib/queries', () => ({ useAnalysis: jest.fn() }));

const mockAnalysis = jest.mocked(useAnalysis);

const full = analysis({
  changes: [
    { name: 'Mercado', amount: '150', average: '100' },
    { name: 'Uber', amount: '50', average: '100' },
  ],
  habits: [{ name: 'Padaria', category: 'Mercado', count: 4, previous_count: 2, total: '50' }],
  peaks: [{ date: '2026-10-17', amount: '300', merchants: ['Zara', 'iFood'] }],
  recurring: [
    {
      name: 'Netflix',
      category: 'Assinaturas',
      amount: '55.9',
      last_date: '2026-10-22',
      months: 4,
    },
  ],
  recurring_total: '55.9',
});

const answer = (o: Partial<ReturnType<typeof useAnalysis>>) =>
  mockAnalysis.mockReturnValue({ data: undefined, isError: false, ...o } as ReturnType<
    typeof useAnalysis
  >);
const data = (...currencies: Analysis['currencies']): Analysis =>
  ({ month: '2026-10', months: 6, currencies }) as Analysis;

const wide = (width: number) =>
  jest
    .spyOn(jest.requireActual<typeof import('react-native')>('react-native'), 'useWindowDimensions')
    .mockReturnValue({ width, height: 900, scale: 1, fontScale: 1 });

beforeEach(() => {
  jest.restoreAllMocks();
  jest
    .mocked(useAuth)
    .mockReturnValue({ state: { status: 'signedIn', me: {} } } as ReturnType<typeof useAuth>);
  answer({ data: data(full, analysis({ currency: 'EUR', average: null, changes: [] })) });
});

describe('AnalysisScreen', () => {
  it('shows every card with its lines', async () => {
    await render(<AnalysisScreen />);
    expect(screen.getByText('GASTOS POR MÊS')).toBeTruthy();
    expect(screen.getByText(/^média /)).toBeTruthy();
    expect(screen.getByText('+50%')).toBeTruthy();
    expect(screen.getByText('−50%')).toBeTruthy();
    expect(screen.getByText(/de costume\.$/)).toBeTruthy();
    expect(screen.getByText('Padaria')).toBeTruthy();
    expect(screen.getByText('4×')).toBeTruthy();
    expect(screen.getByText('Zara e iFood')).toBeTruthy();
    expect(screen.getByText('Netflix')).toBeTruthy();
  });

  it('switches currency and period, with each card saying when it has nothing', async () => {
    await render(<AnalysisScreen />);
    await fireEvent.press(screen.getByText('EUR'));
    expect(screen.getByText('Precisa de pelo menos um mês anterior para comparar.')).toBeTruthy();
    expect(screen.getByText('Nenhuma compra se repetiu tanto neste mês.')).toBeTruthy();
    expect(screen.getByText('Nenhum gasto neste mês.')).toBeTruthy();
    expect(screen.getByText(/Nenhuma assinatura/)).toBeTruthy();
    expect(screen.queryByText(/^média /)).toBeNull();
    await fireEvent.press(screen.getByText('12 meses'));
    const calls = mockAnalysis.mock.calls;
    expect(calls[calls.length - 1][1]).toBe(12);
  });

  it('shows loading, error and empty states', async () => {
    answer({});
    await render(<AnalysisScreen />);
    expect(screen.queryByText('GASTOS POR MÊS')).toBeNull();
    answer({ isError: true });
    await render(<AnalysisScreen />);
    expect(screen.getByText('Não consegui carregar. Tente de novo.')).toBeTruthy();
    answer({ data: data(analysis({ months: [{ month: '2026-10', amount: '0' }] })) });
    await render(<AnalysisScreen />);
    expect(screen.getByText(/Nenhum gasto nos extratos enviados/)).toBeTruthy();
    expect(screen.queryByText('BRL')).toBeNull();
  });

  it('puts cards side by side on a wide computer and stacks them on a narrow one', async () => {
    wide(1440);
    await render(<AnalysisScreen />);
    expect(screen.getByText('O QUE MAIS MUDOU')).toBeTruthy();
    wide(950);
    await render(<AnalysisScreen />);
    expect(screen.getByText('PICOS DO MÊS')).toBeTruthy();
  });
});
