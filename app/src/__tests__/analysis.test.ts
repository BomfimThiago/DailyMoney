import { describe, expect, it } from '@jest/globals';

import {
  changeOf,
  dayLabel,
  firstWithSpending,
  habitTrend,
  monthSentence,
  percent,
  topWeekday,
  weekdaySentence,
} from '@/lib/analysis';
import type { CurrencyAnalysis } from '@/lib/types';

function analysis(over: Partial<CurrencyAnalysis> = {}): CurrencyAnalysis {
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

const nbsp = (s: string) => s.replace(/ /g, ' ');

describe('análises', () => {
  it('measures change against the average, or not at all without one', () => {
    expect(changeOf('150', '100')).toBe(0.5);
    expect(changeOf('50', '100')).toBe(-0.5);
    expect(changeOf('50', '0')).toBeNull();
    expect(changeOf('50', null)).toBeNull();
    expect(percent(0.384)).toBe('+38%');
    expect(percent(-0.2)).toBe('−20%');
  });

  it('says how the month compares with the months before', () => {
    expect(nbsp(monthSentence(analysis(), '2026-10'))).toBe(
      'Outubro ficou 20% acima da média dos meses anteriores (R$ 1.000,00).',
    );
    expect(monthSentence(analysis({ average: null }), '2026-10')).toBe(
      'Ainda não há meses anteriores com gastos para comparar.',
    );
    const same = analysis({ months: [{ month: '2026-10', amount: '1000' }] });
    expect(monthSentence(same, '2026-10')).toMatch(/^Outubro ficou na média/);
  });

  it('finds the costliest weekday', () => {
    expect(topWeekday(['0', '0', '0', '0', '0', '0', '0'])).toBeNull();
    expect(nbsp(weekdaySentence(analysis()))).toBe(
      'Sábado é o dia mais caro: R$ 40,00 em média, sem contar moradia.',
    );
    expect(weekdaySentence(analysis({ weekdays: Array(7).fill('0') }))).toBe(
      'Nenhum gasto no período.',
    );
  });

  it('compares a habit with the month before', () => {
    expect(habitTrend(4, 2, '2026-10')).toBe('+2 vs set');
    expect(habitTrend(3, 3, '2026-10')).toBe('igual a set');
    expect(habitTrend(3, 5, '2026-01')).toBe('−2 vs dez');
  });

  it('names a day with its weekday', () => {
    expect(dayLabel('2026-10-17')).toBe('Sábado, 17 out');
    expect(dayLabel('2026-11-09')).toBe('Segunda, 9 nov');
  });

  it('opens on the first currency that has spending', () => {
    const empty = analysis({ currency: 'EUR', months: [{ month: '2026-10', amount: '0' }] });
    expect(firstWithSpending([empty, analysis()])?.currency).toBe('BRL');
    expect(firstWithSpending([empty])?.currency).toBe('EUR');
    expect(firstWithSpending([])).toBeNull();
  });
});
