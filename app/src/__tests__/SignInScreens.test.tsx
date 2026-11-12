import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import ConnectionReturnScreen from '@/app/conexoes/retorno';
import EnterScreen from '@/app/entrar';
import LoginScreen from '@/app/login';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { finishConnection } from '@/lib/imports';
import type { SyncResult } from '@/lib/types';

jest.mock('expo-router', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Link: ({ children }: { children: string }) => <Text>{children}</Text>,
    Redirect: ({ href }: { href: string }) => <Text>{`redirect ${href}`}</Text>,
    router: { replace: jest.fn() },
    useLocalSearchParams: jest.fn(),
  };
});
jest.mock('@/lib/auth', () => ({ useAuth: jest.fn() }));
jest.mock('@/lib/imports', () => ({ finishConnection: jest.fn() }));

const mockAuth = jest.mocked(useAuth);
const mockParams = jest.mocked(useLocalSearchParams);
const mockFinish = jest.mocked(finishConnection);
const requestLink = jest.fn<(email: string) => Promise<void>>();
const signInWithLink = jest.fn<(token: string) => Promise<void>>();

const auth = (status: 'loading' | 'signedOut' | 'signedIn') =>
  mockAuth.mockReturnValue({
    state: status === 'signedIn' ? { status, me: {} } : { status },
    requestLink,
    signInWithLink,
  } as unknown as ReturnType<typeof useAuth>);

beforeEach(() => {
  jest.clearAllMocks();
  auth('signedOut');
});

describe('LoginScreen', () => {
  it('sends the link once the e-mail looks right', async () => {
    requestLink.mockResolvedValue(undefined);
    await render(<LoginScreen />);
    const button = screen.getByText('Enviar link para entrar');
    await fireEvent.press(button);
    expect(requestLink).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('E-mail'), ' pessoa@exemplo.com ');
    await fireEvent(screen.getByLabelText('E-mail'), 'submitEditing');
    expect(requestLink).toHaveBeenCalledWith('pessoa@exemplo.com');
    await screen.findByText('Confira seu e-mail');
    expect(screen.getByText(/Se pessoa@exemplo.com tiver acesso/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Usar outro e-mail'));
    expect(screen.getByLabelText('E-mail')).toBeTruthy();
  });

  it('shows why the link was not sent', async () => {
    requestLink.mockRejectedValueOnce(new ApiError(429, 'Muitas tentativas.'));
    requestLink.mockRejectedValueOnce(new Error('offline'));
    await render(<LoginScreen />);
    await fireEvent.changeText(screen.getByLabelText('E-mail'), 'pessoa@exemplo.com');
    await fireEvent.press(screen.getByText('Enviar link para entrar'));
    await screen.findByText('Muitas tentativas.');
    await fireEvent.press(screen.getByText('Enviar link para entrar'));
    await screen.findByText('Não foi possível enviar o link');
  });

  it('ignores a second press while sending', async () => {
    let finish = () => {};
    requestLink.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    await render(<LoginScreen />);
    await fireEvent.changeText(screen.getByLabelText('E-mail'), 'pessoa@exemplo.com');
    void fireEvent.press(screen.getByText('Enviar link para entrar'));
    await waitFor(() => expect(screen.queryByText('Enviar link para entrar')).toBeNull());
    void fireEvent(screen.getByLabelText('E-mail'), 'submitEditing');
    expect(requestLink).toHaveBeenCalledTimes(1);
    finish();
    await screen.findByText('Confira seu e-mail');
  });

  it('skips the form when already signed in', async () => {
    auth('signedIn');
    await render(<LoginScreen />);
    expect(screen.getByText('redirect /')).toBeTruthy();
  });
});

describe('EnterScreen', () => {
  it('trades the token for a session once', async () => {
    signInWithLink.mockResolvedValue(undefined);
    mockParams.mockReturnValue({ token: 't1' });
    auth('loading');
    const view = await render(<EnterScreen />);
    expect(signInWithLink).not.toHaveBeenCalled();
    auth('signedOut');
    await view.rerender(<EnterScreen />);
    await view.rerender(<EnterScreen />);
    expect(signInWithLink).toHaveBeenCalledTimes(1);
    auth('signedIn');
    await view.rerender(<EnterScreen />);
    expect(screen.getByText('redirect /')).toBeTruthy();
  });

  it('explains a bad or missing link', async () => {
    signInWithLink.mockRejectedValueOnce(new ApiError(400, 'Link expirado.'));
    mockParams.mockReturnValue({ token: 't1' });
    await render(<EnterScreen />);
    await screen.findByText('Link expirado.');
    signInWithLink.mockRejectedValueOnce(new Error('offline'));
    await render(<EnterScreen />);
    await screen.findByText('Não foi possível entrar');
    mockParams.mockReturnValue({});
    await render(<EnterScreen />);
    expect(screen.getByText('Link incompleto. Peça um novo.')).toBeTruthy();
  });
});

describe('ConnectionReturnScreen', () => {
  const result: SyncResult = {
    connection: {
      id: 'c1',
      provider: 'enablebanking',
      bank: 'Wise',
      accounts: [],
      consent_expires_at: null,
      last_sync_at: null,
      last_error: null,
    },
    accounts: [{ name: 'Wise EUR', new: 3, duplicate: 0, error: null }],
  };
  const show = () =>
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ConnectionReturnScreen />
      </QueryClientProvider>,
    );

  it('saves the connection and says what arrived', async () => {
    auth('signedIn');
    mockParams.mockReturnValue({ code: 'c', state: 's' });
    mockFinish.mockResolvedValue(result);
    await show();
    await screen.findByText('Wise conectado');
    expect(screen.getByText('Wise EUR: 3 novas')).toBeTruthy();
    expect(mockFinish).toHaveBeenCalledWith('c', 's');
    await fireEvent.press(screen.getByText('Ver Conexões'));
    expect(router.replace).toHaveBeenCalledWith('/conexoes');
  });

  it('waits while reading, and says when it failed', async () => {
    auth('signedIn');
    mockParams.mockReturnValue({ code: 'c', state: 's' });
    mockFinish.mockReturnValueOnce(new Promise(() => {}));
    await show();
    expect(screen.getByText('Lendo as transações do banco…')).toBeTruthy();
    mockFinish.mockRejectedValueOnce(new ApiError(400, 'Código usado.'));
    await show();
    await screen.findByText('Código usado.');
    mockFinish.mockRejectedValueOnce(new Error('offline'));
    await show();
    await screen.findByText('Não deu para concluir a conexão.');
  });

  it('says when the bank refused, and sends signed-out people to login', async () => {
    auth('signedIn');
    mockParams.mockReturnValue({ error: 'access_denied' });
    await show();
    expect(screen.getByText(/O banco não autorizou/)).toBeTruthy();
    mockParams.mockReturnValue({ code: 'c' });
    await show();
    await waitFor(() => expect(mockFinish).not.toHaveBeenCalled());
    auth('signedOut');
    await show();
    expect(screen.getByText('redirect /login')).toBeTruthy();
  });
});
