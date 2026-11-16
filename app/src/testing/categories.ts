import type { Category } from '@/lib/types';

import { builder } from './builder';

export const category = builder<Category>(() => ({
  id: 'c-mercado',
  name: 'Mercado',
  kind: 'expense',
  color: '#5f8f7b',
  is_default: true,
  transaction_count: 0,
  rule_count: 0,
}));
