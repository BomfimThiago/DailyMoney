import type { Currency } from "@prisma/client";
import { Decimal } from "@/lib/money";

// Carteira de investimentos para a tela: agrupada por classe, com total, participação de
// cada classe e quanto rendeu sobre o aplicado (só onde o banco informa o aplicado: renda
// fixa e Tesouro; ação, FII e ETF vêm só com o saldo). Tudo em Decimal.

export interface PositionInput {
  id: string;
  type: string;
  subtype: string | null;
  currency: Currency;
  balance: string;
  balanceBRL: string;
  balanceUSD: string;
  balanceEUR: string;
  amountOriginal: string | null;
}

export type InvestmentClass = "fixed" | "treasury" | "stocks" | "realEstate" | "etf" | "funds" | "pension" | "other";

export const CLASS_LABEL: Record<InvestmentClass, string> = {
  fixed: "Renda fixa",
  treasury: "Tesouro Direto",
  stocks: "Ações",
  realEstate: "Fundos imobiliários",
  etf: "ETFs",
  funds: "Fundos",
  pension: "Previdência",
  other: "Outros",
};

export function investmentClass(type: string, subtype: string | null): InvestmentClass {
  if (type === "FIXED_INCOME") return subtype === "TREASURY" ? "treasury" : "fixed";
  if (type === "EQUITY") return subtype === "REAL_ESTATE_FUND" ? "realEstate" : "stocks";
  if (type === "ETF" || subtype === "ETF_FUND") return "etf";
  if (type === "MUTUAL_FUND") return "funds";
  if (type === "SECURITY") return "pension";
  return "other";
}

/**
 * Cor de cada classe (passa por `tint()` nos componentes, como a cor de categoria do banco).
 * Matizes bem separados; nenhum é o cobalto da ação principal.
 */
export const CLASS_COLOR: Record<InvestmentClass, string> = {
  fixed: "#0f766e",
  treasury: "#7c3aed",
  stocks: "#ea580c",
  realEstate: "#ca8a04",
  etf: "#0284c7",
  funds: "#db2777",
  pension: "#16a34a",
  other: "#94a3b8",
};

const LENS_FIELD = { BRL: "balanceBRL", USD: "balanceUSD", EUR: "balanceEUR" } as const;

export interface PortfolioClass<P> {
  key: InvestmentClass;
  label: string;
  total: string;
  /** % da carteira, inteiro ("64"). */
  share: string;
  /** Fração da carteira, 0–1 com 4 casas (para a barra de alocação). */
  fraction: string;
  color: string;
  positions: P[];
}

export interface PortfolioSummary<P> {
  total: string;
  count: number;
  classes: PortfolioClass<P>[];
  /** Onde o banco informa o aplicado: quanto foi aplicado, quanto vale hoje e a diferença. */
  tracked: { invested: string; value: string; gain: string; gainPct: string | null } | null;
}

export function summarizePortfolio<P extends PositionInput>(positions: P[], lens: Currency): PortfolioSummary<P> {
  const field = LENS_FIELD[lens];
  const inLens = (p: P) => new Decimal(p[field]);
  let total = new Decimal(0);
  let invested = new Decimal(0);
  let value = new Decimal(0);
  const groups = new Map<InvestmentClass, P[]>();
  for (const p of positions) {
    const v = inLens(p);
    total = total.plus(v);
    const key = investmentClass(p.type, p.subtype);
    groups.set(key, [...(groups.get(key) ?? []), p]);
    const balance = new Decimal(p.balance);
    if (p.amountOriginal !== null && !balance.isZero()) {
      // O aplicado está na moeda do investimento: vai para a lente pela mesma taxa do saldo.
      invested = invested.plus(new Decimal(p.amountOriginal).times(v).dividedBy(balance));
      value = value.plus(v);
    }
  }
  const classes = [...groups]
    .map(([key, ps]) => {
      const sum = ps.reduce((s, p) => s.plus(inLens(p)), new Decimal(0));
      return {
        key,
        label: CLASS_LABEL[key],
        total: sum.toFixed(2),
        share: total.isZero() ? "0" : sum.dividedBy(total).times(100).toFixed(0),
        fraction: total.isZero() ? "0" : sum.dividedBy(total).toDecimalPlaces(4).toString(),
        color: CLASS_COLOR[key],
        positions: [...ps].sort((a, b) => inLens(b).comparedTo(inLens(a))),
      };
    })
    .sort((a, b) => new Decimal(b.total).comparedTo(a.total));
  const gain = value.minus(invested);
  return {
    total: total.toFixed(2),
    count: positions.length,
    classes,
    tracked: value.isZero()
      ? null
      : {
          invested: invested.toFixed(2),
          value: value.toFixed(2),
          gain: gain.toFixed(2),
          gainPct: invested.isZero() ? null : gain.dividedBy(invested).times(100).toFixed(1),
        },
  };
}

const pct = (d: string) => new Decimal(d).toDecimalPlaces(2).toString().replace(".", ",");

/** Remuneração contratada em texto: "100% do CDI", "IPCA + 6,5% a.a.", "12% a.a.". */
export function rateLabel(p: {
  rate: string | null;
  rateType: string | null;
  fixedAnnualRate: string | null;
}): string | null {
  const fixed = p.fixedAnnualRate !== null && !new Decimal(p.fixedAnnualRate).isZero() ? p.fixedAnnualRate : null;
  const plus = fixed ? ` + ${pct(fixed)}% a.a.` : "";
  if (p.rateType && p.rate !== null) {
    const index = p.rateType === "DOLAR" ? "dólar" : p.rateType === "EURO" ? "euro" : p.rateType;
    // Índice de inflação: "IPCA + 6%"; de juros (CDI, Selic): "110% do CDI".
    if (["IPCA", "IGPM"].includes(p.rateType) && new Decimal(p.rate).equals(100)) return `${index}${plus}`;
    return `${pct(p.rate)}% do ${p.rateType === "SELIC" ? "Selic" : index}${plus}`;
  }
  return fixed ? `${pct(fixed)}% a.a.` : null;
}

/** Quanto a posição rendeu sobre o aplicado, na lente (pela mesma taxa do saldo). Null se o banco não informa o aplicado. */
export function positionGain(p: PositionInput, lens: Currency): string | null {
  const balance = new Decimal(p.balance);
  if (p.amountOriginal === null || balance.isZero()) return null;
  const v = new Decimal(p[LENS_FIELD[lens]]);
  return v.minus(new Decimal(p.amountOriginal).times(v).dividedBy(balance)).toFixed(2);
}

/** O que vence de `from` até `months` meses depois: quantos e quanto valem hoje (na lente). */
export function maturing<P extends PositionInput & { dueDate: string | null }>(
  positions: P[],
  lens: Currency,
  from: Date,
  months: number,
): { count: number; total: string } {
  const until = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + months, from.getUTCDate()));
  const due = positions.filter((p) => p.dueDate && new Date(p.dueDate) >= from && new Date(p.dueDate) < until);
  return {
    count: due.length,
    total: due.reduce((s, p) => s.plus(p[LENS_FIELD[lens]]), new Decimal(0)).toFixed(2),
  };
}

/** Total por banco (na lente), maior primeiro. */
export function byBank<P extends PositionInput & { bank: string }>(
  positions: P[],
  lens: Currency,
): { bank: string; total: string }[] {
  const m = new Map<string, Decimal>();
  for (const p of positions) m.set(p.bank, (m.get(p.bank) ?? new Decimal(0)).plus(p[LENS_FIELD[lens]]));
  return [...m].sort((a, b) => b[1].comparedTo(a[1])).map(([bank, total]) => ({ bank, total: total.toFixed(2) }));
}

export interface LadderStep {
  /** "2027", ou "2034+" no último degrau quando os anos não cabem. */
  label: string;
  year: number;
  /** Quanto vale hoje o que vence no ano (na lente). */
  total: string;
  count: number;
}

export interface MaturityLadder {
  steps: LadderStep[];
  /** O que tem data de vencimento (a soma dos degraus). */
  dated: { total: string; count: number };
  /** Ações, FIIs, fundos, liquidez diária…: sem data para voltar. */
  undated: { total: string; count: number };
}

/**
 * Escada de vencimentos: quanto da carteira (pelo valor de hoje) vence em cada ano, do ano
 * corrente até o último vencimento. Anos sem nada no meio ficam com zero (o buraco é
 * informação); além de `maxYears` degraus, o resto vai junto no último ("2034+"). O que já
 * passou da data e ainda aparece aberto conta no ano corrente. Null sem nenhum vencimento.
 */
export function maturityLadder<P extends PositionInput & { dueDate: string | null }>(
  positions: P[],
  lens: Currency,
  today: Date,
  maxYears = 8,
): MaturityLadder | null {
  const field = LENS_FIELD[lens];
  const first = today.getUTCFullYear();
  const byYear = new Map<number, { total: Decimal; count: number }>();
  let undated = new Decimal(0);
  let undatedCount = 0;
  for (const p of positions) {
    const v = new Decimal(p[field]);
    if (!p.dueDate) {
      undated = undated.plus(v);
      undatedCount += 1;
      continue;
    }
    const y = Math.max(first, new Date(p.dueDate).getUTCFullYear());
    const b = byYear.get(y) ?? { total: new Decimal(0), count: 0 };
    byYear.set(y, { total: b.total.plus(v), count: b.count + 1 });
  }
  if (!byYear.size) return null;
  const last = Math.max(...byYear.keys());
  const cap = Math.min(last, first + maxYears - 1);
  const steps: LadderStep[] = [];
  let dated = new Decimal(0);
  let datedCount = 0;
  for (let y = first; y <= cap; y++) {
    let total = new Decimal(0);
    let count = 0;
    for (const [year, b] of byYear) {
      if (year === y || (y === cap && year > cap)) {
        total = total.plus(b.total);
        count += b.count;
      }
    }
    dated = dated.plus(total);
    datedCount += count;
    steps.push({ label: y === cap && last > cap ? `${y}+` : String(y), year: y, total: total.toFixed(2), count });
  }
  return {
    steps,
    dated: { total: dated.toFixed(2), count: datedCount },
    undated: { total: undated.toFixed(2), count: undatedCount },
  };
}
