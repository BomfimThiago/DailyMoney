// Links from Início into Transações: a row of "Divisão dos gastos" opens the month's
// spending of exactly that row ("Demais" opens everything but the rows above it); a day
// of the "Calendário de gastos" opens that day's spending.
import type { Dim, Pick } from './transactions';

// How Início names each tab of the breakdown, and the filter it becomes.
export type BreakdownBy = 'categoria' | 'pessoa' | 'banco' | 'conta';

const DIM_OF: Record<BreakdownBy, Dim> = {
  categoria: 'category',
  pessoa: 'member',
  banco: 'bank',
  conta: 'account',
};

// The route's query: ?mes=2026-11&filtro=categoria&ids=[…]&excluir=1&n=… ("n" changes on
// every tap, so tapping the same row again after changing the filters opens it again).
export type DrillParams = {
  mes?: string;
  filtro?: string;
  ids?: string;
  excluir?: string;
  n?: string;
  dia?: string;
};

export interface Drill {
  month: string;
  dim: Dim;
  pick: Pick;
}

export function drillParams(
  month: string,
  by: BreakdownBy,
  ids: string[],
  exclude: boolean,
  nonce = String(Date.now()),
): Required<Omit<DrillParams, 'dia'>> {
  return {
    mes: month,
    filtro: by,
    ids: JSON.stringify(ids),
    excluir: exclude ? '1' : '0',
    n: nonce,
  };
}

export function drillOf(p: DrillParams): Drill | null {
  if (!p.mes || !/^\d{4}-\d{2}$/.test(p.mes) || !p.filtro || !(p.filtro in DIM_OF)) return null;
  let ids: unknown;
  try {
    ids = JSON.parse(p.ids ?? '');
  } catch {
    return null;
  }
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((i) => typeof i === 'string')) {
    return null;
  }
  return {
    month: p.mes,
    dim: DIM_OF[p.filtro as BreakdownBy],
    pick: { ids: ids as string[], exclude: p.excluir === '1' },
  };
}

// A day of the calendar: ?mes=2026-11&dia=2026-10-28&n=… ("mes" is the month shown on
// Início, which may start on another day than the 1st).
export function dayParams(
  month: string,
  day: string,
  nonce = String(Date.now()),
): { mes: string; dia: string; n: string } {
  return { mes: month, dia: day, n: nonce };
}

export interface DayDrill {
  month: string;
  // As the De/Até fields show it: "28/10/2026".
  dayText: string;
}

export function dayDrillOf(p: DrillParams): DayDrill | null {
  if (!p.mes || !/^\d{4}-\d{2}$/.test(p.mes)) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(p.dia ?? '');
  if (!m) return null;
  return { month: p.mes, dayText: `${m[3]}/${m[2]}/${m[1]}` };
}
