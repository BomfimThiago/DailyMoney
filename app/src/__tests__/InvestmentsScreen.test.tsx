import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import InvestmentsScreen from '@/app/(tabs)/investimentos';
import { useAuth } from '@/lib/auth';
import { currentMonth } from '@/lib/format';
import { useInvestments } from '@/lib/queries';
import { overview } from '@/testing/investments';

jest.mock('expo-router', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Redirect: ({ href }: { href: string }) => <Text>{`redirect ${href}`}</Text>,
  };
});
jest.mock('@/lib/auth', () => ({ useAuth: jest.fn() }));
jest.mock('@/lib/queries', () => ({ useInvestments: jest.fn() }));

const mockAuth = jest.mocked(useAuth);
const mockInvestments = jest.mocked(useInvestments);

const answer = (o: Partial<ReturnType<typeof useInvestments>>) =>
  mockInvestments.mockReturnValue({ data: undefined, isError: false, ...o } as ReturnType<
    typeof useInvestments
  >);

// Spaces inside formatted money are non-breaking; tests read them as plain spaces.
const money = (t: string) =>
  new RegExp(`^${t.replace(/[.$+]/g, (c) => `\\${c}`).replace(/ /g, String.raw`\s`)}$`);
const text = (t: string) => screen.getByText(money(t));

const wide = () =>
  jest
    .spyOn(jest.requireActual<typeof import('react-native')>('react-native'), 'useWindowDimensions')
    .mockReturnValue({ width: 1440, height: 900, scale: 1, fontScale: 1 });

beforeEach(() => {
  jest.restoreAllMocks();
  mockAuth.mockReturnValue({ state: { status: 'signedIn', me: {} } } as ReturnType<typeof useAuth>);
  answer({ data: overview({ month: currentMonth() }) });
});

describe('InvestmentsScreen session', () => {
  it('waits for the session, then sends signed-out people to login', async () => {
    mockAuth.mockReturnValue({ state: { status: 'loading' } } as ReturnType<typeof useAuth>);
    await render(<InvestmentsScreen />);
    expect(screen.queryByText('Investimentos')).toBeNull();
    mockAuth.mockReturnValue({ state: { status: 'signedOut' } } as ReturnType<typeof useAuth>);
    await render(<InvestmentsScreen />);
    expect(screen.getByText('redirect /login')).toBeTruthy();
  });
});

describe('InvestmentsScreen on the phone', () => {
  it('shows loading, error and empty states', async () => {
    answer({});
    await render(<InvestmentsScreen />);
    expect(screen.queryByText('Seus produtos')).toBeNull();
    answer({ isError: true });
    await render(<InvestmentsScreen />);
    expect(screen.getByText('Não consegui carregar. Tente de novo.')).toBeTruthy();
    answer({ data: overview({ totals: [] }) });
    await render(<InvestmentsScreen />);
    expect(
      screen.getByText('Nenhuma aplicação ou resgate nos extratos enviados até agora.'),
    ).toBeTruthy();
  });

  it('shows the total, the month and the products', async () => {
    await render(<InvestmentsScreen />);
    expect(text('R$ 4.000,00')).toBeTruthy();
    expect(text('+R$ 1.500,00')).toBeTruthy();
    expect(screen.getByText('RDB')).toBeTruthy();
    expect(screen.getByText('sem movimento no mês')).toBeTruthy();
    expect(screen.getByText(/lido dos extratos/)).toBeTruthy();
  });

  it('switches currency and says when the month had no moves', async () => {
    await render(<InvestmentsScreen />);
    await fireEvent.press(screen.getByText('EUR'));
    expect(screen.getAllByText(money('€ 300,00')).length).toBeGreaterThan(0);
    expect(screen.getByText(/^Nenhum movimento em /)).toBeTruthy();
    expect(screen.getByText('Wise Interest')).toBeTruthy();
  });

  it('shows movements with the month figures', async () => {
    await render(<InvestmentsScreen />);
    await fireEvent.press(screen.getByTestId('segment-movimentos'));
    expect(screen.getByText('Investido por mês (aplicado menos resgatado)')).toBeTruthy();
    expect(screen.getByText('Resgatado')).toBeTruthy();
    expect(screen.getByText('Aplicação RDB')).toBeTruthy();
  });

  it('leaves out the figures and movements when the month is empty', async () => {
    answer({ data: overview({ history: [], movements: [] }) });
    await render(<InvestmentsScreen />);
    await fireEvent.press(screen.getByTestId('segment-movimentos'));
    expect(screen.queryByText('Resgatado')).toBeNull();
    expect(screen.getByText('Nenhuma aplicação ou resgate neste mês.')).toBeTruthy();
  });

  it('asks for another month when the arrow is pressed', async () => {
    await render(<InvestmentsScreen />);
    await fireEvent.press(screen.getByLabelText('Mês anterior'));
    const months = mockInvestments.mock.calls.map((c) => c[0]);
    expect(months[months.length - 1]).not.toBe(currentMonth());
  });
});

describe('InvestmentsScreen on a computer', () => {
  it('shows the four figures and both cards', async () => {
    wide();
    await render(<InvestmentsScreen />);
    expect(screen.getByText('APLICADO NO TOTAL')).toBeTruthy();
    expect(screen.getByText('SEUS PRODUTOS')).toBeTruthy();
    expect(screen.getByText('INVESTIDO POR MÊS')).toBeTruthy();
    expect(screen.getByText('Aplicação RDB')).toBeTruthy();
    await fireEvent.press(screen.getByText('EUR'));
    expect(screen.getAllByText(money('€ 300,00')).length).toBeGreaterThan(0);
  });

  it('shows zeros without a month and no currency chips while loading', async () => {
    wide();
    answer({ data: overview({ totals: [overview().totals[0]], history: [] }) });
    await render(<InvestmentsScreen />);
    expect(screen.queryByText('EUR')).toBeNull();
    expect(screen.getAllByText(money('R$ 0,00'))).toHaveLength(3);
    answer({});
    await render(<InvestmentsScreen />);
    expect(screen.queryByText('SEUS PRODUTOS')).toBeNull();
  });

  it('stacks the cards on a narrow computer', async () => {
    jest
      .spyOn(
        jest.requireActual<typeof import('react-native')>('react-native'),
        'useWindowDimensions',
      )
      .mockReturnValue({ width: 960, height: 900, scale: 1, fontScale: 1 });
    await render(<InvestmentsScreen />);
    expect(screen.getByText('SEUS PRODUTOS')).toBeTruthy();
  });
});
