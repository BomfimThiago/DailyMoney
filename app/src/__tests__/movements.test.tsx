import { describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';

import { Transfers } from '@/components/Transfers';
import { movementResult, movementSub } from '@/lib/movements';
import type { MovementGroup, MovementsOverview } from '@/lib/types';

jest.mock('@/lib/imports', () => ({ setKind: jest.fn() }));

const group = (o: Partial<MovementGroup> = {}): MovementGroup => ({
  currency: 'BRL',
  rows: [
    {
      name: 'Transferência',
      color: '#8a8799',
      went_out: '500.0000',
      came_in: '500.0000',
      net: '0.0000',
      count: 2,
    },
  ],
  went_out: '500.0000',
  came_in: '500.0000',
  net: '0.0000',
  result: 'closed',
  ...o,
});

const nbsp = (s: string) => s.replace(/ /g, ' ');

describe('movements', () => {
  it('says how much left and arrived', () => {
    const g = group();
    expect(nbsp(movementSub(g.rows[0], g))).toBe('saiu R$ 500,00 · entrou R$ 500,00');
    const out = { ...g.rows[0], came_in: '0' };
    expect(nbsp(movementSub(out, g))).toBe('saiu R$ 500,00');
  });

  it('tells whether the money came back', () => {
    expect(movementResult(group()).title).toBe('Fechou');
    expect(movementResult(group({ result: 'out' })).title).toBe('Saiu e não voltou');
    expect(movementResult(group({ result: 'in' })).title).toBe('Entrou de fora');
  });

  it('shows the check above the confirmed transfers', async () => {
    const movements: MovementsOverview = {
      month: '2026-11',
      groups: [
        group({
          result: 'out',
          net: '-500.0000',
          rows: [{ ...group().rows[0], name: null, color: null }],
        }),
      ],
    };
    await render(
      <Transfers
        data={{ month: '2026-11', pending: [], confirmed: [] }}
        month="2026-11"
        onChanged={jest.fn()}
        movements={movements}
      />,
    );
    expect(screen.getByText('Conferência de novembro')).toBeTruthy();
    expect(screen.getByText('Sem categoria')).toBeTruthy();
    expect(screen.getByText('Saiu e não voltou')).toBeTruthy();
  });

  it('leaves the check out when nothing moved', async () => {
    await render(
      <Transfers
        data={{ month: '2026-11', pending: [], confirmed: [] }}
        month="2026-11"
        onChanged={jest.fn()}
        movements={{ month: '2026-11', groups: [] }}
      />,
    );
    expect(screen.queryByText(/Conferência/)).toBeNull();
  });
});
