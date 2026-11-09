// Nome do banco que a IA leu do documento → nome curto e estável. O banco faz parte da
// identidade da transação (dedupeHash), então "Revolut Bank UAB Sucursal En España" numa
// leitura e "Revolut" na outra não podem virar dois bancos. "null"/"desconhecido" (a IA
// às vezes devolve o texto em vez de null) viram vazio: o usuário informa o banco.

const KNOWN: [RegExp, string][] = [
  [/revolut/i, "Revolut"],
  [/\bwise\b|transferwise/i, "Wise"],
  [/caixa\s*bank|\bla\s*caixa\b/i, "CaixaBank"],
  [/\bbanco\s+inter\b|\binter\s*&?\s*co\b/i, "Banco Inter"],
  [/nubank|nu\s+pagamentos/i, "Nubank"],
  [/\bbbva\b/i, "BBVA"],
  [/santander/i, "Santander"],
  [/\bitau\b|\bitaú\b/i, "Itaú"],
];

const EMPTY = /^(null|none|n\/?a|undefined|desconhecido|unknown|não identificado|-+)$/i;

export function canonicalBank(raw: string | null | undefined): string | null {
  const name = (raw ?? "").trim();
  if (!name || EMPTY.test(name)) return null;
  for (const [re, short] of KNOWN) if (re.test(name)) return short;
  return name;
}
