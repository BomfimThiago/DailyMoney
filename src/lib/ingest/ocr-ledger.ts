import type { Currency } from "@prisma/client";
import { Decimal } from "@/lib/money";
import type { NormalizedRow } from "@/lib/tabular/types";
import type { OcrPass, OcrWord } from "./ocr/tesseract";

// Extrato que é só imagem (CaixaBankNow "digital"), lido por OCR e conferido pelo saldo
// corrido. Nenhum número é aceito por ter sido lido: cada leitura de valor e de saldo
// (várias resoluções, com e sem só-dígitos) é uma candidata, e vale a combinação em que
// saldo anterior + valor = saldo fecha ao longo do extrato. O valor que entra é a
// diferença entre dois saldos impressos que fecham com uma leitura do próprio valor.
//
// O que não fecha não é adivinhado: linha que o OCR não leu (cortada no pé da página)
// entra como "Linha ilegível no PDF" com a diferença exata do saldo, e valor lido que não
// bate com o saldo entra marcado para revisão. As duas coisas aparecem na importação.

export interface OcrLedgerResult {
  bank: string | null;
  currency: Currency;
  rows: NormalizedRow[];
  /** Avisos do documento inteiro. */
  warnings: string[];
  /** Linhas que precisam do usuário (índice em `rows`): impedem remover algo ao reimportar. */
  rowErrors: { rowIndex: number; message: string; raw: string }[];
}

type Column = "description" | "date" | "amount" | "balance";
interface Edges {
  date: number;
  amount: number;
  balance: number;
  /** y (0–1) do cabeçalho na página onde ele aparece. */
  headerY: number;
  headerPage: number;
}

const strip = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
const HEADER: Record<Exclude<Column, "description">, RegExp> = {
  date: /^(fecha|data|date)$/,
  amount: /^(importe|valor|amount)$/,
  balance: /^(saldo|balance)$/,
};

const byLine = (words: OcrWord[]) => {
  const m = new Map<string, OcrWord[]>();
  for (const w of words) m.set(w.line, [...(m.get(w.line) ?? []), w]);
  return [...m.values()].map((ws) => ws.sort((a, b) => a.left - b.left));
};
const midY = (ws: OcrWord[]) => ws.reduce((s, w) => s + (w.top + w.bottom) / 2, 0) / ws.length;

/** Cabeçalho "Concepto · Fecha · Importe · Saldo": onde termina cada coluna (alinhadas à direita). */
export function findColumns(passes: OcrPass[]): Edges | null {
  for (const p of passes.filter((x) => !x.numeric).sort((a, b) => a.page - b.page || b.resolution - a.resolution)) {
    for (const ws of byLine(p.words)) {
      const find = (re: RegExp) => ws.find((w) => re.test(strip(w.text)));
      const date = find(HEADER.date);
      const amount = find(HEADER.amount);
      const balance = [...ws].reverse().find((w) => HEADER.balance.test(strip(w.text)));
      if (date && amount && balance && date.right < amount.right && amount.right < balance.right) {
        return {
          date: date.right,
          amount: amount.right,
          balance: balance.right,
          headerY: midY(ws),
          headerPage: p.page,
        };
      }
    }
  }
  return null;
}

/**
 * A coluna de uma palavra. As de número são alinhadas à direita: começa depois do fim da
 * coluna anterior. Um número partido pelo OCR ("274," "73€") fica inteiro na mesma coluna.
 */
function columnOf(w: OcrWord, e: Edges): Column {
  if (w.left > e.amount + 0.015) return "balance";
  if (w.left > e.date + 0.015) return "amount";
  // A data ocupa ~0,11 da largura à esquerda da borda; antes disso é descrição.
  return w.left > e.date - 0.13 ? "date" : "description";
}

// ── Leitura de cada campo ──────────────────────────────────────────────────────────

/**
 * Saldo impresso: "3.215,68€", "251,18€", "1011.54" e os partidos pelo OCR ("274, 73€",
 * "42 42€") → Decimal; senão null.
 */
export function parseBalance(raw: string): Decimal | null {
  const s = raw.replace(/[€£$]|EUR/gi, "").trim();
  let m = /^(-?)(\d{1,3}(?:\.\d{3})+|\d+)\s?[,\s]\s?(\d{2})$/.exec(s);
  if (m) return new Decimal(`${m[1]}${m[2].replace(/\./g, "")}.${m[3]}`);
  m = /^(-?)(\d+)\.(\d{2})$/.exec(s);
  return m ? new Decimal(`${m[1]}${m[2]}.${m[3]}`) : null;
}

/** Valor do lançamento: "-14.5", "3049.05", "-2,1" → Decimal; senão null. */
export function parseAmountCell(raw: string): Decimal | null {
  const s = raw.replace(/\s/g, "").replace(/[€£$]/g, "").replace(",", ".");
  return /^[-+]?\d+(\.\d{1,2})?$/.test(s) ? new Decimal(s) : null;
}

/** Data dd/mm/aaaa lida com ruído ("0411/2026", "2//110/2026", "0111112026"). */
export function parseDateCell(raw: string): Date | null {
  const d = raw.replace(/\D/g, "");
  if (d.length < 8) return null;
  const day = Number(d.slice(0, 2));
  const year = Number(d.slice(-4));
  const mid = d.slice(2, -4);
  // O mês fica no meio; com dígitos a mais (barra lida como "1"), vale o fim do meio.
  const month = Number(mid.length === 2 ? mid : mid.slice(-2));
  if (day < 1 || day > 31 || month < 1 || month > 12 || year < 2000 || year > 2100) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCDate() === day ? date : null;
}

// ── Candidatas por linha do extrato ────────────────────────────────────────────────

interface Reading {
  y: number;
  description?: { text: string; conf: number };
  date?: string;
  amount?: string;
  balance?: string;
}

interface Cluster {
  page: number;
  y: number;
  readings: Reading[];
}

/** Agrupa as linhas lidas de todas as passadas de uma página pela altura na página. */
function clusters(passes: OcrPass[], e: Edges): Cluster[] {
  const out: Cluster[] = [];
  for (const page of [...new Set(passes.map((p) => p.page))].sort((a, b) => a - b)) {
    const readings: Reading[] = [];
    for (const p of passes.filter((x) => x.page === page)) {
      for (const ws of byLine(p.words)) {
        const y = midY(ws);
        if (page === e.headerPage && y <= e.headerY + 0.01) continue; // título, titular, período
        const r: Reading = { y };
        const parts: Record<Column, OcrWord[]> = { description: [], date: [], amount: [], balance: [] };
        for (const w of ws) {
          parts[columnOf(w, e)].push(w);
        }
        const join = (c: Column) => parts[c].map((w) => w.text).join(c === "date" ? "" : " ");
        if (!p.numeric && parts.description.length) {
          r.description = {
            text: join("description"),
            // A palavra mais fraca: uma palavra inventada ("Psoñ", 18%) estraga a descrição inteira.
            conf: Math.min(...parts.description.map((w) => w.conf)),
          };
        }
        if (parts.date.length) r.date = join("date");
        if (parts.amount.length) r.amount = join("amount");
        if (parts.balance.length) r.balance = join("balance");
        readings.push(r);
      }
    }
    // Linhas do extrato ficam a ~4% da altura umas das outras; leituras a <1,5% são a mesma.
    readings.sort((a, b) => a.y - b.y);
    const here: Cluster[] = [];
    for (const r of readings) {
      const last = here[here.length - 1];
      if (last && r.y - last.y < 0.015) {
        last.readings.push(r);
        last.y = last.readings.reduce((s, x) => s + x.y, 0) / last.readings.length;
      } else here.push({ page, y: r.y, readings: [r] });
    }
    out.push(...here);
  }
  return out;
}

/** Candidatas com o número de leituras que as apoiam. */
function tally<T>(values: (T | null)[], key: (v: T) => string): { value: T; support: number }[] {
  const m = new Map<string, { value: T; support: number }>();
  for (const v of values) {
    if (v === null) continue;
    const k = key(v);
    const cur = m.get(k);
    if (cur) cur.support++;
    else m.set(k, { value: v, support: 1 });
  }
  return [...m.values()].sort((a, b) => b.support - a.support);
}

interface Row {
  page: number;
  y: number;
  balances: { value: Decimal; support: number }[];
  amounts: { value: Decimal; support: number }[];
  dates: { value: Date; support: number }[];
  description: string;
  /** Alguma leitura viu texto aqui (mesmo ilegível): sinal de que há uma linha. */
  hasText: boolean;
}

const money = (d: Decimal) => d.toFixed(2);
const fmt = (d: Decimal) => {
  const [i, f] = d.abs().toFixed(2).split(".");
  return `${d.isNegative() ? "−" : ""}${i.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${f}`;
};
const day = (d: Date) => `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

function toRow(c: Cluster): Row {
  const desc = c.readings
    .map((r) => r.description)
    .filter((d): d is { text: string; conf: number } => Boolean(d?.text.trim()))
    .sort((a, b) => b.conf - a.conf)[0];
  return {
    page: c.page,
    y: c.y,
    balances: tally(
      c.readings.map((r) => (r.balance ? parseBalance(r.balance) : null)),
      money,
    ),
    amounts: tally(
      c.readings.map((r) => (r.amount ? parseAmountCell(r.amount) : null)),
      money,
    ),
    dates: tally(
      c.readings.map((r) => (r.date ? parseDateCell(r.date) : null)),
      (d) => d.toISOString(),
    ),
    hasText: c.readings.some((r) => /[a-z]{3}/i.test(r.description?.text ?? "")),
    // Texto que o OCR leu com pouca confiança ("Psoñ dal haha") não vira descrição.
    description: desc && desc.conf >= 50 ? desc.text.replace(/\s+/g, " ").trim() : "",
  };
}

interface Step {
  balance: Decimal;
  /** Como o saldo desta linha foi alcançado a partir da de baixo. */
  how: "start" | "amount" | "reset";
  /** "amount": o valor lido usado (com o sinal que fecha). */
  amount: Decimal | null;
  /** O saldo do caminho é uma das leituras do saldo desta linha. */
  anchored: boolean;
}

/**
 * A corrente de saldos (Viterbi, do mais antigo ao mais novo). Cada passo é o saldo de
 * baixo + uma leitura do valor desta linha (o sinal pode ter sumido: o trocado custa um
 * pouco); ganha pontos quando cai num saldo lido nesta linha. Pular para um saldo lido
 * sem um valor que leve até ele ("reset") custa caro: é a linha que não fecha.
 *
 * Assim um saldo que nenhuma leitura acertou (ou que nem foi lido), e até vários seguidos,
 * são atravessados pelos valores, desde que a corrente volte a cair nos saldos impressos.
 */
function walkChain(rows: Row[]): Step[] {
  const RESET = 6;
  const FLIP = 0.5;
  const BEAM = 40;
  type State = Step & { score: number; prev: State | null };
  const support = (r: Row, v: Decimal) => r.balances.find((b) => b.value.eq(v))?.support ?? 0;
  const n = rows.length;
  let states: State[] = rows[n - 1].balances.map((b) => ({
    balance: b.value,
    how: "start" as const,
    amount: null,
    anchored: true,
    score: b.support,
    prev: null,
  }));
  for (let i = n - 2; i >= 0; i--) {
    const r = rows[i];
    const next = new Map<string, State>();
    const offer = (st: State) => {
      const k = st.balance.toFixed(2);
      const cur = next.get(k);
      if (!cur || st.score > cur.score) next.set(k, st);
    };
    for (const st of states) {
      for (const a of r.amounts) {
        for (const sign of [1, -1]) {
          const amount = a.value.times(sign);
          const balance = st.balance.plus(amount);
          const sup = support(r, balance);
          offer({
            balance,
            how: "amount",
            amount,
            anchored: sup > 0,
            score: st.score + a.support + sup - (sign === -1 ? FLIP : 0),
            prev: st,
          });
        }
      }
    }
    const best = states.reduce((m, st) => (st.score > m.score ? st : m));
    for (const b of r.balances) {
      offer({
        balance: b.value,
        how: "reset",
        amount: null,
        anchored: true,
        score: best.score + b.support - RESET,
        prev: best,
      });
    }
    // Poda: os caminhos fora dos saldos impressos (combinações de leituras e sinais) são
    // muitos e encheriam a lista; o que está num saldo lido nunca é podado, senão a volta
    // para a corrente certa (depois de uma linha ilegível) se perde no mesmo passo.
    const ranked = [...next.values()].sort((x, y) => y.score - x.score);
    states = [...ranked.filter((x) => x.anchored), ...ranked.filter((x) => !x.anchored).slice(0, BEAM)];
  }
  const out: Step[] = new Array(n);
  // A corrente termina no saldo impresso da linha mais nova (o saldo final do extrato),
  // sempre que ele foi lido: é a âncora mais confiável que há.
  const ends = states.some((x) => x.anchored) ? states.filter((x) => x.anchored) : states;
  let st: State | null = ends.reduce((m, x) => (x.score > m.score ? x : m));
  for (let i = 0; i < n; i++) {
    out[i] = { balance: st!.balance, how: st!.how, amount: st!.amount, anchored: st!.anchored };
    st = st!.prev;
  }
  return out;
}

/**
 * O valor da linha `i` está conferido: há um saldo lido em cima (nesta linha ou acima,
 * ligado só por valores) e outro embaixo (na de baixo ou abaixo, idem).
 */
function confirmed(steps: Step[], i: number): boolean {
  let up = false;
  for (let j = i; j >= 0; j--) {
    if (steps[j].anchored) {
      up = true;
      break;
    }
    if (j > 0 && steps[j - 1].how !== "amount") break;
  }
  if (!up) return false;
  for (let k = i + 1; k < steps.length; k++) {
    if (steps[k].anchored) return true;
    if (steps[k].how !== "amount") return false;
  }
  return false;
}

/**
 * Datas do mais novo ao mais antigo, nunca subindo: a sequência com mais leituras a favor
 * (programação dinâmica). Uma data errada com muito apoio não arrasta as de baixo: a
 * linha pode ficar sem data (null) se nenhuma leitura dela cabe na ordem.
 */
function chooseDates(rows: Row[], period: { from: Date; to: Date } | null): (Date | null)[] {
  const inPeriod = (d: Date) => !period || (d >= period.from && d <= period.to);
  // Opções por linha: as datas lidas (no período) ou "ilegível".
  const opts = rows.map((r) => [
    ...r.dates.filter((d) => inPeriod(d.value)),
    { value: null as Date | null, support: 0 },
  ]);
  type Cell = { score: number; from: number; bound: Date | null };
  const dp: Cell[][] = opts.map((o) => o.map(() => ({ score: -Infinity, from: -1, bound: null })));
  opts[0].forEach((o, j) => (dp[0][j] = { score: o.support, from: -1, bound: o.value }));
  for (let i = 1; i < rows.length; i++) {
    opts[i].forEach((o, j) => {
      dp[i - 1].forEach((prev, k) => {
        if (prev.score === -Infinity) return;
        // `bound`: a data mais recente acima (a linha não pode ser mais nova que ela).
        if (o.value && prev.bound && o.value > prev.bound) return;
        const score = prev.score + o.support;
        if (score > dp[i][j].score) dp[i][j] = { score, from: k, bound: o.value ?? prev.bound };
      });
    });
  }
  const last = rows.length - 1;
  let j = dp[last].reduce((best, c, k, all) => (c.score > all[best].score ? k : best), 0);
  const out: (Date | null)[] = new Array(rows.length);
  for (let i = last; i >= 0; i--) {
    out[i] = opts[i][j].value;
    j = dp[i][j].from;
  }
  return out;
}

const IBAN_BANKS: Record<string, string> = { "2100": "CaixaBank" };

/** Banco pelo IBAN (código do banco) ou pelo nome lido; período pelo cabeçalho. */
function documentInfo(passes: OcrPass[]) {
  const text = passes
    .filter((p) => !p.numeric)
    .flatMap((p) => byLine(p.words).map((ws) => ws.map((w) => w.text).join(" ")))
    .join("\n");
  const iban = /ES\s?\d{2}\s?(\d{4})/.exec(text.replace(/IBAN:?/i, ""));
  const bank = (iban && IBAN_BANKS[iban[1]]) || (/aixa\s*bank/i.test(text) ? "CaixaBank" : null);
  const symbols = { EUR: (text.match(/€/g) ?? []).length, BRL: (text.match(/R\$/g) ?? []).length };
  const currency: Currency | null = symbols.EUR > symbols.BRL ? "EUR" : symbols.BRL > 0 ? "BRL" : null;
  const periodLine = text.split("\n").find((l) => /periodo|período|period/i.test(l));
  const dates = periodLine ? [...periodLine.matchAll(/\d{2}\D?\d{2}\D?\d{4}/g)].map((m) => parseDateCell(m[0])) : [];
  const period =
    dates.length >= 2 && dates[0] && dates[1] && dates[0] <= dates[1] ? { from: dates[0], to: dates[1] } : null;
  return { bank, currency, period };
}

export function readOcrLedger(passes: OcrPass[]): OcrLedgerResult | null {
  const edges = findColumns(passes);
  if (!edges) return null;
  const info = documentInfo(passes);
  // Entram na corrente as linhas com algum saldo ou valor legível; o resto (número da
  // página, rabisco no lugar de uma linha cortada) só conta como sinal de que há uma linha ali.
  const all = clusters(passes, edges).map(toRow);
  const rows = all.filter((r) => r.balances.length > 0 || r.amounts.length > 0);
  // A corrente começa no saldo da linha mais antiga: as de baixo sem saldo nenhum não têm onde apoiar.
  while (rows.length && rows[rows.length - 1].balances.length === 0) rows.pop();
  if (rows.length < 3) return null;
  if (!info.currency) throw new Error("Extrato em imagem: não deu para saber a moeda (nenhum símbolo nos saldos).");
  // Entre duas linhas da corrente, sobrou alguma leitura que parece transação (texto) sem
  // número legível? Então pode faltar uma linha ali (não só um valor mal lido).
  const between = rows.map((r, i) => {
    if (i === rows.length - 1) return false;
    const a = all.indexOf(r);
    const b = all.indexOf(rows[i + 1]);
    return all.slice(a + 1, b).some((c) => c.dates.length > 0 || c.hasText);
  });

  const steps = walkChain(rows);
  const dates = chooseDates(rows, info.period);
  const n = rows.length;

  // Valor e saldo de cada linha, a partir da corrente; os trechos que não fecham são
  // resolvidos abaixo. `issue`: o que o usuário precisa conferir naquela linha.
  const amount: (Decimal | null)[] = steps.map((st) => st.amount);
  const bal: Decimal[] = steps.map((st) => st.balance);
  const issue: ({ reason: string; message: string } | null)[] = new Array(n).fill(null);
  const gapAfter: (Decimal | null)[] = new Array(n).fill(null);
  const settled = new Array<boolean>(n).fill(false);
  const supportOf = (i: number, v: Decimal | null) =>
    v ? (rows[i].amounts.find((a) => a.value.abs().eq(v.abs()))?.support ?? 0) : 0;

  for (let i = 0; i < n - 1; i++) {
    if (steps[i].how !== "reset") continue;
    // A corrente pulou para o saldo lido nesta linha. Do saldo impresso mais próximo
    // embaixo (k) até ela, o total é conhecido: saldo daqui − saldo de lá.
    let k = i + 1;
    while (!steps[k].anchored) k++;
    const stretch = Array.from({ length: k - i }, (_, j) => i + j);
    const read = rows[i].amounts[0]?.value ?? null;
    amount[i] = read;
    const delta = bal[i].minus(bal[k]);
    const sum = stretch.reduce((s, r) => s.plus(amount[r] ?? 0), new Decimal(0));
    const residual = delta.minus(sum);
    const evidence = stretch.find((r) => between[r]);
    if (evidence !== undefined && !residual.isZero()) {
      // Há sinal de uma linha a mais (texto sem número legível): ela leva a diferença.
      gapAfter[evidence] = residual;
      // Valor bem lido (duas leituras ou mais) fica sem marca: a dúvida é da linha que falta.
      if (!read || supportOf(i, read) < 2)
        issue[i] = {
          reason: `O saldo não fecha com a linha de baixo: confira este valor${read ? ` (${fmt(read)})` : ""}.`,
          message: "o saldo não fecha com a linha anterior",
        };
      if (!read) amount[i] = new Decimal(0);
    } else {
      // Nada indica outra linha: a leitura mais fraca do trecho é que errou. Leva a
      // diferença (o valor que os saldos impressos mostram para ela).
      const weakest = [...stretch].sort(
        (x, y) =>
          supportOf(x, amount[x]) - supportOf(y, amount[y]) ||
          Number(Boolean(rows[x].description)) - Number(Boolean(rows[y].description)),
      )[0];
      const before = amount[weakest];
      amount[weakest] = (before ?? new Decimal(0)).plus(residual);
      issue[weakest] = before
        ? {
            reason: `Valor mal lido no PDF (${fmt(before)}): usado o que os saldos impressos mostram (${fmt(amount[weakest]!)}). Confira no extrato.`,
            message: `valor lido ${fmt(before)}, o saldo mostra ${fmt(amount[weakest]!)}`,
          }
        : {
            reason: "Valor ilegível no PDF: usada a diferença entre os saldos impressos.",
            message: `valor ilegível, tirado do saldo (${fmt(amount[weakest]!)})`,
          };
    }
    // Saldos do trecho refeitos de baixo para cima com os valores decididos.
    for (let r = k - 1; r >= i; r--) {
      bal[r] = bal[r + 1].plus(amount[r]!).plus(gapAfter[r] ?? 0);
      settled[r] = true;
    }
  }
  // Linhas que só os valores ligam, sem saldo impresso dos dois lados: sem conferência.
  for (let i = 0; i < n - 1; i++) {
    if (settled[i] || issue[i] || steps[i].how !== "amount" || confirmed(steps, i)) continue;
    issue[i] = {
      reason: "Nenhum saldo impresso legível perto desta linha para conferir o valor lido.",
      message: "valor sem saldo legível para conferir",
    };
  }

  const out: NormalizedRow[] = [];
  const rowErrors: OcrLedgerResult["rowErrors"] = [];
  let missing = 0;
  rows.forEach((r, i) => {
    const date = dates[i] ?? dates.slice(0, i).reverse().find(Boolean) ?? info.period?.to ?? null;
    if (!date) throw new Error("Extrato em imagem: nenhuma data legível.");
    const description = r.description || "Descrição ilegível no PDF";
    const row = (value: Decimal, balance: Decimal, extra: Partial<NormalizedRow>): NormalizedRow => ({
      date,
      description,
      merchantRaw: description,
      baseCurrency: info.currency!,
      baseAmount: value.toFixed(4),
      feeAmount: "0.0000",
      type: "EXPENSE", // classifyRows define pelo sinal
      state: "COMPLETED",
      isInternalTransfer: false,
      // Identidade da linha: data, valor e saldo impressos (estáveis entre leituras do mesmo arquivo).
      sourceRowRaw: `OCR ${date.toISOString().slice(0, 10)} ${value.toFixed(2)} saldo ${balance.toFixed(2)}`,
      sourceIsStatementLine: true,
      balance: balance.toFixed(2),
      ...extra,
    });
    const flag = (x: NormalizedRow, message: string) => {
      out.push(x);
      rowErrors.push({
        rowIndex: out.length - 1,
        message: `${day(x.date)} ${x.description}: ${message}`,
        raw: x.sourceRowRaw,
      });
    };
    const dateProblem = dates[i] ? null : "Data ilegível no PDF: usada a da linha de cima.";

    if (i === n - 1) {
      // A mais antiga: sem saldo anterior impresso, o valor só pode vir das leituras.
      const best = r.amounts[0];
      if (!best) throw new Error("Extrato em imagem: o valor da primeira transação do período está ilegível.");
      const agreed = best.support >= 2 && (r.amounts[1]?.support ?? 0) < best.support;
      const x = row(best.value, bal[i], {
        needsReview: !agreed || Boolean(dateProblem),
        reviewReason: !agreed
          ? "Primeira linha do período: sem saldo anterior para conferir o valor lido."
          : dateProblem,
      });
      if (agreed) out.push(x);
      else flag(x, "valor sem saldo anterior para conferir");
      return;
    }

    const value = amount[i] ?? bal[i].minus(bal[i + 1]);
    const problem = issue[i];
    const x = row(value, bal[i], {
      needsReview: Boolean(problem || dateProblem),
      reviewReason: problem?.reason ?? dateProblem,
    });
    if (problem) flag(x, problem.message);
    else out.push(x);

    const gap = gapAfter[i];
    if (gap && !gap.isZero()) {
      missing++;
      const olderDate = dates[i + 1] ?? date;
      const gapBalance = bal[i].minus(value);
      flag(
        row(gap, gapBalance, {
          description: "Linha ilegível no PDF",
          merchantRaw: "Linha ilegível no PDF",
          sourceRowRaw: `OCR ilegível ${date.toISOString().slice(0, 10)} ${gap.toFixed(2)} saldo ${gapBalance.toFixed(2)}`,
          needsReview: true,
          reviewReason: `Uma linha do PDF não deu para ler. O saldo impresso mostra ${fmt(gap)} entre ${day(olderDate)} e ${day(date)}: confira no extrato e corrija a descrição.`,
        }),
        `linha ilegível, ${fmt(gap)} pelo saldo`,
      );
    }
  });
  const verified = out.length - rowErrors.length;

  const warnings = [
    `Extrato em imagem lido por OCR (sem IA): ${verified} de ${out.length} linhas conferidas pelo saldo corrido.`,
    ...(missing
      ? [
          `${missing === 1 ? "1 linha não deu para ler" : `${missing} linhas não deram para ler`}: ${missing === 1 ? "entrou" : "entraram"} como "Linha ilegível no PDF" com o valor que o saldo mostra. Confira e corrija a descrição.`,
        ]
      : []),
  ];
  return { bank: info.bank, currency: info.currency, rows: out, warnings, rowErrors };
}
