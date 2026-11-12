// Sample investment answers for tests.
import type { InvestmentOverview, Transaction } from '@/lib/types';

export const movement = (o: Partial<Transaction> = {}): Transaction => ({
  id: 'm1',
  date: '2026-11-20',
  description: 'Aplicação RDB',
  amount: '-1500.0000',
  currency: 'BRL',
  kind: 'investment',
  account_id: 'a1',
  account_name: 'Nubank',
  category_id: null,
  category_name: 'Aplicação',
  member_id: null,
  ...o,
});

export const overview = (o: Partial<InvestmentOverview> = {}): InvestmentOverview => ({
  month: '2026-11',
  totals: [
    { currency: 'BRL', put_in: '5000.0000', taken_out: '1000.0000', net: '4000.0000' },
    { currency: 'EUR', put_in: '300.0000', taken_out: '0.0000', net: '300.0000' },
  ],
  products: [
    {
      name: 'RDB',
      account_id: 'a1',
      account_name: 'Nubank',
      currency: 'BRL',
      put_in: '3000.0000',
      taken_out: '0.0000',
      net: '3000.0000',
      month_net: '1500.0000',
      last_date: '2026-11-20',
    },
    {
      name: 'Tesouro IPCA',
      account_id: 'a2',
      account_name: 'Inter',
      currency: 'BRL',
      put_in: '2000.0000',
      taken_out: '1000.0000',
      net: '1000.0000',
      month_net: '0.0000',
      last_date: '2026-11-20',
    },
    {
      name: 'Wise Interest',
      account_id: 'a3',
      account_name: 'Wise',
      currency: 'EUR',
      put_in: '300.0000',
      taken_out: '0.0000',
      net: '300.0000',
      month_net: '0.0000',
      last_date: '2026-11-20',
    },
  ],
  history: [
    {
      month: '2026-10',
      currency: 'BRL',
      put_in: '1000.0000',
      taken_out: '0.0000',
      net: '1000.0000',
    },
    {
      month: '2026-11',
      currency: 'BRL',
      put_in: '2000.0000',
      taken_out: '500.0000',
      net: '1500.0000',
    },
    { month: '2026-11', currency: 'EUR', put_in: '0.0000', taken_out: '0.0000', net: '0.0000' },
  ],
  movements: [movement(), movement({ id: 'm2', currency: 'EUR', description: 'Wise jar' })],
  ...o,
});
