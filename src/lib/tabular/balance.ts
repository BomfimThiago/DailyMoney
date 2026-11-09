import { Decimal } from "@/lib/money";

// Conferência pelo saldo corrido do extrato, independente da ordem das linhas:
// o saldo ANTES de cada transação (saldo − valor, considerando a tarifa) tem que
// ser o saldo de alguma outra linha. Funciona com o extrato em qualquer ordem e
// com mais de uma conta no mesmo arquivo (cada uma com sua série de saldos).
//
// - Linha cujo saldo anterior não aparece em lugar nenhum → revisão ("saldo não
//   confere"): valor lido errado ou transação faltando antes dela.
// - `fixSigns` (PDF lido por IA): se o saldo só fecha com o sinal OPOSTO, o sinal
//   que a IA deu está errado — o saldo decide, não o modelo. Muitos extratos (ex.:
//   Revolut) mostram valores sem sinal em colunas "saída"/"entrada", que se perdem
//   quando o PDF vira texto.

export interface BalanceRow {
  date: Date;
  baseAmount: string;
  feeAmount: string;
  baseCurrency?: string;
  balance?: string | null;
  needsReview?: boolean;
  reviewReason?: string | null;
}

export interface BalanceCheck<T> {
  /** Linhas cujo sinal foi invertido porque só assim o saldo fecha. */
  flipped: T[];
  /** Linhas marcadas para revisão porque o saldo não fecha de jeito nenhum. */
  flagged: T[];
}

const MIN_ROWS = 3; // menos que isso não dá sinal suficiente

export function checkBalances<T extends BalanceRow>(
  rows: T[],
  opts: { fixSigns?: boolean; knownBalances?: string[] } = {},
): BalanceCheck<T> {
  const out: BalanceCheck<T> = { flipped: [], flagged: [] };
  const withBal = rows.filter((r) => r.balance != null && r.balance !== "");
  if (withBal.length < MIN_ROWS) return out;

  // `knownBalances`: saldos que existem no documento mesmo sem linha correspondente
  // (ex.: linhas do PDF que a IA deixou de fora).
  const known = new Set(
    [...withBal.map((r) => r.balance!), ...(opts.knownBalances ?? [])].map((b) => new Decimal(b).toFixed(2)),
  );
  const priors = (r: T) => {
    const bal = new Decimal(r.balance!);
    const amt = new Decimal(r.baseAmount);
    const fee = new Decimal(r.feeAmount || 0);
    return [bal.minus(amt), bal.minus(amt).plus(fee), bal.minus(amt).minus(fee)].map((c) => c.toFixed(2));
  };
  const closes = (r: T) => priors(r).some((c) => known.has(c));
  const bal2 = (r: T) => new Decimal(r.balance!).toFixed(2);

  // 1. Sinal: fecha só com o sinal oposto → o sinal está errado (PDF: inverte; CSV: marca).
  //    O saldo que "fecha" com o sinal trocado não pode ser o da linha SEGUINTE (a que
  //    parte do saldo desta): com dois valores iguais em sequência (−200, −200) isso
  //    sempre acontece e não diz nada sobre o sinal.
  const unexplained: T[] = [];
  for (const r of withBal) {
    if (new Decimal(r.baseAmount).isZero() || closes(r)) continue;
    const next = new Set(withBal.filter((s) => s !== r && priors(s).includes(bal2(r))).map(bal2));
    const negated = { ...r, baseAmount: new Decimal(r.baseAmount).negated().toFixed(4) };
    if (priors(negated).some((c) => known.has(c) && !next.has(c))) {
      if (opts.fixSigns) {
        r.baseAmount = negated.baseAmount;
        out.flipped.push(r);
      } else {
        flag(r);
      }
      continue;
    }
    unexplained.push(r);
  }

  // 2. Linhas cujo saldo anterior não aparece: o início de cada série de saldos é
  //    legítimo (o saldo inicial não é uma linha), um "buraco" no meio de uma série não.
  //    Séries = linhas ligadas pelo saldo (saldo anterior de uma = saldo de outra). Uma
  //    série que começa depois que outra da mesma moeda terminou pode ser a continuação
  //    dela (valor lido errado ou transação faltando): marca. Se não, é o começo do
  //    extrato ou outra conta correndo em paralelo (ex.: Revolut com conta e poupança).
  if (unexplained.length) {
    const parent = new Map<T, T>(withBal.map((r) => [r, r]));
    const find = (r: T): T => {
      while (parent.get(r) !== r) r = parent.get(r)!;
      return r;
    };
    const byBalance = new Map<string, T[]>();
    for (const r of withBal) {
      const k = new Decimal(r.balance!).toFixed(2);
      byBalance.set(k, [...(byBalance.get(k) ?? []), r]);
    }
    for (const r of withBal) {
      for (const k of priors(r))
        for (const prev of byBalance.get(k) ?? []) if (prev !== r) parent.set(find(r), find(prev));
    }
    // Fim de cada série: linha cujo saldo nenhuma outra usa como saldo anterior. Datas
    // dentro de uma série nem sempre seguem o saldo (Revolut usa a data de início da
    // compra), então compara-se o começo de uma com o FIM da outra, não mín./máx.
    const consumed = new Set(withBal.flatMap((s) => priors(s).filter((p) => p !== bal2(s))));
    const ends = new Map<T, T[]>();
    for (const r of withBal) {
      if (consumed.has(bal2(r))) continue;
      const root = find(r);
      ends.set(root, [...(ends.get(root) ?? []), r]);
    }
    const startOf = new Map<T, T>(); // série → sua linha inexplicada mais antiga
    for (const r of unexplained) {
      const root = find(r);
      const first = startOf.get(root);
      if (!first || r.date < first.date) startOf.set(root, r);
    }
    for (const r of unexplained) {
      const root = find(r);
      const continuesAnother = [...ends.entries()].some(
        ([other, es]) =>
          other !== root &&
          es.some((e) => (e.baseCurrency ?? "") === (r.baseCurrency ?? "") && e.date.getTime() <= r.date.getTime()),
      );
      if (startOf.get(root) === r && !continuesAnother) continue;
      flag(r);
    }
  }
  return out;

  function flag(r: T) {
    r.needsReview = true;
    r.reviewReason = "saldo não confere";
    out.flagged.push(r);
  }
}
