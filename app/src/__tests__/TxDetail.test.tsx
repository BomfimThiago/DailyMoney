import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { TxDetail } from '@/components/TxDetail';
import { ApiError } from '@/lib/api';
import { decideReview, deleteTransaction, setKind, updateTransaction } from '@/lib/imports';
import type { Category, Transaction } from '@/lib/types';
import { category } from '@/testing/categories';

jest.mock('@/lib/imports', () => ({
  updateCategory: jest.fn(),
  updateTransaction: jest.fn(),
  setKind: jest.fn(),
  deleteTransaction: jest.fn(),
  decideReview: jest.fn(),
}));
const mockCategoryList: Category[] = [
  category({ id: 'c-mercado', name: 'Mercado' }),
  category({ id: 'c-rest', name: 'Restaurantes' }),
  category({ id: 'c-salario', name: 'Salário', kind: 'income' }),
  category({ id: 'c-transf', name: 'Transferência', kind: 'transfer' }),
];
const mockCurrencies = jest.fn<() => { data: unknown }>(() => ({ data: undefined }));
jest.mock('@/lib/queries', () => ({
  useLineCurrencies: () => mockCurrencies(),
  useCategories: () => ({ data: mockCategoryList, isError: false }),
  useFamily: () => ({
    data: { members: [{ id: 'm-ana', name: 'Ana', color: '#c7795a', user_id: null }] },
  }),
}));
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
  for (const m of [mockEdit, mockKind, mockDelete, mockDecide]) m.mockReset();
});

describe('TxDetail', () => {
  it('shows the line in the three currencies with the rate of its day', async () => {
    mockCurrencies.mockReturnValueOnce({
      data: {
        currency: 'BRL',
        rate_date: '2026-11-27',
        amounts: [
          { currency: 'BRL', amount: '-312.4000', rate: '1' },
          { currency: 'EUR', amount: '-52.0667', rate: '0.16666667' },
          { currency: 'USD', amount: '-62.4800', rate: '0.20000000' },
        ],
      },
    });
    await render(<TxDetail t={tx()} onChanged={jest.fn()} />);
    expect(screen.getByText('NAS TRÊS MOEDAS')).toBeTruthy();
    expect(screen.getByText('no extrato')).toBeTruthy();
    expect(screen.getByText('-€\u00a052,07')).toBeTruthy();
    expect(screen.getByText('1 BRL = 0,1667 EUR')).toBeTruthy();
    expect(screen.getByText('1 BRL = 0,20 USD')).toBeTruthy();
    expect(screen.getByText('Cotação do Banco Central Europeu de 27/11/2026')).toBeTruthy();
  });

  it('shows who the line belongs to, or the household', async () => {
    await render(<TxDetail t={tx({ member_id: 'm-ana' })} onChanged={jest.fn()} />);
    expect(screen.getByText('Responsável')).toBeTruthy();
    expect(screen.getByText('Ana')).toBeTruthy();
  });

  it('a line with no one belongs to the household', async () => {
    await render(<TxDetail t={tx()} onChanged={jest.fn()} />);
    expect(screen.getByText('Casa')).toBeTruthy();
  });

  it('gives the line to someone else, sending only the owner', async () => {
    mockEdit.mockResolvedValue({} as Transaction);
    const onChanged = jest.fn();
    await render(<TxDetail t={tx()} onChanged={onChanged} />);
    await fireEvent.press(screen.getByLabelText('Responsável'));
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Ana' }));
    await fireEvent.press(screen.getByText('Salvar'));
    await waitFor(() => expect(mockEdit).toHaveBeenCalledWith('tx-1', { member_id: 'm-ana' }));
    expect(onChanged).toHaveBeenCalled();
  });

  it('gives the line back to the household', async () => {
    mockEdit.mockResolvedValue({} as Transaction);
    await render(<TxDetail t={tx({ member_id: 'm-ana' })} onChanged={jest.fn()} />);
    await fireEvent.press(screen.getByLabelText('Responsável'));
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Casa' }));
    await fireEvent.press(screen.getByText('Salvar'));
    await waitFor(() => expect(mockEdit).toHaveBeenCalledWith('tx-1', { member_id: null }));
  });

  it('opens with the summary and the fields ready to change, no Editar step', async () => {
    await render(<TxDetail t={tx()} onChanged={jest.fn()} />);
    expect(screen.getAllByText('Pão de Açúcar').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Descrição').props.value).toBe('Pão de Açúcar');
    expect(screen.getByLabelText('Valor').props.value).toBe('312,40');
    expect(screen.queryByText('Editar')).toBeNull();
    // Only the chosen category shows, not the whole list.
    expect(screen.getByText('Mercado')).toBeTruthy();
    expect(screen.queryByText('Restaurantes')).toBeNull();
    expect(screen.getByLabelText('Excluir')).toBeTruthy();

    await render(
      <TxDetail t={tx({ category_id: null, category_name: null })} onChanged={jest.fn()} />,
    );
    expect(screen.getByText('Escolher categoria')).toBeTruthy();
  });

  it('Salvar and Desfazer wake up only after a change', async () => {
    await render(<TxDetail t={tx()} onChanged={jest.fn()} />);
    const salvar = () => screen.getByRole('button', { name: 'Salvar' });
    expect(salvar().props.accessibilityState?.disabled).toBe(true);
    await fireEvent.changeText(screen.getByLabelText('Descrição'), 'Outro');
    expect(salvar().props.accessibilityState?.disabled).toBeFalsy();
    await fireEvent.press(screen.getByText('Desfazer'));
    expect(screen.getByLabelText('Descrição').props.value).toBe('Pão de Açúcar');
    expect(salvar().props.accessibilityState?.disabled).toBe(true);
    expect(mockEdit).not.toHaveBeenCalled();
  });

  it('changes the category from a list in Editar, for this shop too', async () => {
    mockEdit.mockResolvedValue(tx());
    const onChanged = jest.fn();
    await render(<TxDetail t={tx()} onChanged={onChanged} />);
    expect(screen.queryByText('Restaurantes')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Categoria'));
    // Money out: only spending categories.
    expect(screen.queryByText('Salário')).toBeNull();
    expect(screen.queryByText('Transferência')).toBeNull();
    await fireEvent.press(screen.getByText('Restaurantes'));
    expect(screen.getByRole('checkbox')).toBeTruthy();
    await fireEvent.press(screen.getByText('Salvar'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(mockEdit).toHaveBeenCalledWith('tx-1', {
      category_id: 'c-rest',
      apply_to_merchant: true,
    });
  });

  it('can change the category of only this line', async () => {
    mockEdit.mockResolvedValue(tx());
    await render(<TxDetail t={tx()} onChanged={jest.fn()} />);
    await fireEvent.press(screen.getByLabelText('Categoria'));
    await fireEvent.press(screen.getByText('Restaurantes'));
    await fireEvent.press(screen.getByRole('checkbox'));
    await fireEvent.press(screen.getByText('Salvar'));
    await waitFor(() =>
      expect(mockEdit).toHaveBeenCalledWith('tx-1', {
        category_id: 'c-rest',
        apply_to_merchant: false,
      }),
    );
  });

  it('money coming in offers income categories', async () => {
    await render(<TxDetail t={tx()} onChanged={jest.fn()} />);
    await fireEvent.press(screen.getByText('Entrou dinheiro'));
    expect(screen.getByText('Escolher categoria')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Categoria'));
    expect(screen.getByText('Salário')).toBeTruthy();
    expect(screen.queryByText('Restaurantes')).toBeNull();
  });

  it('edits description, date, amount and direction, sending only what changed', async () => {
    mockEdit.mockResolvedValue(tx());
    const onChanged = jest.fn();
    await render(<TxDetail t={tx()} onChanged={onChanged} />);
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
    expect(screen.getByText('Alterações salvas.')).toBeTruthy();
  });

  it('says what is wrong and does not save', async () => {
    await render(<TxDetail t={tx()} onChanged={jest.fn()} />);
    await fireEvent.changeText(screen.getByLabelText('Data'), '31/02/2026');
    await fireEvent.changeText(screen.getByLabelText('Valor'), 'abc');
    await fireEvent.press(screen.getByText('Salvar'));
    expect(screen.getByText('Data inválida (ex.: 28/11/2026).')).toBeTruthy();
    expect(screen.getByText('Valor inválido (ex.: 312,40).')).toBeTruthy();
    expect(mockEdit).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Desfazer'));
    expect(screen.getByLabelText('Data').props.value).toBe('28/11/2026');
  });

  it('can say the line was an investment', async () => {
    mockKind.mockResolvedValue(tx({ kind: 'investment' }));
    const onChanged = jest.fn();
    await render(<TxDetail t={tx()} onChanged={onChanged} />);
    await fireEvent.press(screen.getByText('Investimento'));
    await fireEvent.press(screen.getByText('Salvar'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(mockEdit).not.toHaveBeenCalled();
    expect(mockKind).toHaveBeenCalledWith('tx-1', 'investment');
  });

  it('shows the error when saving the edit fails', async () => {
    mockEdit.mockRejectedValue(new ApiError(404, 'Transação não encontrada'));
    await render(<TxDetail t={tx()} onChanged={jest.fn()} />);
    await fireEvent.changeText(screen.getByLabelText('Descrição'), 'Outro');
    await fireEvent.press(screen.getByText('Salvar'));
    expect(await screen.findByText('Transação não encontrada')).toBeTruthy();
  });

  it('deletes only after confirming', async () => {
    mockDelete.mockResolvedValue(undefined);
    const onChanged = jest.fn();
    await render(<TxDetail t={tx()} onChanged={onChanged} />);
    await fireEvent.press(screen.getByLabelText('Excluir'));
    expect(screen.getByText('Excluir esta transação?')).toBeTruthy();
    await fireEvent.press(screen.getByText('Cancelar'));
    expect(mockDelete).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Excluir'));
    await fireEvent.press(screen.getByText('Excluir'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(mockDelete).toHaveBeenCalledWith('tx-1');
  });

  it('shows the error when deleting fails', async () => {
    mockDelete.mockRejectedValue(new ApiError(404, 'Transação não encontrada'));
    await render(<TxDetail t={tx()} onChanged={jest.fn()} />);
    await fireEvent.press(screen.getByLabelText('Excluir'));
    await fireEvent.press(screen.getByText('Excluir'));
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
