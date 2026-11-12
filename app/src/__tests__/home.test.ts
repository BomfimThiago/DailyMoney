import { describe, expect, it } from '@jest/globals';

import {
  calendarLegend,
  CHART_AXIS,
  dayLevel,
  gridValues,
  paceScale,
  paceText,
  shareBars,
} from '@/lib/dashboard';
import { firstName, hasNoAccounts, pendingLabel, shownCurrency } from '@/lib/home';
import { monthSummary } from '@/testing/home';

const nb = (s: string) => s.replace(/\s/g, ' ');

describe('home summary', () => {
  it('shows the chosen currency or the first one', () => {
    expect(shownCurrency(monthSummary(), 'EUR')?.currency).toBe('EUR');
    expect(shownCurrency(monthSummary(), 'USD')?.currency).toBe('BRL');
    expect(shownCurrency(monthSummary({ currencies: [] }), null)).toBeNull();
    expect(shownCurrency(null, null)).toBeNull();
  });

  it('knows when nothing was uploaded yet', () => {
    expect(hasNoAccounts(null)).toBe(false);
    expect(hasNoAccounts(monthSummary())).toBe(false);
    expect(hasNoAccounts(monthSummary({ currencies: [] }))).toBe(true);
  });

  it('words pending transfers and greets by first name', () => {
    expect(pendingLabel(1)).toBe('1 transferência para confirmar');
    expect(pendingLabel(3)).toBe('3 transferências para confirmar');
    expect(firstName('Thiago Bomfim')).toBe('Thiago');
  });
});

describe('dashboard charts', () => {
  it('describes the pace of a past month', () => {
    const daily = ['100', '0', '50'];
    expect(nb(paceText('2020-03', daily, ['300', '0', '0'], 'BRL'))).toBe(
      'Até o dia 3: R$ 150,00 em gastos, 50% a menos que fevereiro no mesmo dia.',
    );
    expect(nb(paceText('2020-03', daily, [], 'BRL'))).toBe('Até o dia 3: R$ 150,00 em gastos.');
    expect(paceText('2020-03', ['0', '0'], [], 'BRL')).toBe('Nenhum gasto neste mês ainda.');
    expect(paceText('2099-01', daily, [], 'BRL')).toBe('Nenhum gasto neste mês ainda.');
  });

  it('places chart points from day 1 at the axis to the last day at the edge', () => {
    const { x, y, points } = paceScale(31, 200, 400, 150);
    expect(x(1)).toBe(CHART_AXIS);
    expect(x(31)).toBe(392);
    expect(y(200)).toBe(12);
    expect(y(0)).toBe(130);
    expect(points([0, 200])).toBe(`${CHART_AXIS},130 ${x(2)},12`);
    expect(paceScale(1, 100, 400, 150).x(1)).toBe(CHART_AXIS);
    expect(gridValues(200, 100)).toEqual([0, 100, 200]);
  });

  it('gives each share its percent and bar width', () => {
    expect(
      shareBars([
        { name: 'Mercado', amount: 75 },
        { name: 'Uber', amount: 25 },
      ]),
    ).toEqual([
      { name: 'Mercado', amount: 75, pct: 75, width: '100%' },
      { name: 'Uber', amount: 25, pct: 25, width: '33.33333333333333%' },
    ]);
    expect(shareBars([])).toEqual([]);
  });

  it('shades days by spending and names the most expensive one', () => {
    expect(dayLevel(0, 100)).toBe(0);
    expect(dayLevel(10, 0)).toBe(0);
    expect(dayLevel(100, 100)).toBe(1);
    expect(dayLevel(25, 100)).toBeCloseTo(0.56);
    expect(nb(calendarLegend('2026-10', ['10', '90', '5'], 'BRL'))).toBe(
      'Dia mais caro: 2 de outubro, R$ 90,00.',
    );
    expect(calendarLegend('2026-10', ['0', '0'], 'BRL')).toBe('Nenhum gasto neste mês.');
  });
});
