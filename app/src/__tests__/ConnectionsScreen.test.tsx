import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Linking, Platform } from 'react-native';

import ConnectionsScreen from '@/app/(tabs)/conexoes';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { disconnectBank, startConnection, syncConnection } from '@/lib/imports';
import { useAccounts, useConnections } from '@/lib/queries';
import type { Account, Connection, ConnectionsOverview } from '@/lib/types';
import { useConnect } from '@/lib/useConnect';

jest.mock('expo-router', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Link: ({ children }: { children: string }) => <Text>{children}</Text>,
    Redirect: () => null,
    router: { navigate: jest.fn() },
  };
});
jest.mock('@/lib/auth', () => ({ useAuth: jest.fn() }));
jest.mock('@/lib/queries', () => ({ useConnections: jest.fn(), useAccounts: jest.fn() }));
jest.mock('@/lib/imports', () => ({
  startConnection: jest.fn(),
  syncConnection: jest.fn(),
  disconnectBank: jest.fn(),
}));

const mockConnections = jest.mocked(useConnections);
const mockAccounts = jest.mocked(useAccounts);
const mockStart = jest.mocked(startConnection);
const mockSync = jest.mocked(syncConnection);
const mockDisconnect = jest.mocked(disconnectBank);

const wise: Connection = {
  id: 'c1',
  provider: 'enablebanking',
  bank: 'Wise',
  accounts: [{ account_id: 'a1', name: 'Wise EUR', currency: 'EUR', is_card: false }],
  consent_expires_at: null,
  last_sync_at: null,
  last_error: null,
};
const accounts = [
  { id: 'a1', name: 'Wise EUR', bank: 'Wise', currency: 'EUR', is_card: false },
  { id: 'a2', name: 'Conta', bank: 'Nubank', currency: 'BRL', is_card: true },
] as Account[];

const overview = (o: Partial<ConnectionsOverview> = {}) =>
  mockConnections.mockReturnValue({
    data: { connections: [wise], european_banks: ['Wise', 'Revolut'], brazil_ready: true, ...o },
    isError: false,
  } as ReturnType<typeof useConnections>);

const show = () =>
  render(
    <QueryClientProvider
      client={
        // No garbage-collection timers, so jest can exit right after the tests.
        new QueryClient({
          defaultOptions: {
            mutations: { retry: false, gcTime: Infinity },
            queries: { gcTime: Infinity },
          },
        })
      }
    >
      <ConnectionsScreen />
    </QueryClientProvider>,
  );

beforeEach(() => {
  jest.restoreAllMocks();
  jest
    .mocked(useAuth)
    .mockReturnValue({ state: { status: 'signedIn', me: {} } } as ReturnType<typeof useAuth>);
  overview();
  mockAccounts.mockReturnValue({ data: accounts, isError: false } as ReturnType<
    typeof useAccounts
  >);
});

describe('ConnectionsScreen', () => {
  it('lists connected banks, banks to connect and every account', async () => {
    await show();
    expect(screen.getByText('‹ Início')).toBeTruthy();
    expect(screen.getByText('Bancos conectados')).toBeTruthy();
    expect(screen.getByText('Enable Banking')).toBeTruthy();
    expect(screen.getByText('Conectado')).toBeTruthy();
    expect(screen.getByText('Conectar')).toBeTruthy();
    expect(screen.getByText('Automática')).toBeTruthy();
    expect(screen.getByText('Por extrato')).toBeTruthy();
    expect(screen.getByText('Nubank · BRL · Cartão')).toBeTruthy();
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await fireEvent.press(screen.getByText('Abrir Meu Pluggy'));
    expect(open).toHaveBeenCalledWith('https://meu.pluggy.ai');
  });

  it('reads a bank now and shows what arrived', async () => {
    mockSync.mockResolvedValue({
      connection: wise,
      accounts: [{ name: 'Wise EUR', new: 2, duplicate: 1, error: null }],
    });
    await show();
    await fireEvent.press(screen.getByText('Sincronizar agora'));
    await screen.findByText('Wise EUR: 2 novas, 1 já existiam');
    mockSync.mockRejectedValue(new ApiError(502, 'O banco não respondeu.'));
    await fireEvent.press(screen.getByText('Sincronizar agora'));
    await screen.findByText('O banco não respondeu.');
  });

  it('asks before disconnecting a bank', async () => {
    mockDisconnect.mockResolvedValue(undefined);
    await show();
    await fireEvent.press(screen.getByText('Desconectar'));
    expect(screen.getByText('Parar de ler o Wise? As transações ficam.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Cancelar'));
    expect(screen.queryByText(/Parar de ler/)).toBeNull();
    await fireEvent.press(screen.getByText('Desconectar'));
    await fireEvent.press(screen.getAllByText('Desconectar')[0]);
    await waitFor(() => expect(mockDisconnect).toHaveBeenCalledWith('c1'));
  });

  it('warns about an ending authorization and offers to reconnect', async () => {
    const soon = new Date(Date.now() + 3 * 86_400_000).toISOString();
    overview({
      connections: [{ ...wise, consent_expires_at: soon, last_error: 'Falhou ontem.' }],
    });
    mockStart.mockRejectedValue(new Error('offline'));
    await show();
    expect(screen.getByText(/A autorização vence em/)).toBeTruthy();
    expect(screen.getByText('Falhou ontem.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Conectar de novo'));
    await screen.findByText('Não deu para abrir o banco.');
  });

  it('opens a bank to authorize it', async () => {
    mockStart.mockResolvedValue({ url: 'https://bank.example/auth' });
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await show();
    await fireEvent.press(screen.getByText('Conectar'));
    await waitFor(() => expect(open).toHaveBeenCalledWith('https://bank.example/auth'));
    expect(mockStart).toHaveBeenCalledWith('Revolut');
  });

  it('says what is not set up yet', async () => {
    overview({ connections: [], european_banks: [], brazil_ready: false });
    await show();
    expect(screen.queryByText('Bancos conectados')).toBeNull();
    expect(screen.getAllByText('Falta configurar')).toHaveLength(2);
    expect(screen.getByText('Brasil, via Meu Pluggy')).toBeTruthy();
  });

  it('shows loading, errors and the first-statement invite', async () => {
    mockConnections.mockReturnValue({ data: undefined, isError: true } as ReturnType<
      typeof useConnections
    >);
    mockAccounts.mockReturnValue({ data: undefined, isError: true } as ReturnType<
      typeof useAccounts
    >);
    await show();
    expect(screen.getByText('Não consegui carregar as conexões.')).toBeTruthy();
    expect(screen.getByText('Não consegui carregar as contas.')).toBeTruthy();
    overview({ connections: [] });
    mockAccounts.mockReturnValue({ data: [], isError: false } as unknown as ReturnType<
      typeof useAccounts
    >);
    await show();
    await fireEvent.press(screen.getByText('Enviar extrato'));
    expect(router.navigate).toHaveBeenCalledWith('/upload');
  });

  it('drops the back link on a computer', async () => {
    jest
      .spyOn(
        jest.requireActual<typeof import('react-native')>('react-native'),
        'useWindowDimensions',
      )
      .mockReturnValue({ width: 1440, height: 900, scale: 1, fontScale: 1 });
    await show();
    expect(screen.queryByText('‹ Início')).toBeNull();
  });
});

describe('useConnect on the web', () => {
  it('sends the page to the bank', async () => {
    const os = Platform.OS;
    const assign = jest.fn();
    const saved = globalThis.window;
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
    Object.defineProperty(globalThis, 'window', {
      value: { ...saved, location: { assign } },
      configurable: true,
    });
    mockStart.mockResolvedValue({ url: 'https://bank.example/auth' });
    const { result } = await renderHook(() => useConnect());
    await act(() => result.current.connect('Wise'));
    expect(assign).toHaveBeenCalledWith('https://bank.example/auth');
    Object.defineProperty(globalThis, 'window', { value: saved, configurable: true });
    Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
  });
});
