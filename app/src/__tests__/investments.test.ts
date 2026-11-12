import { describe, expect, it } from '@jest/globals';

import {
  barHeights,
  investmentView,
  monthMoves,
  monthTotals,
  productMonth,
} from '@/lib/investments';
import { overview } from '@/testing/investments';

const nb = (s: string) => s.replace(/\s/g, ' ');

describe('investmentView', () => {
  it('keeps only the chosen currency', () => {
    const v = investmentView(overview(), 'EUR');
    expect(v?.currency).toBe('EUR');
    expect(v?.products.map((p) => p.name)).toEqual(['Wise Interest']);
    expect(v?.movements.map((m) => m.description)).toEqual(['Wise jar']);
    expect(v?.thisMonth?.net).toBe('0.0000');
  });

  it('falls back to the first currency when the chosen one is missing', () => {
    const v = investmentView(overview(), 'USD');
    expect(v?.currency).toBe('BRL');
    expect(v?.history.map((h) => h.month)).toEqual(['2026-10', '2026-11']);
    expect(v?.thisMonth?.month).toBe('2026-11');
    expect(investmentView(overview(), null)?.currency).toBe('BRL');
  });

  it('is null when nothing was invested', () => {
    expect(investmentView(overview({ totals: [] }), 'BRL')).toBeNull();
  });
});

describe('investment texts', () => {
  it('sums up the month only when money moved', () => {
    const brl = investmentView(overview(), 'BRL')!;
    const moves = monthMoves(brl)!;
    expect(nb(moves.net)).toBe('+R$ 1.500,00');
    expect(nb(moves.detail)).toBe('(R$ 2.000,00 aplicado, R$ 500,00 resgatado)');
    expect(monthMoves(investmentView(overview(), 'EUR')!)).toBeNull();
    expect(monthMoves({ ...brl, thisMonth: undefined })).toBeNull();
    const outOnly = { ...brl.thisMonth!, put_in: '0', taken_out: '10', net: '-10' };
    expect(monthMoves({ ...brl, thisMonth: outOnly })).not.toBeNull();
  });

  it('uses zeros for a month without moves', () => {
    const brl = investmentView(overview(), 'BRL')!;
    expect(monthTotals(brl).net).toBe('1500.0000');
    expect(monthTotals({ ...brl, thisMonth: undefined })).toEqual({
      put_in: '0',
      taken_out: '0',
      net: '0',
    });
  });

  it('describes each product month', () => {
    const [rdb, tesouro] = overview().products;
    expect(nb(productMonth(rdb))).toBe('+R$ 1.500,00 no mês');
    expect(productMonth(tesouro)).toBe('sem movimento no mês');
  });

  it('sizes bars against the largest month, never below 4', () => {
    const h = overview().history.slice(0, 2);
    expect(barHeights(h)).toEqual([(1000 / 1500) * 80, 80]);
    expect(barHeights([{ ...h[0], net: '-50' }])).toEqual([4]);
    expect(barHeights([])).toEqual([]);
  });
});
