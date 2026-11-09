import type { Currency } from "@prisma/client";
import { Decimal } from "@/lib/money";
import { isBalanceLabel } from "@/lib/ingest/labels";
import { parseLooseAmount } from "@/lib/tabular/normalize";
import type { NormalizedRow } from "@/lib/tabular/types";

// "Razão" do PDF: os pares (valor, saldo) lidos DIRETO do texto do extrato, sem IA.
//
// Extratos com saldo corrido (Revolut, CaixaBank, Wise, Inter…) terminam cada linha
// de transação com dois valores: o da transação e o saldo depois dela. Quando o PDF
// tem esse razão, ELE define quais transações existem e quanto valem; a IA só diz a
// data e a descrição de cada uma:
// - valor e saldo vêm do texto, nunca do modelo;
// - o sinal vem do texto quando o extrato imprime sinal (CaixaBank, Inter, Wise) ou,
//   quando não imprime (Revolut: colunas "saliente"/"entrante" sem sinal), da
//   diferença para o saldo da linha vizinha no próprio extrato;
// - linha que a IA leu mas não existe no extrato é descartada (e a importação avisa);
// - linha do extrato que a IA pulou ganha uma segunda leitura só dela (extract.ts);
//   se ainda assim não sair, vira erro visível na importação.

export interface LedgerLine {
  /** Valor com sinal: o impresso, ou o deduzido pelos saldos vizinhos. */
  amount: Decimal;
  /** false = extrato sem sinal e os saldos vizinhos não decidiram. */
  signKnown: boolean;
  balance: Decimal;
  currency: Currency | null;
  /** Texto da transação (linhas desde o par anterior + a do par). */
  text: string;
  /** Texto + último cabeçalho com data + a linha seguinte (para a 2ª leitura). */
  context: string;
  /** O saldo antes dela aparece no documento (linhas de resumo/totais não encadeiam). */
  chained: boolean;
  /**
   * Datas candidatas, conforme o lugar onde cada banco imprime a data: na própria
   * linha (CaixaBank, Revolut), num cabeçalho/linha anterior (Inter, Revolut com
   * descrição em várias linhas) ou na linha seguinte (Wise). Qual vale é calibrado
   * por documento em `reconcileWithLedger`.
   */
  dates: Record<DateSpot, Date | null>;
  /** Descrição tirada do texto (sem datas nem valores), para linhas que a IA pulou. */
  description: string;
  index: number;
}

type DateSpot = "line" | "before" | "next";

// Valor monetário com 2 casas: "-88,56€", "1.023,12€", "-R$ 27.730,66", "2.970,46",
// "65,36 EUR", "$1,234.56". Agrupamento de milhar só com "." "," ou "'" (espaço
// juntaria dois valores vizinhos num só).
export const MONEY = String.raw`[-−+]?\s?(?:R\$|US\$|\$|€|£)?\s?[-−]?\d{1,3}(?:[.,']\d{3})*[.,]\d{2}(?:\s?(?:€|EUR|BRL|USD|R\$))?`;
const PAIR_AT_END = new RegExp(String.raw`(${MONEY})\s+(${MONEY})\s*$`);
const CONTEXT_LINES = 3;

export function parseMoney(token: string): Decimal {
  const negative = /[-−]/.test(token);
  const digits = token.replace(/[^\d.,']/g, "").replace(/'/g, "");
  const abs = new Decimal(parseLooseAmount(digits)).abs();
  return negative ? abs.negated() : abs;
}

export function currencyOf(token: string): Currency | null {
  if (/€|EUR/.test(token)) return "EUR";
  if (/R\$|BRL/.test(token)) return "BRL";
  if (/\$|USD/.test(token)) return "USD";
  return null;
}

const MONTHS: Record<string, number> = {
  jan: 0,
  ene: 0,
  feb: 1,
  fev: 1,
  mar: 2,
  abr: 3,
  apr: 3,
  may: 4,
  mai: 4,
  jun: 5,
  jul: 6,
  ago: 7,
  aug: 7,
  sep: 8,
  set: 8,
  oct: 9,
  out: 9,
  nov: 10,
  dic: 11,
  dez: 11,
  dec: 11,
};
// "31/07/2026", "2026-07-31", "3 jul 2026", "10 de abril de 2026", "4 de Agosto de 2025".
const DATE =
  /(\d{1,2})\/(\d{1,2})\/(\d{4})|(\d{4})-(\d{2})-(\d{2})|(\d{1,2})(?:\s+de)?\s+([A-Za-zÀ-ÿ]{3,})\.?(?:\s+de)?\s+(\d{4})/g;
const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

/** Datas encontradas na linha, na ordem em que aparecem. Exportada para teste. */
export function findDates(line: string): Date[] {
  const out: Date[] = [];
  for (const m of line.matchAll(DATE)) {
    let y: number, mo: number, d: number;
    if (m[1]) [d, mo, y] = [+m[1], +m[2] - 1, +m[3]];
    else if (m[4]) [y, mo, d] = [+m[4], +m[5] - 1, +m[6]];
    else {
      const month = MONTHS[fold(m[8]).slice(0, 3)];
      if (month === undefined) continue;
      [d, mo, y] = [+m[7], month, +m[9]];
    }
    const date = new Date(Date.UTC(y, mo, d));
    if (date.getUTCMonth() === mo && date.getUTCDate() === d) out.push(date);
  }
  return out;
}

const stripLine = (line: string) =>
  line
    .replace(DATE, " ")
    .replace(new RegExp(MONEY, "g"), " ")
    .replace(/\(\s*[A-Za-zÀ-ÿ]*:?\s*\)/g, " ") // "(fee: )" que sobra sem o valor
    .replace(/\s+/g, " ")
    .trim();
const hasWords = (s: string) => /[A-Za-zÀ-ÿ]{3,}/.test(s) && !s.startsWith("|");

export function readLedger(pages: string[]): LedgerLine[] {
  const out: LedgerLine[] = [];
  // A última data vista atravessa a quebra de página: no Inter, a primeira transação
  // de uma página pertence ao cabeçalho de dia da página anterior.
  let before: Date | null = null;
  for (const page of pages) {
    const lines = page
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    let pending: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const m = PAIR_AT_END.exec(line);
      if (!m) {
        pending.push(line);
        before = findDates(line)[0] ?? before;
        continue;
      }
      try {
        const amount = parseMoney(m[1]);
        const block = [...pending.slice(-CONTEXT_LINES), line];
        const next = lines[i + 1] && !PAIR_AT_END.test(lines[i + 1]) ? lines[i + 1] : "";
        // Descrição: do último trecho com data em diante (antes dele é a linha anterior),
        // pulando a linha de data que só tem metadado ("10 de abril de 2026 | Transação…").
        let from = 0;
        block.forEach((b, k) => {
          if (k < block.length - 1 && findDates(b).length) from = hasWords(stripLine(b)) ? k : k + 1;
        });
        // A linha do valor já é a transação quando tem data (CaixaBank, Revolut) ou texto
        // próprio (Inter, Wise); só a de valor "pelado" (Revolut em 2 linhas) usa as de cima.
        if (findDates(line).length || hasWords(stripLine(line))) from = block.length - 1;
        const description = block.slice(from).map(stripLine).filter(hasWords).join(" ").trim();
        // "Saldo do dia: R$ 10,00 R$ 10,00" não é lançamento, só o saldo impresso.
        if (description && isBalanceLabel(description)) {
          pending = [];
          continue;
        }
        out.push({
          amount,
          signKnown: amount.isNegative(),
          balance: parseMoney(m[2]),
          currency: currencyOf(m[1]) ?? currencyOf(m[2]),
          text: block.join(" "),
          context: [...block, next].filter(Boolean).join(" ⏎ "),
          chained: false,
          dates: { line: findDates(line)[0] ?? null, before, next: next ? (findDates(next)[0] ?? null) : null },
          description,
          index: out.length,
        });
      } catch {
        // não era dinheiro de verdade: ignora
      }
      pending = [];
    }
  }
  // Valores sem símbolo (Wise: "-65,00 0,36"): a moeda é a que o extrato mais cita.
  const docCurrency = mostCited(pages);
  for (const l of out) l.currency ??= docCurrency;
  const money = allMoney(pages);
  resolveSigns(out, money);
  // Transação de verdade: o saldo ANTES dela (saldo − o próprio valor) aparece no
  // documento — como saldo de outra linha ou como saldo inicial do resumo. Linhas de
  // resumo/totais também terminam em dois valores, mas o valor delas não leva a um
  // saldo anterior.
  for (const l of out) {
    const amounts = l.signKnown ? [l.amount] : [l.amount, l.amount.negated()];
    l.chained = amounts.some((a) => money.has(l.balance.minus(a).toFixed(2)));
  }
  // A transação mais antiga pode não ter o saldo anterior impresso, mas é o saldo
  // anterior de outra transação (exige sinal decidido: resumo sem sinal fica de fora).
  for (const l of out) {
    if (l.chained || !l.signKnown) continue;
    l.chained = out.some((o) => o !== l && o.chained && o.signKnown && o.balance.minus(o.amount).eq(l.balance));
  }
  return out;
}

// Extrato que imprime sinal: o impresso vale (positivo = entrada). Extrato sem
// nenhum sinal: saldo depois − saldo antes = valor, olhando a linha vizinha no
// documento (antes ou depois, conforme o extrato esteja em ordem crescente ou
// decrescente). Local, então valores repetidos não confundem.
export function mostCited(pages: string[]): Currency | null {
  const n: Record<Currency, number> = { EUR: 0, BRL: 0, USD: 0 };
  for (const page of pages) {
    n.EUR += (page.match(/€|\bEUR\b/g) ?? []).length;
    n.BRL += (page.match(/R\$|\bBRL\b/g) ?? []).length;
    n.USD += (page.match(/US\$|\bUSD\b/g) ?? []).length;
  }
  const best = (Object.keys(n) as Currency[]).sort((a, b) => n[b] - n[a])[0];
  return n[best] > 0 ? best : null;
}

function allMoney(pages: string[]): Set<string> {
  const set = new Set<string>();
  for (const page of pages) {
    for (const m of page.matchAll(new RegExp(MONEY, "g"))) {
      try {
        set.add(parseMoney(m[0]).toFixed(2));
      } catch {
        // ignora
      }
    }
  }
  return set;
}

function resolveSigns(ledger: LedgerLine[], money: Set<string>): void {
  const signed = ledger.some((l) => l.amount.isNegative());
  for (let i = 0; i < ledger.length; i++) {
    const l = ledger[i];
    if (signed) {
      l.signKnown = true;
      continue;
    }
    for (const n of [ledger[i - 1], ledger[i + 1]]) {
      if (!n) continue;
      const delta = l.balance.minus(n.balance);
      if (!delta.isZero() && delta.abs().eq(l.amount.abs())) {
        l.amount = delta;
        l.signKnown = true;
        break;
      }
    }
  }
  // Primeira linha de cada conta não tem vizinha anterior: o saldo antes dela é o
  // saldo inicial impresso no resumo do extrato. Se só um dos sinais leva a um valor
  // que aparece no documento, é esse.
  for (const l of ledger) {
    if (l.signKnown) continue;
    const abs = l.amount.abs();
    const fits = [abs, abs.negated()].filter((a) => money.has(l.balance.minus(a).toFixed(2)));
    if (fits.length === 1) {
      l.amount = fits[0];
      l.signKnown = true;
    }
  }
}

const MIN_LEDGER = 3; // menos que isso: o documento não tem saldo corrido (recibo, foto…)
// O razão define as linhas quando o próprio extrato é um razão completo: a maioria
// das linhas encadeia pelo saldo. Abaixo disso (extrato com linhas sem saldo, ou
// muitos pares que são resumo/totais) as linhas da IA ficam, e as que não aparecem
// no texto vão para revisão.
const LEDGER_FIRST_CHAINED = 0.8;
export const NOT_IN_STATEMENT = "valor não aparece no extrato";
export const SIGN_UNCONFIRMED = "confira se é entrada ou saída";

const words = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2),
  );
const overlap = (a: Set<string>, b: Set<string>) => {
  let n = 0;
  for (const w of a) if (b.has(w)) n++;
  return n;
};

export interface LedgerReconciliation {
  rows: NormalizedRow[];
  /** Linhas do extrato sem linha da IA correspondente (candidatas à 2ª leitura). */
  unmatched: LedgerLine[];
  /** Linhas da IA descartadas por não existirem no extrato. */
  dropped: NormalizedRow[];
  /** Quanto o lugar da data escolhido concorda com as datas de referência (0..1). */
  dateAgreement: number;
}

/**
 * Linhas em que os lugares possíveis da data discordam (ex.: Wise, onde a data da
 * linha anterior e a da seguinte diferem): são as que servem para calibrar.
 */
export function ambiguousLines(ledger: LedgerLine[]): LedgerLine[] {
  return ledger.filter((l) => {
    if (!l.chained) return false;
    const days = new Set(
      Object.values(l.dates)
        .filter(Boolean)
        .map((d) => d!.getTime()),
    );
    return days.size > 1;
  });
}

export const TRUSTED_AGREEMENT = 0.6;

/**
 * Concilia as linhas lidas pela IA com o razão do extrato. Devolve null quando o
 * documento não tem saldo corrido (não há o que conferir).
 */
export function reconcileWithLedger(
  rows: NormalizedRow[],
  ledger: LedgerLine[],
  samples: [LedgerLine, Date][] = [],
): LedgerReconciliation | null {
  if (ledger.length < MIN_LEDGER) return null;
  const used = new Map<number, NormalizedRow>();
  let cursor = 0;

  for (const r of rows) {
    const amt = new Decimal(r.baseAmount);
    const candidates = ledger.filter((l) => !used.has(l.index) && l.amount.abs().eq(amt.abs()));
    if (candidates.length === 0) continue;
    // Entre valores repetidos: saldo que a IA leu > descrição parecida > sinal da IA
    // (pouco confiável, só desempata) > ordem do documento.
    const desc = words(r.description);
    const score = (l: LedgerLine) =>
      (r.balance && l.balance.eq(r.balance) ? 100 : 0) +
      overlap(desc, words(l.text)) * 10 +
      (l.signKnown && l.amount.isNegative() === amt.isNegative() ? 5 : 0) +
      (l.index >= cursor ? 1 : 0) -
      Math.abs(l.index - cursor) / 1000;
    const pick = candidates.reduce((best, l) => (score(l) > score(best) ? l : best));
    used.set(pick.index, r);
    cursor = pick.index;
    applyLine(r, pick);
  }

  const matched = new Set(used.values());
  // Pulada de verdade = encadeia pelo saldo e tem sinal decidido (linhas de resumo,
  // como "Depósito 0,00€ 0,04€ 500,23€ 500,19€", não passam nos dois).
  const skipped = ledger.filter((l) => !used.has(l.index) && l.chained && l.signKnown);
  const ledgerFirst = ledger.filter((l) => l.chained).length / ledger.length >= LEDGER_FIRST_CHAINED;

  // Onde este extrato imprime a data: o lugar que mais concorda com as datas das
  // linhas que a IA leu (ou, se vierem, com `samples`: datas de uma amostra lida em
  // lotes pequenos, mais confiáveis). Com concordância alta, a data do texto corrige
  // a da IA (ex.: 31/07 lido como 01/07) e as linhas puladas saem do texto, sem IA.
  const dateOf = pickDateSpot(samples.length ? samples : [...used.entries()].map(([i, r]) => [ledger[i], r.date]));
  if (dateOf.agreement >= TRUST_TEXT_DATES) {
    for (const [i, r] of used) {
      const d = dateOf.spot(ledger[i]);
      if (d) r.date = d;
    }
  }
  const fallbackCurrency = majority(rows.map((r) => r.baseCurrency));
  const recovered: [number, NormalizedRow][] = [];
  const unmatched: LedgerLine[] = [];
  for (const l of skipped) {
    const date = dateOf.agreement >= RECOVER_FROM_TEXT ? dateOf.spot(l) : null;
    const currency = l.currency ?? fallbackCurrency;
    if (date && currency && l.description) recovered.push([l.index, rowFromLine(l, date, currency)]);
    else unmatched.push(l);
  }

  if (ledgerFirst) {
    // O razão define as linhas, na ordem do extrato.
    const ordered = [...used.entries(), ...recovered].sort((a, b) => a[0] - b[0]).map(([, r]) => r);
    return { rows: ordered, unmatched, dropped: rows.filter((r) => !matched.has(r)), dateAgreement: dateOf.agreement };
  }
  for (const r of rows) {
    if (matched.has(r)) continue;
    r.needsReview = true;
    r.reviewReason = NOT_IN_STATEMENT;
  }
  return { rows: [...rows, ...recovered.map(([, r]) => r)], unmatched, dropped: [], dateAgreement: dateOf.agreement };
}

// Concordância mínima (linhas com data do texto = data da IA) para confiar no texto.
// A data do texto é determinística; a da IA erra (o 3b troca dia/mês, pega a data
// de outra linha). Basta o lugar escolhido concordar com a maioria.
const TRUST_TEXT_DATES = TRUSTED_AGREEMENT;
const RECOVER_FROM_TEXT = TRUSTED_AGREEMENT;
const MIN_CALIBRATION = 3;
const SPOT_ORDERS: DateSpot[][] = [["line", "before"], ["line", "next"], ["next", "line"], ["before"], ["next"]];

function pickDateSpot(samples: [LedgerLine, Date][]): { spot: (l: LedgerLine) => Date | null; agreement: number } {
  const none = { spot: () => null, agreement: 0 };
  if (samples.length < MIN_CALIBRATION) return none;
  let best = none as { spot: (l: LedgerLine) => Date | null; agreement: number };
  for (const order of SPOT_ORDERS) {
    const spot = (l: LedgerLine) => order.map((k) => l.dates[k]).find((d) => d) ?? null;
    const agree = samples.filter(([l, d]) => spot(l)?.getTime() === d.getTime()).length / samples.length;
    if (agree > best.agreement) best = { spot, agreement: agree };
  }
  return best;
}

function majority<T>(xs: T[]): T | null {
  const n = new Map<T, number>();
  for (const x of xs) n.set(x, (n.get(x) ?? 0) + 1);
  let best: T | null = null;
  for (const [x, c] of n) if (best === null || c > (n.get(best) ?? 0)) best = x;
  return best;
}

/** Linha montada só com o texto do extrato (a IA a pulou). */
export function rowFromLine(l: LedgerLine, date: Date, currency: Currency): NormalizedRow {
  const row: NormalizedRow = {
    date,
    description: l.description,
    merchantRaw: l.description,
    baseCurrency: currency,
    baseAmount: l.amount.toFixed(4),
    feeAmount: "0.0000",
    type: "EXPENSE", // classificado depois, com o sinal final
    state: "COMPLETED",
    isInternalTransfer: false,
    sourceRowRaw: l.text,
  };
  applyLine(row, l);
  return row;
}

/**
 * Valor, sinal, saldo e moeda da linha do extrato passam para a linha. A linha do
 * extrato também vira a identidade dela (`sourceRowRaw`): reenviar o mesmo PDF acha a
 * mesma transação mesmo que a IA escreva a descrição de outro jeito.
 */
export function applyLine(r: NormalizedRow, l: LedgerLine): void {
  r.balance = l.balance.toFixed(2);
  if (l.currency) r.baseCurrency = l.currency; // a IA às vezes dá a moeda citada na descrição (conversões)
  r.sourceRowRaw = l.text;
  r.sourceIsStatementLine = true;
  if (l.signKnown) {
    r.baseAmount = l.amount.toFixed(4);
  } else {
    r.baseAmount = new Decimal(r.baseAmount).abs().eq(l.amount.abs()) ? r.baseAmount : l.amount.toFixed(4);
    r.needsReview = true;
    r.reviewReason = SIGN_UNCONFIRMED;
  }
}
