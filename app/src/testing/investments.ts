// A sample investment line for tests.
import { builder } from './builder';
import type { Transaction } from '@/lib/types';

export const movement = builder<Transaction>(() => ({
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
  review: 'approved',
}));
