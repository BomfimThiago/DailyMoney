import { describe, expect, it } from '@jest/globals';

import {
  barHeight,
  changeOf,
  changeRows,
  dayLabel,
  firstWithSpending,
  habitDetail,
  habitTrend,
  monthSentence,
  percent,
  recurringDetail,
  recurringSentence,
  shownAnalysis,
  topWeekday,
  weekdaySentence,
} from '@/lib/analysis';
import { analysis } from '@/testing/analysis';

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

describe('análises cards', () => {
  it('shows the chosen currency, or the first with spending, or nothing', () => {
    const brl = analysis();
    const eur = analysis({ currency: 'EUR', months: [{ month: '2026-10', amount: '0' }] });
    expect(shownAnalysis([eur, brl], null)?.currency).toBe('BRL');
    expect(shownAnalysis([eur, brl], 'BRL')?.currency).toBe('BRL');
    expect(shownAnalysis([eur, brl], 'EUR')).toBeNull();
    expect(shownAnalysis([], null)).toBeNull();
  });

  it('keeps a sliver for any spending', () => {
    expect(barHeight(50, 100, 120)).toBe(60);
    expect(barHeight(0.1, 100, 120)).toBe(3);
    expect(barHeight(0, 100, 120)).toBe(0);
  });

  it('draws changes from the middle, up to the right and down to the left', () => {
    expect(
      changeRows([
        { name: 'Mercado', amount: '150', average: '100' },
        { name: 'Uber', amount: '75', average: '100' },
        { name: 'Pet', amount: '30', average: '0' },
      ]),
    ).toEqual([
      { name: 'Mercado', up: true, width: 50, label: '+50%' },
      { name: 'Uber', up: false, width: 25, label: '−25%' },
      { name: 'Pet', up: true, width: 50, label: 'novo' },
    ]);
  });

  it('describes habits and recurring charges', () => {
    const habit = {
      name: 'Padaria',
      category: 'Mercado',
      count: 4,
      previous_count: 2,
      total: '50',
    };
    expect(nbsp(habitDetail(habit, 'BRL'))).toBe('R$ 12,50 por vez · Mercado');
    expect(nbsp(habitDetail({ ...habit, category: null }, 'BRL'))).toBe('R$ 12,50 por vez');
    const netflix = {
      name: 'Netflix',
      category: 'Assinaturas',
      amount: '55.9',
      last_date: '2026-10-22',
      months: 4,
    };
    expect(recurringDetail(netflix)).toBe('Assinaturas · última em 22 out');
    expect(recurringDetail({ ...netflix, category: null })).toBe('última em 22 out');
    expect(recurringSentence(analysis())).toBeUndefined();
    expect(
      nbsp(recurringSentence(analysis({ recurring: [netflix], recurring_total: '55.9' }))!),
    ).toBe('1 cobrança, cerca de R$ 55,90 por mês (R$ 670,80 por ano).');
    expect(
      recurringSentence(analysis({ recurring: [netflix, netflix], recurring_total: '10' })),
    ).toMatch(/^2 cobranças/);
  });
});
