import { describe, expect, it } from '@jest/globals';

import {
  currentPeriod,
  daysElapsed,
  normalizeStartDay,
  periodBounds,
  periodCaption,
  periodOf,
  periodPreview,
} from '@/lib/period';

describe('month start day', () => {
  it('keeps the calendar month when the month starts on the 1st', () => {
    expect(periodBounds('2026-02', 1)).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(periodOf('2026-02-28', 1)).toBe('2026-02');
    expect(periodCaption('2026-02', 1)).toBeNull();
  });

  it('names a month starting up to the 15th after the month it starts in', () => {
    expect(periodBounds('2026-05', 15)).toEqual({ start: '2026-05-15', end: '2026-06-14' });
    expect(periodOf('2026-06-14', 15)).toBe('2026-05');
    expect(periodOf('2026-05-14', 15)).toBe('2026-04');
  });

  it('names a month starting from the 16th after the month it ends in', () => {
    expect(periodBounds('2026-11', 27)).toEqual({ start: '2026-10-27', end: '2026-11-26' });
    expect(periodOf('2026-10-27', 27)).toBe('2026-11');
    expect(periodOf('2026-11-27', 27)).toBe('2026-12');
    expect(periodBounds('2027-01', 20)).toEqual({ start: '2026-12-20', end: '2027-01-19' });
    expect(periodCaption('2026-11', 27)).toBe('27 out – 26 nov');
  });

  it('finds the current month and how many of its days went by', () => {
    const today = new Date(2026, 10, 16);
    expect(currentPeriod(1, today)).toBe('2026-11');
    expect(currentPeriod(16, today)).toBe('2026-12');
    expect(currentPeriod(27, today)).toBe('2026-11');
    expect(periodPreview(27, today)).toBe('Hoje é novembro: de 27 out a 26 nov.');
    expect(daysElapsed('2026-10-27', 31, today)).toBe(21);
    expect(daysElapsed('2026-12-01', 31, today)).toBe(0);
    expect(daysElapsed('2026-09-01', 30, today)).toBe(30);
  });

  it('treats a day outside 1–28 as the calendar month', () => {
    expect(normalizeStartDay(0)).toBe(1);
    expect(normalizeStartDay(31)).toBe(1);
    expect(normalizeStartDay(undefined)).toBe(1);
  });
});
