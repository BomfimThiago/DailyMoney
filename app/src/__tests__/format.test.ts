import { describe, expect, it } from '@jest/globals';
import {
  addDays,
  dayMonth,
  daysBetween,
  fullDate,
  initials,
  money,
  monthLabel,
  period,
  plain,
  shiftMonth,
  shortDate,
} from '@/lib/format';

// Intl puts a non-breaking space between the symbol and the number.
const text = (s: string) => s.replace(/\s/g, ' ');

describe('money', () => {
  it('formats each currency in Brazilian style', () => {
    expect(text(money('-1234.5000', 'BRL'))).toBe('-R$ 1.234,50');
    expect(text(money('182.48', 'USD'))).toBe('US$ 182,48');
    expect(text(money('10', 'EUR'))).toBe('€ 10,00');
  });

  it('adds a plus sign only to positive amounts when asked', () => {
    expect(text(money('8500.0000', 'BRL', true))).toBe('+R$ 8.500,00');
    expect(text(money('-23.9000', 'BRL', true))).toBe('-R$ 23,90');
    expect(text(money('0', 'BRL', true))).toBe('R$ 0,00');
  });
});

describe('dates', () => {
  it('reads YYYY-MM-DD as a calendar day, without timezone shift', () => {
    expect(shortDate('2026-11-01')).toBe('01/11');
    expect(dayMonth('2026-11-01T00:00:00')).toBe('1 nov');
    expect(fullDate('2026-01-09')).toBe('09/01/2026');
  });

  it('describes a period in as few words as possible', () => {
    expect(period(null, '2026-10-01')).toBeNull();
    expect(period('2026-10-05', '2026-10-05')).toBe('5 out');
    expect(period('2026-10-01', '2026-10-31')).toBe('1 a 31 out');
    expect(period('2026-10-20', '2026-11-03')).toBe('20 out a 3 nov');
    expect(period('2025-12-20', '2026-01-03')).toBe('20 dez 2025 a 3 jan 2026');
  });

  it('adds days and counts them across months and years', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(daysBetween('2026-02-27', '2026-03-01')).toBe(2);
  });
});

describe('months', () => {
  it('moves across year boundaries', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-11', -13)).toBe('2025-10');
  });

  it('names the month in Portuguese', () => {
    expect(monthLabel('2026-03')).toBe('Março 2026');
  });
});

describe('small helpers', () => {
  it('shows big numbers without cents', () => {
    expect(plain('16250.4000')).toBe('16.250');
  });

  it('takes initials from letters and digits only', () => {
    expect(initials('nubank')).toBe('Nu');
    expect(initials('***')).toBe('··');
  });
});
