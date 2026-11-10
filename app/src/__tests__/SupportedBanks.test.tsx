import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { SupportedBanks } from '@/components/SupportedBanks';
import { ApiError } from '@/lib/api';
import { askForBank, listBankRequests } from '@/lib/imports';
import type { BankRequest } from '@/lib/types';

jest.mock('@/lib/imports', () => ({ askForBank: jest.fn(), listBankRequests: jest.fn() }));
const mockAsk = jest.mocked(askForBank);
const mockList = jest.mocked(listBankRequests);

const req = (bank_name: string): BankRequest => ({
  id: `r-${bank_name}`,
  bank_name,
  note: null,
  created_at: '2026-11-10T12:00:00Z',
});

// No garbage-collection timers left running after a test.
let client: QueryClient;

async function show() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  await render(
    <QueryClientProvider client={client}>
      <SupportedBanks />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(client.isFetching()).toBe(0));
}

afterEach(() => {
  client.clear();
});

beforeEach(() => {
  mockAsk.mockReset();
  mockList.mockReset();
  mockList.mockResolvedValue([]);
});

describe('SupportedBanks', () => {
  it('lists the banks the app reads', async () => {
    await show();
    expect(screen.getByText('Bancos suportados')).toBeTruthy();
    expect(screen.getByText('CaixaBank')).toBeTruthy();
  });

  it('sends the typed bank and shows it among the requests', async () => {
    mockAsk.mockResolvedValue(req('Santander'));
    await show();
    await fireEvent.changeText(screen.getByLabelText('Nome do banco'), '  Santander ');
    mockList.mockResolvedValue([req('Santander')]);
    await fireEvent.press(screen.getByText('Pedir'));
    expect(await screen.findByText('Pedido de Santander registrado.')).toBeTruthy();
    expect(mockAsk).toHaveBeenCalledWith('Santander');
    expect(await screen.findByText('Já pedidos: Santander')).toBeTruthy();
  });

  it('does not send an empty name, and shows what the API said on failure', async () => {
    mockAsk.mockRejectedValue(new ApiError(422, 'Nome inválido'));
    await show();
    await fireEvent.press(screen.getByText('Pedir'));
    expect(mockAsk).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Nome do banco'), 'BBVA');
    await fireEvent.press(screen.getByText('Pedir'));
    expect(await screen.findByText('Nome inválido')).toBeTruthy();
  });
});
