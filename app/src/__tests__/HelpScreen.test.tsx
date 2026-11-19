import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import HelpScreen from '@/app/(tabs)/duvidas';
import { useAuth } from '@/lib/auth';

jest.mock('expo-router', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Redirect: ({ href }: { href: string }) => <Text>{`redirect ${href}`}</Text>,
    Link: ({ children }: { children: string }) => <Text>{children}</Text>,
  };
});
jest.mock('@/lib/auth', () => ({ useAuth: jest.fn() }));

describe('Dúvidas', () => {
  it('explains the credit card, one answer open at a time on demand', async () => {
    jest.mocked(useAuth).mockReturnValue({
      state: { status: 'signedIn', me: { name: 'Thiago' } },
    } as never);
    await render(<HelpScreen />);
    expect(screen.getByText('Dúvidas')).toBeTruthy();
    // The first answer starts open.
    expect(screen.getByText(/No dia em que você comprou/)).toBeTruthy();
    expect(screen.queryByText(/Porque as compras já contaram/)).toBeNull();
    await fireEvent.press(screen.getByText('Por que pagar a fatura não conta como gasto?'));
    expect(screen.getByText(/Porque as compras já contaram/)).toBeTruthy();
    await fireEvent.press(screen.getByText('E se o cartão não estiver no app?'));
    expect(screen.getByText(/o app conta o pagamento como gasto/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Quando uma compra no cartão conta como gasto?'));
    expect(screen.queryByText(/No dia em que você comprou/)).toBeNull();
  });
});
