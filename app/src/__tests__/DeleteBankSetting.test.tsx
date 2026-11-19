import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { DeleteBankSetting } from '@/components/settings/DeleteBankSetting';
import { ApiError } from '@/lib/api';
import { deleteBankTransactions, getBankPurge } from '@/lib/imports';
import { bankPurgeButton, bankPurgeLines } from '@/lib/purge';
import type { BankPurge } from '@/lib/types';

jest.mock('@/lib/imports', () => ({
  getBankPurge: jest.fn(),
  deleteBankTransactions: jest.fn(),
}));
const mockBanks = jest.mocked(getBankPurge);
const mockDelete = jest.mocked(deleteBankTransactions);

const bank = (b: Partial<BankPurge> = {}): BankPurge => ({
  bank: 'Nubank',
  transactions: 120,
  to_review: 3,
  imports: 2,
  connected: true,
  accounts: [
    { id: 'a1', name: 'Nubank BRL', currency: 'BRL', is_card: false, transactions: 80 },
    { id: 'a2', name: 'Nubank cartão', currency: 'BRL', is_card: true, transactions: 40 },
  ],
  ...b,
});

function wrap(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('bank purge words', () => {
  it('says what goes and what stays', () => {
    expect(bankPurgeLines(bank())).toEqual([
      'Vão embora 120 transações (3 esperando revisão) do Nubank, de todos os meses, das contas Nubank BRL, Nubank cartão.',
      'Saem também do histórico os 2 envios de extrato que só tinham linhas dele.',
      'Transferências com outros bancos voltam para Transferências, esperando você dizer o que eram.',
      'Ficam as contas, os outros bancos, as categorias, as regras e os responsáveis.',
      'O banco conectado lê o histórico de novo na próxima leitura, para você revisar.',
    ]);
    const one = bank({
      transactions: 1,
      to_review: 0,
      imports: 1,
      connected: false,
      accounts: [bank().accounts[0]],
    });
    expect(bankPurgeLines(one)).toEqual([
      'Vão embora 1 transação do Nubank, de todos os meses, da conta Nubank BRL.',
      'Sai também do histórico o envio de extrato que só tinha linhas dele.',
      'Transferências com outros bancos voltam para Transferências, esperando você dizer o que eram.',
      'Ficam as contas, os outros bancos, as categorias, as regras e os responsáveis.',
    ]);
    expect(bankPurgeLines(bank({ imports: 0, connected: false }))).toHaveLength(3);
    expect(bankPurgeButton(one)).toBe('Apagar 1 transação do Nubank');
    expect(bankPurgeButton(bank())).toBe('Apagar 120 transações do Nubank');
  });
});

describe('DeleteBankSetting', () => {
  it('deletes one bank only after it is chosen and the word is typed', async () => {
    mockBanks.mockResolvedValue([bank(), bank({ bank: 'Revolut', transactions: 7, accounts: [] })]);
    await render(wrap(<DeleteBankSetting />));
    await fireEvent.press(screen.getByText('Escolher o banco…'));
    await fireEvent.press(await screen.findByLabelText('Banco'));
    await fireEvent.press(screen.getByText('Nubank · 120 transações'));
    await screen.findByText(/Vão embora 120 transações/);

    await fireEvent.press(screen.getByText('Apagar 120 transações do Nubank'));
    expect(mockDelete).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('Digite APAGAR para confirmar'), 'apagar');
    mockDelete.mockRejectedValueOnce(new ApiError(409, 'Agora são 121 transações, não 120.'));
    await fireEvent.press(screen.getByText('Apagar 120 transações do Nubank'));
    await screen.findByText('Agora são 121 transações, não 120.');
    expect(mockDelete).toHaveBeenCalledWith('Nubank', 120);

    mockDelete.mockResolvedValueOnce({ removed: 120 });
    await fireEvent.press(screen.getByText('Apagar 120 transações do Nubank'));
    await screen.findByText('Pronto: 120 transações do Nubank apagadas.');
    expect(screen.getByText('Escolher o banco…')).toBeTruthy();
  });

  it('says when there is nothing to delete, and offers to count again on failure', async () => {
    mockBanks.mockResolvedValueOnce([]);
    await render(wrap(<DeleteBankSetting />));
    await fireEvent.press(screen.getByText('Escolher o banco…'));
    await screen.findByText('Não há transações para apagar.');
    await fireEvent.press(screen.getByText('Fechar'));
    expect(screen.queryByText('Não há transações para apagar.')).toBeNull();
  });

  it('shows the error and closes without choosing', async () => {
    mockBanks.mockRejectedValueOnce(new ApiError(500, 'Falhou'));
    await render(wrap(<DeleteBankSetting />));
    await fireEvent.press(screen.getByText('Escolher o banco…'));
    await screen.findByText('Falhou');
    mockBanks.mockResolvedValueOnce([bank()]);
    await fireEvent.press(screen.getByText('Tentar de novo'));
    await screen.findByLabelText('Banco');
    await fireEvent.press(screen.getByText('Cancelar'));
    expect(screen.queryByLabelText('Banco')).toBeNull();
  });
});
