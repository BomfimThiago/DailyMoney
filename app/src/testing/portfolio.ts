// Sample bank portfolio answers for tests.
import { builder } from './builder';
import type { Portfolio, PortfolioPosition } from '@/lib/types';

export const position = builder<PortfolioPosition>(() => ({
  id: 'p1',
  bank: 'Nubank',
  name: 'CDB Banco Exemplo',
  issuer: null,
  code: null,
  currency: 'BRL',
  balance: '1100.0000',
  value: '1100.0000',
  gain: '100.0000',
  rate_label: '110% do CDI',
  due_date: '2027-03-15',
  value_date: '2026-11-16',
}));

export const emptyPortfolio = builder<Portfolio>(() => ({
  currency: 'BRL',
  total: '0',
  count: 0,
  value_date: null,
  closed: 0,
  has_source: false,
  tracked: null,
  classes: [],
  banks: [],
  maturing: { months: 12, count: 0, total: '0' },
  ladder: null,
  history: [],
}));

export const portfolio = builder<Portfolio>(() => ({
  currency: 'BRL',
  total: '1500.0000',
  count: 2,
  value_date: '2026-11-16',
  closed: 1,
  has_source: true,
  tracked: { invested: '1000.00', value: '1100.0000', gain: '100.0000', gain_pct: '10.0' },
  classes: [
    {
      key: 'fixed',
      label: 'Renda fixa',
      total: '1100.0000',
      share: '0.7333',
      positions: [position()],
    },
    {
      key: 'etf',
      label: 'ETFs',
      total: '400.0000',
      share: '0.2667',
      positions: [
        position({
          id: 'p2',
          bank: 'Inter',
          name: 'BOVA11',
          value: '400.0000',
          balance: '400.0000',
          gain: null,
          rate_label: null,
          due_date: null,
        }),
      ],
    },
  ],
  banks: [
    { bank: 'Nubank', total: '1100.0000' },
    { bank: 'Inter', total: '400.0000' },
  ],
  maturing: { months: 12, count: 1, total: '1100.0000' },
  ladder: {
    steps: [
      { label: '2026', year: 2026, total: '0', count: 0 },
      { label: '2027', year: 2027, total: '1100.0000', count: 1 },
    ],
    dated_total: '1100.0000',
    dated_count: 1,
    undated_total: '400.0000',
    undated_count: 1,
  },
  history: [
    { date: '2026-10-16', total: '1400.0000' },
    { date: '2026-11-16', total: '1500.0000' },
  ],
}));
