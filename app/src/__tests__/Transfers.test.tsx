import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { Transfers } from '@/components/Transfers';
import { ApiError } from '@/lib/api';
import { setKind } from '@/lib/imports';
import type { Transaction, TransferOverview } from '@/lib/types';

jest.mock('@/lib/imports', () => ({ setKind: jest.fn() }));
const mockSetKind = jest.mocked(setKind);

const pix: Transaction = {
  id: 'tx-1',
  date: '2026-11-08',
  description: 'Pix enviado - ANA TESTE',
  amount: '-400.0000',
  currency: 'BRL',
  kind: 'pending',
  account_id: 'a',
  account_name: 'Nubank',
  category_id: null,
  category_name: null,
  member_id: null,
};

const overview = (o: Partial<TransferOverview> = {}): TransferOverview => ({
  month: '2026-11',
  pending: [pix],
  confirmed: [],
  ...o,
});

beforeEach(() => {
  mockSetKind.mockReset();
});

describe('Transfers', () => {
  it('asks about a Pix out with the spending wording', async () => {
    await render(<Transfers data={overview()} month="2026-11" onChanged={jest.fn()} />);
    expect(screen.getByText('AGUARDANDO CONFIRMAR')).toBeTruthy();
    expect(screen.getByText(/Saiu do Nubank · 8 nov/)).toBeTruthy();
    expect(screen.getByText('Foi um gasto')).toBeTruthy();
    expect(screen.getByText('Foi um investimento')).toBeTruthy();
    expect(screen.getByText('Nenhuma transferência neste mês.')).toBeTruthy();
  });

  it('asks about money in with the income wording', async () => {
    const incoming = { ...pix, amount: '400.0000' };
    await render(
      <Transfers data={overview({ pending: [incoming] })} month="2026-11" onChanged={jest.fn()} />,
    );
    expect(screen.getByText(/Entrou no Nubank/)).toBeTruthy();
    expect(screen.getByText('Foi uma entrada')).toBeTruthy();
    expect(screen.getByText('Foi um resgate')).toBeTruthy();
  });

  it.each<[string, 'transfer' | 'regular' | 'investment']>([
    ['É entre minhas contas', 'transfer'],
    ['Foi um gasto', 'regular'],
    ['Foi um investimento', 'investment'],
  ])('"%s" saves %s and refreshes', async (label, kind) => {
    mockSetKind.mockResolvedValue({ ...pix, kind } as Transaction);
    const onChanged = jest.fn();
    await render(<Transfers data={overview()} month="2026-11" onChanged={onChanged} />);
    await fireEvent.press(screen.getByText(label));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(mockSetKind).toHaveBeenCalledWith('tx-1', kind);
  });

  it('shows the API message when saving fails', async () => {
    mockSetKind.mockRejectedValue(new ApiError(422, 'Não foi possível salvar'));
    const onChanged = jest.fn();
    await render(<Transfers data={overview()} month="2026-11" onChanged={onChanged} />);
    await fireEvent.press(screen.getByText('Foi um gasto'));
    expect(await screen.findByText('Não foi possível salvar')).toBeTruthy();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('lists confirmed moves, with both sides of an exchange', async () => {
    await render(
      <Transfers
        data={overview({
          pending: [],
          confirmed: [
            {
              id: 't1',
              date: '2026-11-09',
              description: 'Converted',
              from_account: 'Wise BRL',
              to_account: 'Wise USD',
              amount: '1000.0000',
              currency: 'BRL',
              to_amount: '182.4800',
              to_currency: 'USD',
              kind: 'exchange',
            },
          ],
        })}
        month="2026-11"
        onChanged={jest.fn()}
      />,
    );
    expect(screen.queryByText('AGUARDANDO CONFIRMAR')).toBeNull();
    expect(screen.getByText('Wise BRL → Wise USD')).toBeTruthy();
    expect(screen.getByText('Câmbio · 9 nov')).toBeTruthy();
    expect(screen.getByText(/US\$\s182,48/)).toBeTruthy();
  });
});
