import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { TxDetail } from '@/components/TxDetail';
import { ApiError } from '@/lib/api';
import { updateCategory } from '@/lib/imports';
import type { Category, Transaction } from '@/lib/types';

jest.mock('@/lib/imports', () => ({ updateCategory: jest.fn() }));
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
  ...o,
});

beforeEach(() => {
  mockUpdate.mockReset();
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
});
