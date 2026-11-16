import { describe, expect, it } from '@jest/globals';

import { approveAllLabel, groupSub, groupTitle, reviewItems, reviewLabel } from '@/lib/review';
import type { ReviewGroup } from '@/lib/types';
import { movement } from '@/testing/investments';

const group = (o: Partial<ReviewGroup> = {}): ReviewGroup => ({
  import_id: 'i1',
  label: 'nu.csv',
  source: 'statement',
  imported_at: '2026-11-16T10:00:00Z',
  items: [movement({ id: 'a' }), movement({ id: 'b' })],
  ...o,
});

describe('review', () => {
  it('names each import the way it came in', () => {
    expect(groupTitle(group())).toBe('Extrato nu.csv');
    expect(groupTitle(group({ source: 'bank', label: 'Revolut · Conta EUR' }))).toBe(
      'Revolut · Conta EUR',
    );
    expect(groupSub(group())).toBe('Enviado em 16 nov · 2 transações');
    expect(groupSub(group({ source: 'bank', items: [movement()] }))).toBe(
      'Sincronizado em 16 nov · 1 transação',
    );
    expect(groupSub(group({ imported_at: null }))).toBe('2 transações');
  });

  it('counts and labels what waits', () => {
    expect(reviewLabel(1)).toBe('1 transação para revisar');
    expect(reviewLabel(3)).toBe('3 transações para revisar');
    expect(approveAllLabel(group())).toBe('Aprovar todas (2)');
    expect(approveAllLabel(group({ items: [movement()] }))).toBe('Aprovar');
    expect(reviewItems(undefined)).toEqual([]);
    expect(reviewItems({ total: 2, groups: [group()] }).map((t) => t.id)).toEqual(['a', 'b']);
  });
});
