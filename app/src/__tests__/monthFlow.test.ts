import { describe, expect, it } from '@jest/globals';

import { comparisonRows, flowLayout, flowNodes } from '@/lib/monthFlow';

const share = (name: string, amount: string) => ({ name, amount });

describe('month against the month before', () => {
  it('gives each figure, the month before and the difference, coloured by what is good', () => {
    const rows = comparisonRows(
      { income: '5000.0000', spending: '3000.0000' },
      { income: '4000.0000', spending: '3500.0000' },
    );
    expect(rows).toEqual([
      { key: 'income', label: 'Entradas', previous: '4000.00', diff: '1000.00', tone: 'good' },
      { key: 'spending', label: 'Gastos', previous: '3500.00', diff: '-500.00', tone: 'good' },
      { key: 'left', label: 'Sobra', previous: '500.00', diff: '1500.00', tone: 'good' },
    ]);
  });

  it('marks more spending and less income as bad, and no change as neutral', () => {
    const [income, spending, left] = comparisonRows(
      { income: '100.10', spending: '300' },
      { income: '100.10', spending: '200' },
    );
    expect(income.tone).toBe('same');
    expect(spending.tone).toBe('bad');
    expect(left).toMatchObject({ diff: '-100.00', tone: 'bad' });
  });

  it('has nothing to compare when the month before is empty', () => {
    const rows = comparisonRows({ income: '10', spending: '5' }, { income: '0', spending: '0' });
    expect(rows.every((r) => r.previous === null && r.diff === null && r.tone === 'same')).toBe(
      true,
    );
  });
});

describe('month flow', () => {
  it('sends the income to each spending category and the rest to Sobrou', () => {
    const flow = flowNodes(
      [share('Renda', '5000')],
      [share('Mercado', '1200'), share('Moradia', '2000')],
    );
    expect(flow.income).toBe(5000);
    expect(flow.spending).toBe(3200);
    expect(flow.total).toBe(5000);
    expect(flow.sources).toEqual([
      { key: 'in:Renda', label: 'Renda', value: 5000, kind: 'income' },
    ]);
    expect(flow.targets.map((t) => [t.label, t.value, t.kind])).toEqual([
      ['Moradia', 2000, 'spending'],
      ['Mercado', 1200, 'spending'],
      ['Sobrou', 1800, 'saved'],
    ]);
  });

  it('brings the overspending in from the savings, and keeps the lists short', () => {
    const many = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((n, i) => share(n, String(100 - i)));
    const flow = flowNodes([share('Renda', '300')], many);
    expect(flow.total).toBe(flow.spending);
    expect(flow.sources.at(-1)).toMatchObject({ label: 'Das reservas', kind: 'deficit' });
    expect(flow.sources.reduce((s, n) => s + n.value, 0)).toBeCloseTo(flow.spending);
    expect(flow.targets).toHaveLength(7);
    expect(flow.targets.at(-1)).toMatchObject({ label: 'Demais' });
    expect(flow.targets.some((t) => t.kind === 'saved')).toBe(false);
  });

  it('is empty when nothing came in or went out', () => {
    expect(flowNodes([], []).total).toBe(0);
  });

  it('stacks both sides on one scale so the bands fit the middle bar', () => {
    const flow = flowNodes([share('Renda', '1000')], [share('Mercado', '600')]);
    const layout = flowLayout(flow, 700);
    expect(layout.wide).toBe(true);
    const [mercado, saved] = layout.right;
    expect(mercado.h + saved.h).toBeCloseTo(layout.hubH);
    expect(saved.hubY).toBeCloseTo(layout.hubY + mercado.h);
    // Labels never overlap.
    expect(layout.right[1].labelY - layout.right[0].labelY).toBeGreaterThanOrEqual(36);
    expect(layout.left).toHaveLength(1);
  });

  it('drops the income column on a narrow screen', () => {
    const flow = flowNodes([share('Renda', '1000')], [share('Mercado', '600')]);
    const layout = flowLayout(flow, 340);
    expect(layout.wide).toBe(false);
    expect(layout.left).toHaveLength(0);
    expect(layout.hubX).toBe(0);
  });
});
