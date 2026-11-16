import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';

import { TxRow } from '@/components/TxRow';
import type { Transaction } from '@/lib/types';

const base: Transaction = {
  id: '1',
  date: '2026-11-04',
  description: 'PAO DE ACUCAR',
  amount: '-312.4000',
  currency: 'BRL',
  kind: 'regular',
  account_id: 'a',
  account_name: 'Nubank',
  category_id: 'c',
  category_name: 'Mercado',
  member_id: null,
};

const shown = async (t: Partial<Transaction>) => {
  await render(<TxRow t={{ ...base, ...t }} />);
  return {
    sub: screen.getByText(/ · /).props.children as string,
    amount: (screen.getByText(/\d,\d\d$/).props.children as string).replace(/\s/g, ' '),
  };
};

describe('TxRow', () => {
  it('shows spending with its category and a minus sign', async () => {
    expect(await shown({})).toEqual({ sub: 'Mercado · Nubank · 4 nov', amount: '-R$ 312,40' });
  });

  it('shows income with a plus sign', async () => {
    expect((await shown({ amount: '8500.0000', category_name: 'Salário' })).amount).toBe(
      '+R$ 8.500,00',
    );
  });

  it('shows investments and transfers without a sign', async () => {
    expect(await shown({ kind: 'investment', amount: '-1500.0000' })).toEqual({
      sub: 'Aplicação · Nubank · 4 nov',
      amount: 'R$ 1.500,00',
    });
    expect((await shown({ kind: 'investment', amount: '300.0000' })).sub).toMatch(/^Resgate/);
    expect(await shown({ kind: 'transfer', amount: '-400.0000' })).toEqual({
      sub: 'Entre suas contas · Nubank · 4 nov',
      amount: 'R$ 400,00',
    });
    expect((await shown({ kind: 'pending' })).sub).toMatch(/^A confirmar/);
  });
});

describe('TxRow in another currency', () => {
  it('shows the converted amount with the statement amount below', async () => {
    await render(<TxRow t={{ ...base, display_amount: '-52.0667', display_currency: 'EUR' }} />);
    const texts = screen.getAllByText(/\d,\d\d$/).map((n) => String(n.props.children));
    expect(texts.map((t) => t.replace(/\s/g, ' '))).toEqual(['-€ 52,07', '-R$ 312,40']);
  });

  it('shows one amount when the line is already in that currency', async () => {
    await render(<TxRow t={{ ...base, display_amount: '-312.4000', display_currency: 'BRL' }} />);
    expect(screen.getAllByText(/\d,\d\d$/)).toHaveLength(1);
  });
});
