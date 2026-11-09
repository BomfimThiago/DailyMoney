import { Decimal } from "@/lib/money";
import { SYNC_FORMATS } from "@/lib/ingest/formats";

// A mesma transação vinda de fontes diferentes: extrato por arquivo (CSV, OFX, PDF) e
// banco conectado (Pluggy, Enable Banking). Cada fonte escreve a descrição do seu jeito ("Transferência
// enviada pelo Pix - Fulano - •••…" × "Transferência enviada pelo Pix|Fulano";
// "Compra de ETF - DIVO11" × "Compra de Renda Variável"), e às vezes divide em duas
// linhas o que a outra mostra em uma. A impressão digital (que inclui a descrição) não
// as reconhece. O que não muda entre fontes: banco, dia, moeda e o dinheiro do dia.
//
// Por isso comparamos o DIA inteiro de cada fonte, não linhas soltas. Um dia que chega é
// "o mesmo" que um dia já gravado de outra fonte quando:
//   1. o total do dia é igual, centavo a centavo;
//   2. pelo menos metade das linhas (do lado que tem mais) tem par de valor idêntico;
//   3. se o total do dia é zero (entrou e saiu o mesmo), todas as linhas têm par.
// Aí nenhuma linha do dia entra de novo. Medido com extratos reais do Nubank (CSV, OFX
// e Pluggy, out–nov/2026): 100% dos dias iguais reconhecidos, e nenhum dia casado por
// engano entre conta e cartão do mesmo banco, nem entre Nubank e Inter.
//
// Dia de borda (o primeiro ou o último que uma fonte cobre) pode estar pela metade:
// extrato baixado às 17h, sincronização depois. Nele, se todas as linhas do lado menor
// têm par de valor idêntico, os pares não entram e o resto (o que veio depois) entra.
//
// Fora disso, um dia que não fecha só gera "possível repetida" para as linhas com par de
// valor idêntico: o usuário decide na revisão. Nada é pulado sem evidência: perder uma
// compra real é pior que ver uma a mais.

export interface IncomingRow {
  /** yyyy-mm-dd */
  day: string;
  currency: string;
  amount: string;
  description: string;
}

export interface ExistingTx extends IncomingRow {
  id: string;
  /** De onde veio (mesmo arquivo/conta = mesma fonte). Dias são comparados por fonte. */
  source: string;
}

export interface CrossMatch {
  existingId: string;
  /** true: o dia inteiro bate, a linha não entra. false: só o valor bate, o usuário decide. */
  confident: boolean;
}

function words(s: string): Set<string> {
  return new Set(
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3),
  );
}

function similarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const w of a) if (b.has(w)) common++;
  return common / (a.size + b.size - common);
}

type In = { i: number; amount: Decimal; words: Set<string> };
type Ex = { id: string; amount: Decimal; words: Set<string> };

/** Pares de valor idêntico, um para um; com várias opções, a descrição mais parecida. */
function pairByAmount(ins: In[], exs: Ex[]): Map<number, Ex> {
  const pairs: { a: In; b: Ex; s: number }[] = [];
  for (const a of ins)
    for (const b of exs) if (a.amount.eq(b.amount)) pairs.push({ a, b, s: similarity(a.words, b.words) });
  pairs.sort((x, y) => y.s - x.s || x.a.i - y.a.i);
  const out = new Map<number, Ex>();
  const usedEx = new Set<string>();
  for (const { a, b } of pairs) {
    if (out.has(a.i) || usedEx.has(b.id)) continue;
    out.set(a.i, b);
    usedEx.add(b.id);
  }
  return out;
}

const total = (xs: { amount: Decimal }[]) => xs.reduce((s, x) => s.plus(x.amount), new Decimal(0));

/** O dia que chega e o dia já gravado de uma fonte são o mesmo dinheiro? */
export function sameDay(ins: { amount: Decimal }[], exs: { amount: Decimal }[], paired: number): boolean {
  if (!ins.length || !exs.length) return false;
  const sum = total(ins);
  if (!sum.eq(total(exs))) return false;
  if (paired < Math.ceil(Math.max(ins.length, exs.length) / 2)) return false;
  if (sum.isZero() && !(paired === ins.length && paired === exs.length)) return false;
  return true;
}

/** Primeiro e último dia (yyyy-mm-dd) que uma fonte cobre. */
export interface Coverage {
  first: string;
  last: string;
}

/** Subconjunto (2 ou 3 itens, mesmo sinal do alvo) que soma exatamente `target`. */
function findSubset<T extends { amount: Decimal }>(pool: T[], target: Decimal): T[] | null {
  const same = pool.filter((p) => !p.amount.isZero() && p.amount.isNegative() === target.isNegative());
  for (let x = 0; x < same.length; x++)
    for (let y = x + 1; y < same.length; y++) {
      if (same[x].amount.plus(same[y].amount).eq(target)) return [same[x], same[y]];
      for (let z = y + 1; z < same.length; z++)
        if (same[x].amount.plus(same[y].amount).plus(same[z].amount).eq(target)) return [same[x], same[y], same[z]];
    }
  return null;
}

/**
 * Dia de borda: o primeiro ou o último que uma fonte cobre. Só ele pode estar pela
 * metade (extrato baixado às 17h; banco sincronizado às 10h), então só nele vale casar
 * quando um lado tem MENOS linhas que o outro: cada linha do lado menor precisa ter par
 * de valor idêntico, ou (a outra fonte divide o que esta junta) 2–3 linhas sem par do
 * outro lado somando exatamente o valor dela. Com uma linha só no lado menor, só par
 * exato com uma palavra em comum na descrição: um Pix de R$ 50 da conta não pode sumir
 * por causa de uma compra de R$ 50 no cartão do mesmo banco.
 *
 * Devolve, para cada linha que chega, a já gravada que ela é (ou null se não fecha).
 */
function partialDay(ins: In[], exs: Ex[], pairs: Map<number, Ex>, smallerIsExisting: boolean): Map<number, Ex> | null {
  const smaller = smallerIsExisting ? exs.length : ins.length;
  if (!smaller) return null;
  if (smaller === 1) {
    if (pairs.size !== 1) return null;
    const [[i, b]] = [...pairs];
    return similarity(ins.find((a) => a.i === i)!.words, b.words) > 0 ? pairs : null;
  }
  const out = new Map(pairs);
  const pairedEx = new Set([...pairs.values()].map((b) => b.id));
  let spareIn = ins.filter((a) => !pairs.has(a.i));
  let spareEx = exs.filter((b) => !pairedEx.has(b.id));
  if (smallerIsExisting) {
    for (const b of spareEx) {
      const parts = findSubset(spareIn, b.amount);
      if (!parts) return null;
      for (const p of parts) out.set(p.i, b);
      spareIn = spareIn.filter((a) => !parts.includes(a));
    }
  } else {
    for (const a of spareIn) {
      const parts = findSubset(spareEx, a.amount);
      if (!parts) return null;
      out.set(a.i, parts[0]);
      spareEx = spareEx.filter((b) => !parts.includes(b));
    }
  }
  return out;
}

const isEdge = (day: string, c?: Coverage) => Boolean(c && (day === c.first || day === c.last));

/**
 * Para cada linha que chega, a transação de OUTRA fonte que já a representa (ou null).
 * `existing` deve vir filtrado: mesmo usuário e banco, fora da linhagem desta importação.
 * `coverage`: o período de quem chega e de cada fonte gravada, para os dias de borda.
 */
export function matchAcrossSources(
  incoming: IncomingRow[],
  existing: ExistingTx[],
  coverage: { incoming?: Coverage; sources?: Map<string, Coverage> } = {},
): (CrossMatch | null)[] {
  const out: (CrossMatch | null)[] = incoming.map(() => null);
  const key = (r: IncomingRow) => `${r.day}|${r.currency}`;

  const groupsIn = new Map<string, In[]>();
  incoming.forEach((r, i) => {
    const g = groupsIn.get(key(r)) ?? [];
    g.push({ i, amount: new Decimal(r.amount), words: words(r.description) });
    groupsIn.set(key(r), g);
  });
  const groupsEx = new Map<string, Map<string, Ex[]>>();
  for (const e of existing) {
    const bySource = groupsEx.get(key(e)) ?? new Map<string, Ex[]>();
    const g = bySource.get(e.source) ?? [];
    g.push({ id: e.id, amount: new Decimal(e.amount), words: words(e.description) });
    bySource.set(e.source, g);
    groupsEx.set(key(e), bySource);
  }

  for (const [k, ins] of groupsIn) {
    const sources = groupsEx.get(k);
    if (!sources) continue;
    const day = k.slice(0, 10);
    const candidates = [...sources].map(([source, exs]) => ({ source, exs, pairs: pairByAmount(ins, exs) }));
    candidates.sort((x, y) => y.pairs.size - x.pairs.size);

    // Dia inteiro igual ao de uma fonte: nenhuma linha entra. As sem par de valor (o
    // outro lado juntou ou dividiu) apontam para a linha sem par mais parecida.
    const same = candidates.find((c) => sameDay(ins, c.exs, c.pairs.size));
    if (same) {
      const pairedIds = new Set([...same.pairs.values()].map((b) => b.id));
      const spare = same.exs.filter((b) => !pairedIds.has(b.id));
      for (const a of ins) {
        const b =
          same.pairs.get(a.i) ??
          [...(spare.length ? spare : same.exs)].sort(
            (x, y) => similarity(a.words, y.words) - similarity(a.words, x.words),
          )[0];
        out[a.i] = { existingId: b.id, confident: true };
      }
      continue;
    }

    // Dia de borda pela metade: o lado menor inteiro tem par. Os pares não entram; o
    // que só o lado maior tem (o que aconteceu depois das 17h) entra como novo.
    let partial: Map<number, Ex> | null = null;
    for (const c of candidates) {
      if (isEdge(day, coverage.sources?.get(c.source)) && c.exs.length <= ins.length)
        partial = partialDay(ins, c.exs, c.pairs, true);
      if (!partial && isEdge(day, coverage.incoming) && ins.length <= c.exs.length)
        partial = partialDay(ins, c.exs, c.pairs, false);
      if (partial) break;
    }
    if (partial) {
      for (const [i, b] of partial) out[i] = { existingId: b.id, confident: true };
    }

    // Dia que não fecha: só os pares de valor idêntico, como "possível".
    for (const c of candidates) {
      for (const [i, b] of c.pairs) if (!out[i]) out[i] = { existingId: b.id, confident: false };
    }
  }
  return out;
}

/**
 * "Possível repetida" ainda sem resposta: só o valor bateu com uma transação de outra
 * fonte e o usuário não disse se é a mesma. Confirmar não pode decidir por ele (entrar
 * duplica o dinheiro; ficar de fora perde uma compra real), então a confirmação espera.
 * Editar categoria ou responsável não responde à pergunta.
 */
export function isUndecidedDuplicate(row: {
  duplicateOfId: string | null;
  match: string;
  needsReview: boolean;
}): boolean {
  return Boolean(row.duplicateOfId) && row.match === "NEW" && row.needsReview;
}

/** "“Compra de Renda Variável”, do banco conectado" — como a revisão mostra a outra transação. */
export function describeOther(t: {
  description: string;
  upload: { filename: string; detectedFormat: string | null } | null;
}): string {
  const desc = t.description.length > 80 ? `${t.description.slice(0, 79)}…` : t.description;
  const from = !t.upload
    ? "lançada fora de uma importação"
    : SYNC_FORMATS.has(t.upload.detectedFormat ?? "")
      ? "do banco conectado"
      : `de ${t.upload.filename}`;
  return `“${desc}”, ${from}`;
}

export const duplicateReason = (other: string, confident: boolean) =>
  confident ? `Já está em Transações: ${other}` : `Pode já estar em Transações: ${other}`;
