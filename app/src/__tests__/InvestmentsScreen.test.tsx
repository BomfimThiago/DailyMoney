import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import InvestmentsScreen from '@/app/(tabs)/investimentos';
import { useAuth } from '@/lib/auth';
import { usePortfolio } from '@/lib/queries';
import { withCurrency } from '@/testing/currency';
import { emptyPortfolio, portfolio } from '@/testing/portfolio';

jest.mock('expo-router', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Redirect: ({ href }: { href: string }) => <Text>{`redirect ${href}`}</Text>,
    Link: ({ children, testID }: { children: string; testID?: string }) => (
      <Text testID={testID}>{children}</Text>
    ),
  };
});
jest.mock('@/lib/auth', () => ({ useAuth: jest.fn() }));
jest.mock('@/lib/api', () => ({
  ...jest.requireActual<typeof import('@/lib/api')>('@/lib/api'),
  api: jest.fn(() => Promise.resolve({})),
}));
jest.mock('@/lib/queries', () => ({ usePortfolio: jest.fn() }));

const mockAuth = jest.mocked(useAuth);
const mockPortfolio = jest.mocked(usePortfolio);

const holding = (o: Partial<ReturnType<typeof usePortfolio>>) =>
  mockPortfolio.mockReturnValue({ data: undefined, isError: false, ...o } as ReturnType<
    typeof usePortfolio
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
  mockAuth.mockReturnValue({
    state: { status: 'signedIn', me: { family: { display_currency: 'BRL' } } },
  } as ReturnType<typeof useAuth>);
  holding({ data: emptyPortfolio() });
});

describe('InvestmentsScreen session', () => {
  it('waits for the session, then sends signed-out people to login', async () => {
    mockAuth.mockReturnValue({ state: { status: 'loading' } } as ReturnType<typeof useAuth>);
    await render(withCurrency(<InvestmentsScreen />));
    expect(screen.queryByText('Investimentos')).toBeNull();
    mockAuth.mockReturnValue({ state: { status: 'signedOut' } } as ReturnType<typeof useAuth>);
    await render(withCurrency(<InvestmentsScreen />));
    expect(screen.getByText('redirect /login')).toBeTruthy();
  });
});

describe('the bank portfolio', () => {
  it('opens the phone on it, with loading, error and empty states', async () => {
    holding({});
    await render(withCurrency(<InvestmentsScreen />));
    expect(screen.queryByText('Saldo no banco')).toBeNull();
    holding({ isError: true });
    await render(withCurrency(<InvestmentsScreen />));
    expect(screen.getByText('Não consegui carregar. Tente de novo.')).toBeTruthy();
    holding({ data: emptyPortfolio() });
    await render(withCurrency(<InvestmentsScreen />));
    expect(screen.getByText(/^Conecte o Nubank ou o Inter/)).toBeTruthy();
    expect(screen.queryByLabelText('Mês anterior')).toBeNull();
  });

  it('shows the balance, the types, the maturities and each investment on the phone', async () => {
    holding({ data: portfolio() });
    await render(withCurrency(<InvestmentsScreen />));
    expect(text('R$ 1.500,00')).toBeTruthy();
    expect(screen.getByText(/\(\+10,0%\)$/)).toBeTruthy();
    expect(screen.getByText('73% em renda fixa, 27% em ETFs.')).toBeTruthy();
    expect(screen.getByText('BOVA11')).toBeTruthy();
    expect(screen.getByText('Nubank · 110% do CDI · vence 15/03/2027')).toBeTruthy();
    expect(
      screen.getByText('1 investimento resgatado ou encerrado não aparece aqui.'),
    ).toBeTruthy();
    expect(screen.getByText('16/10/2026 a 16/11/2026')).toBeTruthy();
    expect(screen.getByText('2027')).toBeTruthy();
    expect(screen.getByText('73% da carteira · 1 investimento')).toBeTruthy();
    expect(screen.getByText(/^O maior volume volta em 2027/)).toBeTruthy();
    expect(screen.getByText(/^Saldo líquido \(já sem IR e taxas\)/)).toBeTruthy();
    expect(screen.getByTestId('banks-link')).toBeTruthy();
    expect(screen.queryByTestId('segment-produtos')).toBeNull();
  });

  it('fills the page on a computer, with no statements part and no month', async () => {
    wide();
    holding({
      data: portfolio({
        closed: 2,
        tracked: null,
        ladder: null,
        history: [],
        classes: portfolio().classes.slice(0, 1),
      }),
    });
    await render(withCurrency(<InvestmentsScreen />));
    expect(screen.getByText('SALDO NO BANCO')).toBeTruthy();
    expect(screen.getByText('—')).toBeTruthy();
    expect(screen.getByText('Tudo em renda fixa.')).toBeTruthy();
    expect(screen.getByText('Nenhum investimento com data de vencimento.')).toBeTruthy();
    expect(
      screen.getByText('2 investimentos resgatados ou encerrados não aparecem aqui.'),
    ).toBeTruthy();
    expect(screen.queryByText('SEUS PRODUTOS')).toBeNull();
    expect(screen.queryByText(/Aplicações e resgates/)).toBeNull();
    expect(screen.queryByLabelText('Mês anterior')).toBeNull();
    await fireEvent.press(screen.getByText('EUR'));
    holding({ data: emptyPortfolio({ has_source: true }) });
    await render(withCurrency(<InvestmentsScreen />));
    expect(screen.getByText(/ainda não informou/)).toBeTruthy();
  });

  it('draws the history once it knows its width', async () => {
    holding({ data: portfolio() });
    await render(withCurrency(<InvestmentsScreen />));
    const chart = screen.getByLabelText(/^De R\$/);
    await fireEvent(chart, 'layout', { nativeEvent: { layout: { width: 300, height: 96 } } });
    expect(screen.getByLabelText(/^De R\$/)).toBeTruthy();
  });
});
