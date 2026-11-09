import { createHash } from "crypto";
import { Decimal } from "@/lib/money";

// Deterministic hash to detect the same transaction across overlapping
// statements. Description is normalized (case/spacing) to survive minor noise.
// Scoped by bank so the same transfer seen in two banks' statements isn't merged.
//
// Usa o TIMESTAMP COMPLETO (não só o dia): duas transações reais e distintas no
// mesmo dia, com mesmo valor e descrição (ex.: duas transferências iguais de
// -100 EUR para a mesma pessoa, minutos depois) têm horários diferentes e NÃO
// podem ser fundidas — fundir perde dinheiro (prioridade nº1). A mesma transação
// vista em dois extratos sobrepostos mantém o mesmo timestamp, então o dedupe
// legítimo entre extratos continua funcionando.
export function dedupeHash(input: { bank: string; date: Date; baseAmount: string; description: string }): string {
  const ts = input.date.toISOString();
  // Valor normalizado: "-45.2000" (do leitor) e "-45.2" (Decimal do banco) são o mesmo
  // valor e precisam gerar a mesma chave — antes a revisão e a confirmação geravam
  // chaves diferentes e a revisão nunca reconhecia uma transação já gravada. A forma
  // curta (Decimal.toString) é a que já está gravada nas transações existentes.
  const amount = new Decimal(input.baseAmount).toString();
  const desc = input.description.trim().toLowerCase().replace(/\s+/g, " ");
  return createHash("sha256").update(`${input.bank}|${ts}|${amount}|${desc}`).digest("hex");
}

/**
 * Numera repetições DENTRO do mesmo arquivo: duas transações reais iguais no mesmo dia
 * (PDF não tem horário; ex.: duas transferências de −100 para a mesma pessoa) teriam a
 * mesma chave e uma sumiria. A 1ª ocorrência mantém a chave de sempre; a 2ª, 3ª… ganham
 * o número. Um extrato sobreposto com as mesmas duas transações gera as mesmas chaves,
 * então o dedupe entre extratos continua valendo.
 */
export function occurrenceHashes(hashes: string[]): string[] {
  const seen = new Map<string, number>();
  return hashes.map((h) => {
    const n = (seen.get(h) ?? 0) + 1;
    seen.set(h, n);
    return nthOccurrence(h, n);
  });
}

/** A n-ésima ocorrência de uma impressão digital (a 1ª é ela mesma). */
export function nthOccurrence(hash: string, n: number): string {
  return n === 1 ? hash : createHash("sha256").update(`${hash}#${n}`).digest("hex");
}
