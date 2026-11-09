import { Decimal } from "@/lib/money";
import { daysBetween } from "@/lib/period";

// Agregações do Resumo feitas no cliente sobre os dados da API — sempre em
// Decimal (strings entram, strings saem). Nada de float em dinheiro.

export type Lens = "BRL" | "USD" | "EUR";
type Amounts = { amountBRL: string; amountUSD: string; amountEUR: string };

export function amountIn(t: Amounts, lens: Lens): string {
  return lens === "BRL" ? t.amountBRL : lens === "USD" ? t.amountUSD : t.amountEUR;
}

export interface Group {
  key: string;
  label: string;
  color?: string;
  icon?: string | null;
  /** Soma dos gastos do grupo, positiva (valor absoluto). */
  total: string;
  count: number;
  /** Fração do total geral, 0–1, com 4 casas (para barras). */
  share: string;
}

interface GroupableTx extends Amounts {
  type: string;
  isInternalTransfer: boolean;
}

/**
 * Soma GASTOS (type EXPENSE, sem transferência interna) agrupados por `keyOf`.
 * Valores de gasto vêm negativos da API; o total é o valor absoluto.
 */
export function groupExpenses<T extends GroupableTx>(
  txs: T[],
  lens: Lens,
  keyOf: (t: T) => { key: string; label: string; color?: string; icon?: string | null },
): Group[] {
  return groupByType(txs, lens, "EXPENSE", keyOf);
}

/** Como `groupExpenses`, para gastos ou entradas (sempre sem as internas), em valor absoluto. */
function groupByType<T extends GroupableTx>(
  txs: T[],
  lens: Lens,
  type: "EXPENSE" | "INCOME",
  keyOf: (t: T) => { key: string; label: string; color?: string; icon?: string | null },
): Group[] {
  const map = new Map<string, Omit<Group, "share" | "total"> & { total: Decimal }>();
  let grand = new Decimal(0);
  for (const t of txs) {
    if (t.type !== type || t.isInternalTransfer) continue;
    const v = new Decimal(amountIn(t, lens)).abs();
    const k = keyOf(t);
    const g = map.get(k.key) ?? { ...k, total: new Decimal(0), count: 0 };
    g.total = g.total.plus(v);
    g.count += 1;
    map.set(k.key, g);
    grand = grand.plus(v);
  }
  return [...map.values()]
    .sort((a, b) => b.total.comparedTo(a.total))
    .map((g) => ({
      ...g,
      total: g.total.toFixed(2),
      share: grand.isZero() ? "0" : g.total.div(grand).toDecimalPlaces(4).toString(),
    }));
}

export interface MonthTotals {
  month: string; // "YYYY-MM"
  income: string; // positivo
  expense: string; // positivo (absoluto)
  net: string; // income − expense
}

interface SummaryLike {
  month: string;
  type: string;
  brl: string;
  usd: string;
  eur: string;
}

/** Converte as linhas de /api/summary em totais por mês na moeda da lente. */
export function monthTotals(rows: SummaryLike[], lens: Lens): MonthTotals[] {
  const pick = (r: SummaryLike) => (lens === "BRL" ? r.brl : lens === "USD" ? r.usd : r.eur);
  const map = new Map<string, { income: Decimal; expense: Decimal }>();
  for (const r of rows) {
    const m = map.get(r.month) ?? { income: new Decimal(0), expense: new Decimal(0) };
    const v = new Decimal(pick(r) || "0");
    if (r.type === "INCOME") m.income = m.income.plus(v);
    if (r.type === "EXPENSE") m.expense = m.expense.plus(v.abs());
    map.set(r.month, m);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, m]) => ({
      month,
      income: m.income.toFixed(2),
      expense: m.expense.toFixed(2),
      net: m.income.minus(m.expense).toFixed(2),
    }));
}

/** Variação percentual de `prev` para `curr` (ex.: "-21.3"); null se prev = 0. */
export function pctChange(curr: string, prev: string | undefined): string | null {
  if (!prev) return null;
  const p = new Decimal(prev);
  if (p.isZero()) return null;
  return new Decimal(curr).minus(p).div(p).times(100).toDecimalPlaces(1).toString();
}

/**
 * Corta os meses sem movimento do começo da série (antes do primeiro extrato importado):
 * desenhá-los como zero parecia uma queda real. Mantém pelo menos `min` meses.
 */
export function trimLeadingEmpty(series: MonthTotals[], min = 2): MonthTotals[] {
  const first = series.findIndex((m) => !new Decimal(m.income).isZero() || !new Decimal(m.expense).isZero());
  if (first === -1) return series;
  return series.slice(Math.min(first, Math.max(0, series.length - min)));
}

/** Números de rodapé do gráfico: média de gasto, mês mais caro, meses com sobra. */
export function seriesStats(series: MonthTotals[]) {
  const active = series.filter((m) => !new Decimal(m.income).isZero() || !new Decimal(m.expense).isZero());
  if (active.length === 0) return null;
  const totalExpense = active.reduce((s, m) => s.plus(m.expense), new Decimal(0));
  const priciest = active.reduce((a, b) => (new Decimal(b.expense).gt(a.expense) ? b : a));
  const totalNet = active.reduce((s, m) => s.plus(m.net), new Decimal(0));
  return {
    months: active.length,
    avgExpense: totalExpense.div(active.length).toFixed(2),
    priciest,
    positiveMonths: active.filter((m) => new Decimal(m.net).gt(0)).length,
    totalNet: totalNet.toFixed(2),
  };
}

/** Taxa de poupança do mês em % (ex.: "34.8"); null sem entradas. */
export function savingsRate(t: MonthTotals | undefined): string | null {
  if (!t) return null;
  const inc = new Decimal(t.income);
  if (inc.lte(0)) return null;
  return new Decimal(t.net).div(inc).times(100).toDecimalPlaces(1).toString();
}

type Sums = { amountBRL: string | null; amountUSD: string | null; amountEUR: string | null } | null;

/** Movimentações de um grupo (categoria de movimentação, ou sem categoria) no mês, por sentido. */
export interface MovementGroupInput {
  key: string;
  /** Saídas (valores negativos) e entradas (positivos) do grupo. */
  out: { count: number; _sum: Sums };
  in: { count: number; _sum: Sums };
}

export interface MovementRow {
  key: string;
  /** Quanto saiu e quanto entrou, ambos em módulo. */
  out: string;
  in: string;
  /** Entrou − saiu: negativo = saiu mais do que voltou. */
  net: string;
  count: number;
}

const sumIn = (s: Sums, lens: Lens) =>
  new Decimal((lens === "BRL" ? s?.amountBRL : lens === "USD" ? s?.amountUSD : s?.amountEUR) ?? "0");

/**
 * O que só mudou de lugar no mês, por grupo e no todo. Com todas as contas conectadas, o
 * que sai de uma entra na outra e o saldo fica perto de zero; o que sobra foi (ou veio)
 * de investimentos ou de contas que ainda não estão no app.
 */
export function summarizeMovements(groups: MovementGroupInput[], lens: Lens) {
  let out = new Decimal(0);
  let inn = new Decimal(0);
  const rows: MovementRow[] = groups
    .map((g) => {
      const o = sumIn(g.out._sum, lens).abs();
      const i = sumIn(g.in._sum, lens).abs();
      out = out.plus(o);
      inn = inn.plus(i);
      return { key: g.key, o, i, count: g.out.count + g.in.count };
    })
    .filter((r) => r.count > 0)
    .sort((a, b) => b.o.plus(b.i).comparedTo(a.o.plus(a.i)))
    .map((r) => ({
      key: r.key,
      out: r.o.toFixed(2),
      in: r.i.toFixed(2),
      net: r.i.minus(r.o).toFixed(2),
      count: r.count,
    }));
  return { rows, out: out.toFixed(2), in: inn.toFixed(2), net: inn.minus(out).toFixed(2) };
}

/**
 * Gasto acumulado dia a dia num período (posição 0 = o primeiro dia), em valor absoluto: as
 * mesmas transações que contam em "Gastos" (tipo EXPENSE, sem as internas). `start` é o
 * primeiro dia ("AAAA-MM-DD"; "AAAA-MM" = o dia 1 desse mês). `date` é o dia do lançamento
 * à meia-noite UTC (ISO); fora do período é ignorado.
 */
export function cumulativeExpenses<T extends GroupableTx & { date: string }>(
  txs: T[],
  lens: Lens,
  start: string,
  days: number,
): string[] {
  let run = new Decimal(0);
  return dailyExpenses(txs, lens, start, days).map((v) => (run = run.plus(v)).toFixed(2));
}

/** Gasto de cada dia do período (posição 0 = `start`), em módulo: as mesmas transações de "Gastos". */
export function dailyExpenses<T extends GroupableTx & { date: string }>(
  txs: T[],
  lens: Lens,
  start: string,
  days: number,
): string[] {
  const first = start.length === 7 ? `${start}-01` : start;
  const perDay = Array.from({ length: days }, () => new Decimal(0));
  for (const t of txs) {
    if (t.type !== "EXPENSE" || t.isInternalTransfer) continue;
    const i = daysBetween(first, t.date.slice(0, 10));
    if (i >= 0 && i < days) perDay[i] = perDay[i].plus(new Decimal(amountIn(t, lens)).abs());
  }
  return perDay.map((v) => v.toFixed(2));
}

export interface CalendarDay {
  /** Posição no período (1 = o primeiro dia). */
  day: number;
  /** O dia do calendário ("AAAA-MM-DD"). */
  date: string;
  total: string;
  /** 0 = sem gasto (ou dia ainda por vir); 1–4 = o quartil do dia entre os dias com gasto. */
  level: 0 | 1 | 2 | 3 | 4;
  /** Dia depois de hoje (no mês corrente): ainda não aconteceu. */
  future: boolean;
}

/**
 * Calendário de gastos: cada dia com o total e uma intensidade de 1 a 4 pelo quartil entre
 * os dias com gasto (não pela fração do mais caro: assim um dia de aluguel não deixa todos
 * os outros com a mesma cor clara). Conta os dias sem gasto e o mais caro só até `upTo`
 * (hoje, no mês corrente).
 */
export function spendingCalendar(daily: string[], upTo: number, start: string) {
  const [sy, sm, sd] = (start.length === 7 ? `${start}-01` : start).split("-").map(Number);
  const dateAt = (i: number) => new Date(Date.UTC(sy, sm - 1, sd + i)).toISOString().slice(0, 10);
  const seen = daily.slice(0, upTo).map((v) => new Decimal(v));
  const max = seen.reduce((m, v) => Decimal.max(m, v), new Decimal(0));
  const spent = seen.filter((v) => !v.isZero()).sort((a, b) => a.comparedTo(b));
  const q = (f: number) => spent[Math.floor((spent.length - 1) * f)];
  const cuts = spent.length ? [q(0.25), q(0.5), q(0.75)] : [];
  const days: CalendarDay[] = daily.map((v, i) => {
    const d = new Decimal(v);
    const future = i + 1 > upTo;
    const level = (future || d.isZero() ? 0 : 1 + cuts.filter((c) => d.gt(c)).length) as CalendarDay["level"];
    return { day: i + 1, date: dateAt(i), total: d.toFixed(2), level, future };
  });
  const peakIdx = seen.findIndex((v) => !max.isZero() && v.equals(max));
  return {
    days,
    /** Dias sem nenhum gasto, até `upTo`. */
    zeroDays: seen.filter((v) => v.isZero()).length,
    upTo,
    peak: peakIdx === -1 ? null : { day: peakIdx + 1, date: dateAt(peakIdx), total: max.toFixed(2) },
  };
}

export interface MonthPace {
  /** Até que dia o mês tem dados (hoje, no mês corrente; senão o último dia). */
  day: number;
  spent: string;
  /** O mês anterior até o mesmo dia (ou até o fim dele, se for mais curto). */
  previousAtDay: string;
  /** spent − previousAtDay. */
  diff: string;
  /** Variação em %, inteira ("-18"); null sem mês anterior para comparar. */
  pct: string | null;
}

/** Quanto se gastou até o dia `day` comparado com o mesmo ponto do mês anterior. */
export function monthPace(current: string[], previous: string[], day: number): MonthPace {
  const spent = new Decimal(current[day - 1] ?? "0");
  const prev = new Decimal(previous[Math.min(day, previous.length) - 1] ?? "0");
  const diff = spent.minus(prev);
  return {
    day,
    spent: spent.toFixed(2),
    previousAtDay: prev.toFixed(2),
    diff: diff.toFixed(2),
    pct: prev.isZero() ? null : diff.dividedBy(prev).times(100).toFixed(0),
  };
}

/** Primeiro dia em que o acumulado chegou à metade do total do mês (null sem gastos). */
export function halfwayDay(cumulative: string[]): number | null {
  const total = new Decimal(cumulative[cumulative.length - 1] ?? "0");
  if (total.isZero()) return null;
  const half = total.dividedBy(2);
  return cumulative.findIndex((v) => new Decimal(v).gte(half)) + 1;
}

export type FlowKind = "income" | "expense" | "rest" | "saved" | "deficit";

export interface FlowNode {
  key: string;
  label: string;
  color?: string;
  icon?: string | null;
  kind: FlowKind;
  /** Valor em módulo. */
  value: string;
  /** Fração do total do fluxo (o lado maior), 0–1, com 4 casas. */
  share: string;
  count: number;
}

export interface MonthFlow {
  income: string;
  expense: string;
  /** O que passa pelo meio: o maior entre entradas e gastos. Cada lado soma exatamente isso. */
  total: string;
  /** Entradas por categoria; com gasto maior que a entrada, mais "Das reservas" (a diferença). */
  sources: FlowNode[];
  /** Gastos por categoria; com sobra, mais "Sobrou". */
  targets: FlowNode[];
}

/**
 * O fluxo do mês: de onde veio o dinheiro (entradas por categoria) e para onde foi (gastos
 * por categoria e o que sobrou). Os dois lados fecham no centavo: o que sobra entra à
 * direita, e o que faltou (gasto acima da entrada) entra à esquerda como "Das reservas".
 * Movimentações internas ficam de fora, como em todos os totais. As categorias além das
 * `maxTargets` maiores viram uma só ("Outros gastos"), para o desenho caber.
 */
export function monthFlow<T extends GroupableTx>(
  txs: T[],
  lens: Lens,
  keyOf: (t: T) => { key: string; label: string; color?: string; icon?: string | null },
  { maxSources = 3, maxTargets = 5 }: { maxSources?: number; maxTargets?: number } = {},
): MonthFlow | null {
  const income = groupByType(txs, lens, "INCOME", keyOf);
  const expense = groupByType(txs, lens, "EXPENSE", keyOf);
  const sum = (gs: Group[]) => gs.reduce((s, g) => s.plus(g.total), new Decimal(0));
  const inc = sum(income);
  const exp = sum(expense);
  const total = Decimal.max(inc, exp);
  if (total.isZero()) return null;

  const node = (g: Omit<FlowNode, "share" | "value"> & { value: Decimal }): FlowNode => ({
    ...g,
    value: g.value.toFixed(2),
    share: g.value.div(total).toDecimalPlaces(4).toString(),
  });
  // As `max` maiores e o resto numa só; se o resto for uma categoria, ela mesma.
  const top = (gs: Group[], max: number, kind: FlowKind, restLabel: string) => {
    const keep = gs.length <= max + 1 ? gs : gs.slice(0, max);
    const rest = gs.slice(keep.length);
    const out = keep.map((g) =>
      node({
        key: g.key,
        label: g.label,
        color: g.color,
        icon: g.icon,
        kind,
        value: new Decimal(g.total),
        count: g.count,
      }),
    );
    if (rest.length)
      out.push(
        node({
          key: `rest:${kind}`,
          label: restLabel,
          kind: "rest",
          value: sum(rest),
          count: rest.reduce((n, g) => n + g.count, 0),
        }),
      );
    return out;
  };

  const sources = top(income, maxSources, "income", "Outras entradas");
  const targets = top(expense, maxTargets, "expense", "Outros gastos");
  if (inc.gt(exp))
    targets.push(node({ key: "saved", label: "Sobrou", kind: "saved", value: inc.minus(exp), count: 0 }));
  if (exp.gt(inc))
    sources.push(node({ key: "deficit", label: "Das reservas", kind: "deficit", value: exp.minus(inc), count: 0 }));

  return { income: inc.toFixed(2), expense: exp.toFixed(2), total: total.toFixed(2), sources, targets };
}
