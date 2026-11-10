import { describe, expect, it } from '@jest/globals';

import {
  axisLabel,
  calendarWeeks,
  cumulative,
  niceMax,
  paceChange,
  paceDay,
  paceSentence,
  topShares,
} from '@/lib/dashboard';

describe('dashboard math', () => {
  it('adds spending up day by day', () => {
    expect(cumulative(['10.0000', '0', '5.5000'])).toEqual([10, 10, 15.5]);
  });

  it('counts days only up to today in the current month', () => {
    const today = new Date(2026, 10, 10);
    expect(paceDay('2026-11', 30, today)).toBe(10);
    expect(paceDay('2026-10', 31, today)).toBe(31);
    expect(paceDay('2026-12', 31, today)).toBe(0);
  });

  it('compares with the month before on the same day', () => {
    const now = ['100', '0', '0'];
    const before = ['50', '50', '100'];
    expect(paceChange(now, before, 2)).toBe(0);
    expect(paceChange(now, before, 3)).toBe(-0.5);
    // A shorter month before: compare with its last day.
    expect(paceChange(['300', '0', '0'], ['100', '100'], 3)).toBe(0.5);
    expect(paceChange(now, ['0', '0', '0'], 3)).toBeNull();
    expect(paceChange(now, [], 3)).toBeNull();
  });

  it('says the change in words', () => {
    expect(paceSentence(-0.13, '2026-11')).toBe('13% a menos que outubro');
    expect(paceSentence(0.5, '2026-01')).toBe('50% a mais que dezembro');
    expect(paceSentence(0.001, '2026-11')).toBe('igual a outubro');
    expect(paceSentence(null, '2026-11')).toBeNull();
  });

  it('lays the month out in weeks starting on Sunday', () => {
    const weeks = calendarWeeks('2026-11'); // starts on a Sunday, 30 days
    expect(weeks[0]).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(weeks[4]).toEqual([29, 30, null, null, null, null, null]);
    expect(calendarWeeks('2026-10')[0].slice(0, 5)).toEqual([null, null, null, null, 1]);
  });

  it('labels the axis in thousands and rounds the top', () => {
    expect(axisLabel(800)).toBe('800');
    expect(axisLabel(2000)).toBe('2 mil');
    expect(axisLabel(2500)).toBe('2,5 mil');
    expect(niceMax(3405.8)).toEqual({ max: 4000, step: 2000 });
    expect(niceMax(0)).toEqual({ max: 100, step: 50 });
  });

  it('keeps the biggest shares and sums the rest', () => {
    const items = ['a', 'b', 'c', 'd'].map((name, i) => ({ name, amount: String(40 - i * 10) }));
    expect(topShares(items, 3)).toEqual([
      { name: 'a', amount: 40 },
      { name: 'b', amount: 30 },
      { name: 'Demais', amount: 30 },
    ]);
    expect(topShares(items)).toHaveLength(4);
  });
});
