// Linhas de saldo/total do extrato não são transações: "Saldo do dia: -R$ 15,12" (Inter)
// só mostra quanto ficou na conta. Se a IA devolver uma dessas como lançamento, ela vira
// uma despesa ou entrada falsa. Reconhece a descrição que, sem datas, valores e
// pontuação, é só o rótulo de saldo/total.

const FIRST = new Set(["saldo", "total", "balance", "opening", "closing", "resumo", "resumen"]);
const LABEL_WORDS = new Set([
  ...FIRST,
  "do",
  "da",
  "de",
  "del",
  "dos",
  "das",
  "of",
  "em",
  "en",
  "no",
  "na",
  "the",
  "e",
  "y",
  "and",
  "dia",
  "anterior",
  "final",
  "inicial",
  "atual",
  "actual",
  "disponivel",
  "bloqueado",
  "bloqueada",
  "conta",
  "cuenta",
  "account",
  "periodo",
  "mes",
  "day",
  "previous",
  "available",
  "blocked",
  "entradas",
  "saidas",
  "creditos",
  "debitos",
  "ingresos",
  "gastos",
  "liquido",
  "rendimento",
  "por",
  "transacao",
  "valor",
  "end",
  "start",
]);
// Meses por extenso ou abreviados (pt/es/en), como palavra inteira: "Energies" não é "ene".
const MONTHS = new Set(
  "jan fev feb mar abr apr mai may jun jul ago aug set sep out oct nov dez dec dic ene janeiro fevereiro marco abril maio junho julho agosto setembro outubro novembro dezembro enero febrero marzo mayo junio julio septiembre octubre noviembre diciembre january february march april june july august september october november december".split(
    " ",
  ),
);

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export function isBalanceLabel(description: string): boolean {
  const words = fold(description)
    .replace(/r\$|us\$|€|\$|\b(?:eur|brl|usd)\b/g, " ")
    .replace(/[^a-z]+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => w && !MONTHS.has(w));
  // "19 de março de 2026 Saldo do dia": o rótulo começa na 1ª palavra de saldo/total
  const start = words.findIndex((w) => FIRST.has(w));
  return start >= 0 && words.every((w) => LABEL_WORDS.has(w));
}
