// What the investments page shows for one currency, kept apart from the page for tests.
import { isZero, money } from './format';
import type { Currency, InvestmentOverview } from './types';

export type InvestmentView = {
  currency: Currency;
  total: InvestmentOverview['totals'][number];
  history: InvestmentOverview['history'];
  thisMonth: InvestmentOverview['history'][number] | undefined;
  products: InvestmentOverview['products'];
  movements: InvestmentOverview['movements'];
};

// The chosen currency if the month has it, otherwise the first one; null when there
// is nothing invested in any currency.
export function investmentView(
  data: InvestmentOverview,
  chosen: Currency | null,
): InvestmentView | null {
  const total = data.totals.find((t) => t.currency === chosen) ?? data.totals[0];
  if (!total) return null;
  const currency = total.currency;
  const history = data.history.filter((h) => h.currency === currency);
  return {
    currency,
    total,
    history,
    thisMonth: history[history.length - 1],
    products: data.products.filter((p) => p.currency === currency),
    movements: data.movements.filter((m) => m.currency === currency),
  };
}

// "Em novembro: +R$ 500,00 (R$ 700,00 aplicado, R$ 200,00 resgatado)", or null without moves.
export function monthMoves(v: InvestmentView): { net: string; detail: string } | null {
  const m = v.thisMonth;
  if (!m || (isZero(m.put_in) && isZero(m.taken_out))) return null;
  return {
    net: money(m.net, v.currency, true),
    detail: `(${money(m.put_in, v.currency)} aplicado, ${money(m.taken_out, v.currency)} resgatado)`,
  };
}

// The month's figures, zero when the month had no investment moves at all.
export function monthTotals(v: InvestmentView): { put_in: string; taken_out: string; net: string } {
  return v.thisMonth ?? { put_in: '0', taken_out: '0', net: '0' };
}

export function productMonth(p: InvestmentOverview['products'][number]): string {
  return isZero(p.month_net)
    ? 'sem movimento no mês'
    : `${money(p.month_net, p.currency, true)} no mês`;
}

// Display only: bar heights from 4 to 80 points, relative to the largest month.
export function barHeights(history: InvestmentOverview['history']): number[] {
  const values = history.map((h) => Math.max(Number(h.net), 0));
  const max = Math.max(...values, 1);
  return values.map((v) => Math.max(4, (v / max) * 80));
}
