import { parseDelimited, detectDelimiter, headerFingerprint } from "@/lib/tabular/detect";
import { heuristicInferProfile } from "@/lib/tabular/infer";
import { applyProfile, type ApplyResult } from "@/lib/tabular/apply";
import type { FormatProfileSpec } from "@/lib/tabular/types";
import { knownLayout } from "@/lib/tabular/known-layouts";

export interface ParseTabularOptions {
  // Reuse a stored profile instead of inferring. If omitted, heuristic inference runs.
  profile?: FormatProfileSpec;
}

export interface ParseTabularResult {
  headers: string[];
  fingerprint: string;
  delimiter: string;
  profile: FormatProfileSpec;
  applied: ApplyResult;
  sampleRows: string[][];
  /** Banco reconhecido pelo cabeçalho (ver known-layouts.ts); null se o cabeçalho não diz. */
  bank: string | null;
}

// Full deterministic tabular pipeline: detect → (infer|reuse) profile → apply.
export function parseTabular(text: string, opts: ParseTabularOptions = {}): ParseTabularResult {
  const delimiter = detectDelimiter(text);
  const grid = parseDelimited(text, delimiter);
  if (grid.length === 1) {
    // Só o cabeçalho (Wise exporta assim um período sem movimento): dizer isso, não "erro".
    throw new Error("Este extrato não tem nenhuma transação: o arquivo só tem o cabeçalho. Nada para importar.");
  }
  if (grid.length < 1) {
    throw new Error("Arquivo tabular vazio ou sem linhas de dados");
  }
  const [headers, ...dataRows] = grid;
  const fingerprint = headerFingerprint(headers, delimiter);
  const sampleRows = dataRows.slice(0, 5);

  const known = knownLayout(headers);
  const base: FormatProfileSpec = opts.profile
    ? { ...opts.profile, delimiter }
    : { ...heuristicInferProfile(headers, sampleRows), delimiter };
  // Arquivo sem moeda (Nubank): a moeda do banco reconhecido pelo cabeçalho.
  const profile = !base.defaultCurrency && known?.currency ? { ...base, defaultCurrency: known.currency } : base;

  const applied = applyProfile(profile, dataRows, { isInternal: known?.isInternal ?? undefined });
  return { headers, fingerprint, delimiter, profile, applied, sampleRows, bank: known?.bank ?? null };
}
