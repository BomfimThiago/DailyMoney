// Sample Início answers for tests.
import { builder } from './builder';
import type { CurrencyDashboard, CurrencySummary, MonthSummary } from '@/lib/types';

export const currencySummary = builder<CurrencySummary>(() => ({
  currency: 'BRL',
  income: '8500.0000',
  spending: '3406.0000',
  invested: '2000.0000',
  invested_in: '2000.0000',
  invested_out: '0.0000',
  left: '3094.2000',
}));

export const monthSummary = builder<MonthSummary>(() => ({
  month: '2026-10',
  currencies: [currencySummary(), currencySummary({ currency: 'EUR', income: '1200.0000' })],
  pending_transfers: 2,
  to_review: 0,
}));

export const dashboard = builder<CurrencyDashboard>(() => ({
  currency: 'BRL',
  daily: ['100', '0', '50', ...Array<string>(28).fill('0')],
  previous_daily: ['200', ...Array<string>(29).fill('0')],
  categories: [
    { name: 'Mercado', amount: '120' },
    { name: 'Transporte', amount: '30' },
  ],
  accounts: [{ name: 'Nubank', amount: '150' }],
  people: [
    { name: 'Thiago', amount: '120' },
    { name: 'Casa', amount: '30' },
  ],
  banks: [{ name: 'Nubank', amount: '150' }],
  income_categories: [{ name: 'Renda', amount: '8500' }],
  previous_income: '8000.0000',
  previous_spending: '3600.0000',
}));
