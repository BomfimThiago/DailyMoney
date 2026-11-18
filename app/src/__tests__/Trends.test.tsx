import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { CurrencyChips } from '@/components/CurrencyChips';
import { Trends } from '@/components/home/Trends';
import { useAuth } from '@/lib/auth';
import { useAnalysis } from '@/lib/queries';
import type { Analysis } from '@/lib/types';
import { analysis } from '@/testing/analysis';
import { withCurrency } from '@/testing/currency';

jest.mock('@/lib/auth', () => ({ useAuth: jest.fn() }));
jest.mock('@/lib/api', () => ({
  ...jest.requireActual<typeof import('@/lib/api')>('@/lib/api'),
  api: jest.fn(() => Promise.resolve({})),
}));
jest.mock('@/lib/queries', () => ({ useAnalysis: jest.fn() }));

const mockAnalysis = jest.mocked(useAnalysis);

const full = analysis({
  changes: [
    { name: 'Mercado', amount: '150', average: '100' },
    { name: 'Uber', amount: '50', average: '100' },
  ],
  habits: [{ name: 'Padaria', category: 'Mercado', count: 4, previous_count: 2, total: '50' }],
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

// Início's currency chips sit above; the section follows them.
const page = (twoColumns = false) =>
  withCurrency(
    <>
      <CurrencyChips />
      <Trends month="2026-10" twoColumns={twoColumns} />
    </>,
  );

beforeEach(() => {
  jest.mocked(useAuth).mockReturnValue({
    state: { status: 'signedIn', me: { family: { display_currency: 'BRL' } } },
  } as ReturnType<typeof useAuth>);
  answer({ data: data(full, analysis({ currency: 'EUR', average: null, changes: [] })) });
});

describe('Trends (the last months on Início)', () => {
  it('shows every card with its lines, and no peaks card', async () => {
    await render(page());
    expect(screen.getByText('Últimos meses')).toBeTruthy();
    expect(screen.getByText('GASTOS POR MÊS')).toBeTruthy();
    expect(screen.getByText(/^média /)).toBeTruthy();
    expect(screen.getByText('+50%')).toBeTruthy();
    expect(screen.getByText('−50%')).toBeTruthy();
    expect(screen.getByText(/de costume\.$/)).toBeTruthy();
    expect(screen.getByText('Padaria')).toBeTruthy();
    expect(screen.getByText('4×')).toBeTruthy();
    expect(screen.getByText('Netflix')).toBeTruthy();
    expect(screen.queryByText('PICOS DO MÊS')).toBeNull();
  });

  it('follows the currency, changes the period, and each card says when it has nothing', async () => {
    await render(page(true));
    await fireEvent.press(screen.getByText('EUR'));
    expect(screen.getByText('Precisa de pelo menos um mês anterior para comparar.')).toBeTruthy();
    expect(screen.getByText('Nenhuma compra se repetiu tanto neste mês.')).toBeTruthy();
    expect(screen.getByText(/Nenhuma assinatura/)).toBeTruthy();
    expect(screen.queryByText(/^média /)).toBeNull();
    await fireEvent.press(screen.getByText('12 meses'));
    const calls = mockAnalysis.mock.calls;
    expect(calls[calls.length - 1][1]).toBe(12);
  });

  it('shows loading, error and empty states', async () => {
    answer({});
    await render(page());
    expect(screen.queryByText('GASTOS POR MÊS')).toBeNull();
    answer({ isError: true });
    await render(page());
    expect(screen.getByText('Não consegui carregar. Tente de novo.')).toBeTruthy();
    answer({ data: data(analysis({ months: [{ month: '2026-10', amount: '0' }] })) });
    await render(page());
    expect(screen.getByText(/^Ainda não há gastos nos meses anteriores/)).toBeTruthy();
  });
});
