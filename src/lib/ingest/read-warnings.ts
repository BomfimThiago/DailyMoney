// Mensagem dos problemas da leitura, guardada em `Upload.error` e mostrada na importação
// e na revisão. Uma linha por problema (separadas por "\n"): avisos do documento como
// vieram; erros de linha agrupados pela mensagem, com o número da linha no arquivo, para
// o usuário achar no extrato ("…moeda — linhas 2, 3, 4, 5, 6 e mais 29").

export interface ReadError {
  /** < 0: aviso do documento inteiro (ex.: PDF). ≥ 0: índice da linha de dados. */
  rowIndex: number;
  message: string;
}

const SHOWN = 5;

export function summarizeReadErrors(
  errors: ReadError[],
  where: { label: string; plural: string; offset: number } = { label: "linha", plural: "linhas", offset: 2 },
): string | null {
  if (!errors.length) return null;
  const document = errors.filter((e) => e.rowIndex < 0).map((e) => e.message.trim());
  const byMessage = new Map<string, number[]>();
  for (const e of errors) {
    if (e.rowIndex < 0) continue;
    const msg = e.message.trim() || "Erro ao ler a linha";
    byMessage.set(msg, [...(byMessage.get(msg) ?? []), e.rowIndex + where.offset]);
  }
  const rows = [...byMessage].map(([msg, nums]) => {
    const shown = nums.slice(0, SHOWN).join(", ");
    const rest = nums.length - SHOWN;
    const ref =
      nums.length === 1
        ? `${where.label} ${nums[0]}`
        : rest > 0
          ? `${where.plural} ${shown} e mais ${rest}`
          : `${where.plural} ${shown.replace(/, (\d+)$/, " e $1")}`;
    return `${msg} — ${ref}`;
  });
  return [...document, ...rows].join("\n");
}

/** Linhas da mensagem guardada (aceita o formato antigo, com "; "). */
export function readWarningLines(error: string | null | undefined): string[] {
  if (!error) return [];
  return error
    .split(error.includes("\n") ? "\n" : /;\s+/)
    .map((l) => l.trim())
    .filter(Boolean);
}
