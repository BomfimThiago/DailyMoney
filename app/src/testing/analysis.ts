// Sample Análises answers for tests.
import type { CurrencyAnalysis } from '@/lib/types';

export function analysis(over: Partial<CurrencyAnalysis> = {}): CurrencyAnalysis {
  return {
    currency: 'BRL',
    months: [
      { month: '2026-09', amount: '1000.0000' },
      { month: '2026-10', amount: '1200.0000' },
    ],
    average: '1000.0000',
    changes: [],
    habits: [],
    weekdays: ['10', '0', '0', '0', '0', '40', '0'],
    peaks: [],
    recurring: [],
    recurring_total: '0',
    ...over,
  };
}
