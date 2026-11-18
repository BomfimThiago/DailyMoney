// Início: the month against the one before, and where the month's money went (flow chart).

type Totals = { income: string; spending: string };

export type Tone = 'good' | 'bad' | 'same';

export type ComparisonRow = {
  key: 'income' | 'spending' | 'left';
  label: string;
  // Decimal strings with 2 places; null when the month before has nothing.
  previous: string | null;
  diff: string | null;
  tone: Tone;
};

const cents = (amount: string) => Math.round(Number(amount) * 100);
const fromCents = (c: number) => (c / 100).toFixed(2);

// Entradas, Gastos and Sobra of the month before, and how much each changed. The colour
// says good or bad, not up or down: more spending is bad, more income or leftover is good.
export function comparisonRows(now: Totals, before: Totals): ComparisonRow[] {
  const empty = cents(before.income) === 0 && cents(before.spending) === 0;
  const figures = (t: Totals) => ({
    income: cents(t.income),
    spending: cents(t.spending),
    left: cents(t.income) - cents(t.spending),
  });
  const a = figures(now);
  const b = figures(before);
  const rows: [ComparisonRow['key'], string, 'up' | 'down'][] = [
    ['income', 'Entradas', 'up'],
    ['spending', 'Gastos', 'down'],
    ['left', 'Sobra', 'up'],
  ];
  return rows.map(([key, label, better]) => {
    if (empty) return { key, label, previous: null, diff: null, tone: 'same' };
    const diff = a[key] - b[key];
    const tone: Tone = diff === 0 ? 'same' : diff > 0 === (better === 'up') ? 'good' : 'bad';
    return { key, label, previous: fromCents(b[key]), diff: fromCents(diff), tone };
  });
}

// ── flow chart ───────────────────────────────────────────────────────────────

export type FlowKind = 'income' | 'deficit' | 'spending' | 'saved';
export type FlowNode = { key: string; label: string; value: number; kind: FlowKind };
export type MonthFlow = {
  income: number;
  spending: number;
  // The middle bar: whichever side is bigger, so both sides add up to it.
  total: number;
  sources: FlowNode[];
  targets: FlowNode[];
};

const KEEP_SOURCES = 4;
const KEEP_TARGETS = 7;

function shorten(nodes: FlowNode[], keep: number, prefix: string, kind: FlowKind): FlowNode[] {
  if (nodes.length <= keep) return nodes;
  const rest = nodes.slice(keep - 1).reduce((s, n) => s + n.value, 0);
  return [...nodes.slice(0, keep - 1), { key: `${prefix}:*`, label: 'Demais', value: rest, kind }];
}

// Income by category goes into the month; spending by category and the leftover come out.
// When spending is bigger than income, the difference comes in as "Das reservas".
export function flowNodes(
  incomeBy: { name: string; amount: string }[],
  spendingBy: { name: string; amount: string }[],
): MonthFlow {
  const node = (prefix: string, kind: FlowKind) => (s: { name: string; amount: string }) => ({
    key: `${prefix}:${s.name}`,
    label: s.name,
    value: Number(s.amount),
    kind,
  });
  const byValue = (a: FlowNode, b: FlowNode) => b.value - a.value;
  const ins = incomeBy
    .map(node('in', 'income'))
    .filter((n) => n.value > 0)
    .sort(byValue);
  const outs = spendingBy
    .map(node('out', 'spending'))
    .filter((n) => n.value > 0)
    .sort(byValue);
  const income = ins.reduce((s, n) => s + n.value, 0);
  const spending = outs.reduce((s, n) => s + n.value, 0);
  const sources = shorten(ins, KEEP_SOURCES, 'in', 'income');
  const targets = shorten(
    outs,
    income > spending ? KEEP_TARGETS - 1 : KEEP_TARGETS,
    'out',
    'spending',
  );
  if (spending > income)
    sources.push({
      key: 'deficit',
      label: 'Das reservas',
      value: spending - income,
      kind: 'deficit',
    });
  if (income > spending)
    targets.push({ key: 'saved', label: 'Sobrou', value: income - spending, kind: 'saved' });
  return { income, spending, total: Math.max(income, spending), sources, targets };
}

export const FLOW = {
  node: 8,
  gap: 8,
  hub: 220,
  labelMin: 36,
  padTop: 46,
  padBottom: 6,
  // Below this width the income column goes away and the middle bar becomes the start.
  wide: 620,
};

export type Placed = { n: FlowNode; y: number; h: number; hubY: number; labelY: number };

// Labels centred on their block, pushed apart so they never overlap, inside [top, bottom].
function spread(centers: number[], top: number, bottom: number): number[] {
  const ys = [...centers];
  for (let i = 0; i < ys.length; i++) ys[i] = Math.max(ys[i], i ? ys[i - 1] + FLOW.labelMin : top);
  for (let i = ys.length - 1; i >= 0; i--)
    ys[i] = Math.min(ys[i], i < ys.length - 1 ? ys[i + 1] - FLOW.labelMin : bottom);
  return ys;
}

// Where every block, band and label goes. One scale for both sides and the middle bar, so
// the bands fit; the gap between two blocks grows as needed for each label to sit beside
// its block, and the drawing grows with it.
export function flowLayout(flow: MonthFlow, width: number) {
  const wide = width >= FLOW.wide;
  const sources = wide ? flow.sources : [];
  const labelR = wide ? 200 : Math.min(176, Math.round(width * 0.5));
  const labelL = wide ? 150 : 0;
  const tgtX = width - labelR - FLOW.node;
  const srcX = labelL;
  const hubX = wide ? Math.round(srcX + (tgtX - srcX) * 0.46) : 0;
  const k = flow.total > 0 ? FLOW.hub / flow.total : 0;

  const measure = (nodes: FlowNode[]) => {
    const hs = nodes.map((n) => n.value * k);
    const gaps = hs.slice(1).map((h, i) => Math.max(FLOW.gap, FLOW.labelMin - (hs[i] + h) / 2));
    const used = hs.reduce((a, b) => a + b, 0) + gaps.reduce((a, b) => a + b, 0);
    return { hs, gaps, used };
  };
  const R = measure(flow.targets);
  const L = measure(sources);
  const plotH = Math.max(FLOW.hub, R.used, L.used);
  const height = FLOW.padTop + plotH + FLOW.padBottom;
  const hubY = FLOW.padTop + (plotH - FLOW.hub) / 2;

  const stack = (nodes: FlowNode[], m: ReturnType<typeof measure>): Placed[] => {
    let y = FLOW.padTop + (plotH - m.used) / 2;
    let hub = hubY;
    const placed = nodes.map((n, i) => {
      const out = { n, y, h: m.hs[i], hubY: hub, labelY: 0 };
      y += m.hs[i] + (m.gaps[i] ?? 0);
      hub += m.hs[i];
      return out;
    });
    const ys = spread(
      placed.map((p) => p.y + p.h / 2),
      FLOW.padTop + 14,
      FLOW.padTop + plotH - 14,
    );
    return placed.map((p, i) => ({ ...p, labelY: ys[i] }));
  };

  return {
    wide,
    width,
    height,
    srcX,
    hubX,
    tgtX,
    hubY,
    hubH: FLOW.hub,
    left: stack(sources, L),
    right: stack(flow.targets, R),
    labelR,
  };
}

// The SVG path of a band from (x0, a0..a1) to (x1, b0..b1).
export function band(x0: number, a0: number, a1: number, x1: number, b0: number, b1: number) {
  const m = (x0 + x1) / 2;
  return `M${x0},${a0} C${m},${a0} ${m},${b0} ${x1},${b0} L${x1},${b1} C${m},${b1} ${m},${a1} ${x0},${a1} Z`;
}
