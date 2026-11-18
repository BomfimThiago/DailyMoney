import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { DeleteAllSetting } from '@/components/settings/DeleteAllSetting';
import { ApiError } from '@/lib/api';
import { deleteAllTransactions, getPurgeOverview } from '@/lib/imports';
import { confirmed, purgeButton, purgeLines } from '@/lib/purge';
import type { PurgeOverview } from '@/lib/types';
import { rereadNote, undoNote } from '@/lib/upload';
import { summary } from '@/testing/upload';

jest.mock('@/lib/imports', () => ({
  getPurgeOverview: jest.fn(),
  deleteAllTransactions: jest.fn(),
}));
const mockOverview = jest.mocked(getPurgeOverview);
const mockDelete = jest.mocked(deleteAllTransactions);

const overview = (o: Partial<PurgeOverview> = {}): PurgeOverview => ({
  transactions: 312,
  to_review: 12,
  imports: 5,
  banks: 2,
  ...o,
});

function wrap(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('purge words', () => {
  it('says what goes and what stays', () => {
    expect(purgeLines(overview())).toEqual([
      'Vão embora 312 transações (12 esperando revisão), de todos os meses e os 5 envios de extrato.',
      'Ficam as contas, as categorias, as regras, os responsáveis e os bancos conectados.',
      'Os 2 bancos conectados leem o histórico de novo na próxima leitura, para você revisar.',
    ]);
    expect(purgeLines(overview({ transactions: 1, to_review: 0, imports: 1, banks: 1 }))).toEqual([
      'Vão embora 1 transação, de todos os meses e o envio de extrato.',
      'Ficam as contas, as categorias, as regras, os responsáveis e os bancos conectados.',
      'O banco conectado lê o histórico de novo na próxima leitura, para você revisar.',
    ]);
    expect(purgeLines(overview({ imports: 0, banks: 0 }))).toHaveLength(2);
    expect(purgeButton(overview({ transactions: 1 }))).toBe('Apagar 1 transação');
    expect(confirmed(' apagar ')).toBe(true);
    expect(confirmed('apaga')).toBe(false);
  });

  it('describes undoing and re-reading a sent statement', () => {
    expect(undoNote(summary({ lines: 0 }))).toMatch(/sai só da lista/);
    expect(undoNote(summary({ lines: 1 }))).toMatch(/1 transação que veio dele/);
    expect(rereadNote(summary({ lines: 1 }))).toMatch(
      /Ao importar, a transação dele é trocada pelo/,
    );
  });
});

describe('DeleteAllSetting', () => {
  it('deletes everything only after the word is typed', async () => {
    mockOverview.mockResolvedValue(overview());
    await render(wrap(<DeleteAllSetting />));
    await fireEvent.press(screen.getByText('Apagar todas…'));
    await screen.findByText(/Vão embora 312 transações/);
    const button = screen.getByText('Apagar 312 transações');
    await fireEvent.press(button);
    expect(mockDelete).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('Digite APAGAR para confirmar'), 'apagar');
    mockDelete.mockRejectedValueOnce(new ApiError(409, 'Agora são 313 transações, não 312.'));
    await fireEvent.press(screen.getByText('Apagar 312 transações'));
    await screen.findByText('Agora são 313 transações, não 312.');
    expect(mockDelete).toHaveBeenCalledWith(312);

    mockDelete.mockResolvedValueOnce({ removed: 312 });
    await fireEvent.press(screen.getByText('Apagar 312 transações'));
    await screen.findByText('Pronto: 312 transações apagadas.');
    expect(screen.getByText('Apagar todas…')).toBeTruthy();
  });

  it('closes, and says when there is nothing to delete', async () => {
    mockOverview.mockResolvedValue(overview({ transactions: 0 }));
    await render(wrap(<DeleteAllSetting />));
    await fireEvent.press(screen.getByText('Apagar todas…'));
    await screen.findByText('Não há transações para apagar.');
    await fireEvent.press(screen.getByText('Fechar'));
    expect(screen.queryByText('Não há transações para apagar.')).toBeNull();
  });

  it('offers to count again when counting fails', async () => {
    mockOverview.mockRejectedValueOnce(new ApiError(500, 'Falhou'));
    await render(wrap(<DeleteAllSetting />));
    await fireEvent.press(screen.getByText('Apagar todas…'));
    await screen.findByText('Falhou');
    mockOverview.mockResolvedValueOnce(overview());
    await fireEvent.press(screen.getByText('Tentar de novo'));
    await waitFor(() => expect(screen.getByText(/Vão embora/)).toBeTruthy());
    await fireEvent.press(screen.getByText('Cancelar'));
    expect(screen.queryByText(/Vão embora/)).toBeNull();
  });
});
