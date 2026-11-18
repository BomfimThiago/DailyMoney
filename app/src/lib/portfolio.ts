// The bank's investment portfolio as the Investimentos page shows it, kept apart for tests.
// Amounts arrive as decimal strings; numbers here are for display only (sizes, percents).
import { fullDate, money, shortDate } from './format';
import type { Currency, Portfolio, PortfolioPosition } from './types';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// "67%", from a 0–1 share.
export function percent(share: string): string {
  return `${Math.round(Number(share) * 100)}%`;
}

// Below the total: "3 investimentos · saldo de 16/11".
export function totalSub(p: Portfolio): string {
  const count = plural(p.count, 'investimento', 'investimentos');
  return p.value_date ? `${count} · saldo de ${shortDate(p.value_date)}` : count;
}

// "+R$ 600,50 (+17,2%)", or null when no bank says how much was put in.
export function gainText(p: Portfolio): string | null {
  const t = p.tracked;
  if (!t) return null;
  const pct =
    t.gain_pct === null
      ? ''
      : ` (${Number(t.gain_pct) > 0 ? '+' : ''}${t.gain_pct.replace('.', ',')}%)`;
  return `${money(t.gain, p.currency, true)}${pct}`;
}

export function gainSub(p: Portfolio): string {
  return p.tracked
    ? `sobre ${money(p.tracked.invested, p.currency)} aplicados em renda fixa e Tesouro`
    : 'o banco não informa o aplicado';
}

// "2 títulos", "nenhum título".
export function maturingSub(p: Portfolio): string {
  const n = p.maturing.count;
  return n ? plural(n, 'título', 'títulos') : 'nenhum título';
}

// "Nubank R$ 3.000,00 · Inter R$ 1.500,50": only when there is more than one bank.
export function banksLine(p: Portfolio): string | null {
  if (p.banks.length < 2) return null;
  return p.banks.map((b) => `${b.bank} ${money(b.total, p.currency)}`).join(' · ');
}

// A class's name inside a sentence: "renda fixa", but "Tesouro Direto" and "ETFs".
function inSentence(c: Portfolio['classes'][number]): string {
  return c.key === 'treasury' || c.key === 'etf' ? c.label : c.label.toLowerCase();
}

// One sentence on top: the classes that weigh most.
export function finding(p: Portfolio): string | null {
  const [top, second] = p.classes;
  if (!top) return null;
  if (!second) return `Tudo em ${inSentence(top)}.`;
  return `${percent(top.share)} em ${inSentence(top)}, ${percent(second.share)} em ${inSentence(second)}.`;
}

// Below each position: "Nubank · 110% do CDI · vence 15/03/2028".
export function positionSub(pos: PortfolioPosition): string {
  return [pos.bank, pos.rate_label, pos.due_date ? `vence ${fullDate(pos.due_date)}` : null]
    .filter(Boolean)
    .join(' · ');
}

// The gain under the balance, or the balance in its own currency when it was converted.
export function positionNote(pos: PortfolioPosition, lens: Currency): string | null {
  if (pos.gain !== null) return `${money(pos.gain, lens, true)} rendeu`;
  return pos.currency !== lens ? money(pos.balance, pos.currency) : null;
}

// Shades of the investment colour for the allocation bar: biggest class the strongest.
export const SHADES = [1, 0.7, 0.5, 0.36, 0.26, 0.18, 0.12, 0.08];

export function shade(i: number): number {
  return SHADES[Math.min(i, SHADES.length - 1)];
}

// Line chart of the total: x and y for each point inside width × height, or null with
// fewer than two points.
export function historyPoints(
  history: Portfolio['history'],
  width: number,
  height: number,
): { x: number; y: number }[] | null {
  if (history.length < 2) return null;
  const values = history.map((h) => Number(h.total));
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || max || 1;
  const pad = 6;
  return values.map((v, i) => ({
    x: (i / (values.length - 1)) * width,
    y: pad + (1 - (v - min) / span) * (height - pad * 2),
  }));
}

// "17/11/2025 a 16/11/2026": the period the chart covers.
export function historyRange(history: Portfolio['history']): string | null {
  if (history.length < 2) return null;
  return `${fullDate(history[0].date)} a ${fullDate(history[history.length - 1].date)}`;
}

// Bar heights of the maturity ladder, 3 to 72 points, relative to the biggest year.
export function ladderHeights(steps: NonNullable<Portfolio['ladder']>['steps']): number[] {
  const values = steps.map((s) => Number(s.total));
  const max = Math.max(...values, 1);
  return values.map((v) => (v > 0 ? Math.max(3, (v / max) * 72) : 0));
}

// Under the ladder: what has no date to come back.
export function undatedText(p: Portfolio): string | null {
  const l = p.ladder;
  if (!l || !l.undated_count) return null;
  return `${money(l.undated_total, p.currency)} sem vencimento (ações, fundos, liquidez diária)`;
}

// Shown instead of the portfolio when there is nothing to show.
export function emptyText(p: Portfolio): string {
  return p.has_source
    ? 'O banco conectado ainda não informou nenhum investimento.'
    : 'Conecte o Nubank ou o Inter em Conexões para ver aqui o saldo de cada investimento, a divisão por tipo e os vencimentos.';
}
