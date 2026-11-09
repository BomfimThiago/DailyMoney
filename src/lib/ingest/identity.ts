import { createHash } from "crypto";
import { Decimal } from "@/lib/money";

// Identidade de arquivos e linhas importadas — base da reimportação idempotente:
// enviar o mesmo arquivo de novo atualiza (corrige) o que já foi gravado em vez de
// duplicar, e remove o que um leitor antigo inventou.

/** SHA-256 do conteúdo do arquivo: o "mesmo arquivo" independe do nome. */
export function contentHash(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Chave de cada linha de um CSV/XLSX, a partir do TEXTO BRUTO da linha (não do que o
 * leitor extraiu dela). Assim, se o leitor for corrigido e passar a ler outro valor ou
 * outra data, a linha continua sendo "a mesma" e a transação é atualizada, não duplicada.
 *
 * Linhas idênticas no mesmo arquivo ganham um número de ocorrência (1ª, 2ª…) para não
 * colidirem. Em PDF, só a linha conferida no texto do extrato (`sourceIsStatementLine`,
 * ver pdf-ledger.ts) é estável; o que veio só da IA e fotos devolvem null.
 */
export function sourceKeys(
  rows: { sourceRowRaw?: string | null; sourceIsStatementLine?: boolean }[],
  tabular: boolean,
): (string | null)[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    if (!tabular && !r.sourceIsStatementLine) return null;
    const raw = (r.sourceRowRaw ?? "").trim();
    if (!raw) return null;
    const n = (seen.get(raw) ?? 0) + 1;
    seen.set(raw, n);
    return createHash("sha256").update(`${raw}\u0000${n}`).digest("hex");
  });
}

export interface ComparableRow {
  date: Date;
  description: string;
  baseAmount: Decimal | string;
  baseCurrency: string;
  feeAmount: Decimal | string;
  type: string;
  state: string;
}

/** Campos lidos do arquivo que mudaram (vazio = a linha é igual ao que está gravado). */
export function changedFields(next: ComparableRow, current: ComparableRow): string[] {
  const out: string[] = [];
  if (next.date.getTime() !== current.date.getTime()) out.push("data");
  if (next.description.trim() !== current.description.trim()) out.push("descrição");
  if (!new Decimal(next.baseAmount.toString()).eq(current.baseAmount.toString())) out.push("valor");
  if (next.baseCurrency !== current.baseCurrency) out.push("moeda");
  if (!new Decimal(next.feeAmount.toString()).eq(current.feeAmount.toString())) out.push("tarifa");
  if (next.type !== current.type) out.push("tipo");
  if (next.state !== current.state) out.push("situação");
  return out;
}
