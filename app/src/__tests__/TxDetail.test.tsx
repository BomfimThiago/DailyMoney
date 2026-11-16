import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { TxDetail } from '@/components/TxDetail';
import { ApiError } from '@/lib/api';
import {
  decideReview,
  deleteTransaction,
  setKind,
  updateCategory,
  updateTransaction,
} from '@/lib/imports';
import type { Category, Transaction } from '@/lib/types';

jest.mock('@/lib/imports', () => ({
  updateCategory: jest.fn(),
  updateTransaction: jest.fn(),
  setKind: jest.fn(),
  deleteTransaction: jest.fn(),
  decideReview: jest.fn(),
}));
const categories: Category[] = [
  { id: 'c-mercado', name: 'Mercado', kind: 'expense', color: '#000000' },
  { id: 'c-rest', name: 'Restaurantes', kind: 'expense', color: '#000000' },
  { id: 'c-salario', name: 'Salário', kind: 'income', color: '#000000' },
  { id: 'c-transf', name: 'Transferência', kind: 'transfer', color: '#000000' },
];
jest.mock('@/lib/queries', () => ({
  useCategories: () => ({ data: categories, isError: false }),
}));
const mockUpdate = jest.mocked(updateCategory);
const mockEdit = jest.mocked(updateTransaction);
const mockKind = jest.mocked(setKind);
const mockDelete = jest.mocked(deleteTransaction);
const mockDecide = jest.mocked(decideReview);

const tx = (o: Partial<Transaction> = {}): Transaction => ({
  id: 'tx-1',
  date: '2026-11-28',
  description: 'Pão de Açúcar',
  amount: '-312.4000',
  currency: 'BRL',
  kind: 'regular',
  account_id: 'a',
  account_name: 'Nubank',
  category_id: 'c-mercado',
  category_name: 'Mercado',
  member_id: null,
  review: 'approved',
  ...o,
});

beforeEach(() => {
  for (const m of [mockUpdate, mockEdit, mockKind, mockDelete, mockDecide]) m.mockReset();
});

describe('TxDetail', () => {
  it('offers spending categories for money out and income ones for money in', async () => {
    await render(<TxDetail t={tx()} onChanged={jest.fn()} />);
    expect(screen.getByText('Restaurantes')).toBeTruthy();
    expect(screen.queryByText('Salário')).toBeNull();
    expect(screen.queryByText('Transferência')).toBeNull();

    await render(<TxDetail t={tx({ amount: '8500.0000' })} onChanged={jest.fn()} />);
    expect(screen.getByText('Salário')).toBeTruthy();
    expect(screen.queryByText('Restaurantes')).toBeNull();
  });

  it('saves the new category for this shop too, then refreshes', async () => {
    mockUpdate.mockResolvedValue(tx());
    const onChanged = jest.fn();
    await render(<TxDetail t={tx()} onChanged={onChanged} />);
    await fireEvent.press(screen.getByText('Restaurantes'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(mockUpdate).toHaveBeenCalledWith('tx-1', 'c-rest', true);
  });

  it('can save only this line, and ignores the category it already has', async () => {
    mockUpdate.mockResolvedValue(tx());
    await render(<TxDetail t={tx()} onChanged={jest.fn()} />);
    await fireEvent.press(screen.getByText('Mercado'));
    expect(mockUpdate).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('checkbox'));
    await fireEvent.press(screen.getByText('Restaurantes'));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('tx-1', 'c-rest', false));
  });

  it('shows what the API said when saving fails', async () => {
    mockUpdate.mockRejectedValue(new ApiError(404, 'Categoria não encontrada'));
    await render(<TxDetail t={tx()} onChanged={jest.fn()} />);
    await fireEvent.press(screen.getByText('Restaurantes'));
    expect(await screen.findByText('Categoria não encontrada')).toBeTruthy();
  });

  it('edits description, date, amount and direction, sending only what changed', async () => {
    mockEdit.mockResolvedValue(tx());
    const onChanged = jest.fn();
    await render(<TxDetail t={tx()} onChanged={onChanged} />);
    await fireEvent.press(screen.getByText('Editar'));
    expect(screen.getByLabelText('Valor').props.value).toBe('312,40');
    await fireEvent.changeText(screen.getByLabelText('Descrição'), 'Mercado do bairro');
    await fireEvent.changeText(screen.getByLabelText('Data'), '27/11/2026');
    await fireEvent.changeText(screen.getByLabelText('Valor'), '1.050,5');
    await fireEvent.press(screen.getByText('Entrou dinheiro'));
    await fireEvent.press(screen.getByText('Salvar'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(mockEdit).toHaveBeenCalledWith('tx-1', {
      description: 'Mercado do bairro',
      date: '2026-11-27',
      amount: '1050.5',
    });
    expect(mockKind).not.toHaveBeenCalled();
    expect(screen.getByText('Editar')).toBeTruthy();
  });

  it('says what is wrong and does not save', async () => {
    await render(<TxDetail t={tx()} onChanged={jest.fn()} />);
    await fireEvent.press(screen.getByText('Editar'));
    await fireEvent.changeText(screen.getByLabelText('Data'), '31/02/2026');
    await fireEvent.changeText(screen.getByLabelText('Valor'), 'abc');
    await fireEvent.press(screen.getByText('Salvar'));
    expect(screen.getByText('Data inválida (ex.: 28/11/2026).')).toBeTruthy();
    expect(screen.getByText('Valor inválido (ex.: 312,40).')).toBeTruthy();
    expect(mockEdit).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Cancelar'));
    expect(screen.getByText('Pão de Açúcar')).toBeTruthy();
  });

  it('can say the line was an investment', async () => {
    mockKind.mockResolvedValue(tx({ kind: 'investment' }));
    const onChanged = jest.fn();
    await render(<TxDetail t={tx()} onChanged={onChanged} />);
    await fireEvent.press(screen.getByText('Editar'));
    await fireEvent.press(screen.getByText('Investimento'));
    await fireEvent.press(screen.getByText('Salvar'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(mockEdit).not.toHaveBeenCalled();
    expect(mockKind).toHaveBeenCalledWith('tx-1', 'investment');
  });

  it('shows the error when saving the edit fails', async () => {
    mockEdit.mockRejectedValue(new ApiError(404, 'Transação não encontrada'));
    await render(<TxDetail t={tx()} onChanged={jest.fn()} />);
    await fireEvent.press(screen.getByText('Editar'));
    await fireEvent.changeText(screen.getByLabelText('Descrição'), 'Outro');
    await fireEvent.press(screen.getByText('Salvar'));
    expect(await screen.findByText('Transação não encontrada')).toBeTruthy();
  });

  it('deletes only after confirming', async () => {
    mockDelete.mockResolvedValue(undefined);
    const onChanged = jest.fn();
    await render(<TxDetail t={tx()} onChanged={onChanged} />);
    await fireEvent.press(screen.getByText('Excluir'));
    expect(screen.getByText('Excluir esta transação?')).toBeTruthy();
    await fireEvent.press(screen.getByText('Cancelar'));
    expect(mockDelete).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Excluir'));
    await fireEvent.press(screen.getAllByText('Excluir').at(-1)!);
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(mockDelete).toHaveBeenCalledWith('tx-1');
  });

  it('shows the error when deleting fails', async () => {
    mockDelete.mockRejectedValue(new ApiError(404, 'Transação não encontrada'));
    await render(<TxDetail t={tx()} onChanged={jest.fn()} />);
    await fireEvent.press(screen.getByText('Excluir'));
    await fireEvent.press(screen.getAllByText('Excluir').at(-1)!);
    expect(await screen.findByText('Transação não encontrada')).toBeTruthy();
  });

  it('approves or turns down a line that just came in', async () => {
    const onChanged = jest.fn();
    await render(<TxDetail t={tx()} onChanged={onChanged} />);
    expect(screen.queryByText(/esperando sua aprovação/)).toBeNull();
    await render(<TxDetail t={tx({ review: 'pending' })} onChanged={onChanged} />);
    expect(screen.getByText('Importada, esperando sua aprovação para contar.')).toBeTruthy();
    mockDecide.mockResolvedValue({ count: 1, left: 0 });
    await fireEvent.press(screen.getByText('Aprovar'));
    expect(mockDecide).toHaveBeenCalledWith(['tx-1'], 'approve');
    await waitFor(() => expect(onChanged).toHaveBeenCalled());

    mockDecide.mockRejectedValue(new ApiError(500, 'Fora do ar'));
    await render(<TxDetail t={tx({ review: 'pending' })} onChanged={onChanged} />);
    await fireEvent.press(screen.getByText('Rejeitar'));
    expect(mockDecide).toHaveBeenLastCalledWith(['tx-1'], 'reject');
    expect(await screen.findByText('Fora do ar')).toBeTruthy();
  });
});
