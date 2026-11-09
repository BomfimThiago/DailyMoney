/**
 * Mês financeiro: o "mês" do app pode começar num dia que não é o 1º (o dia do salário).
 * É uma configuração da conta (`User.monthStartDay`, 1–28) e vale para todas as telas.
 *
 * Nome do período (como no Toshl): o mês que tem mais dias nele. Começando até o dia 15,
 * o período leva o nome do mês em que começa (15/mai–14/jun = maio); a partir do 16, o do
 * mês em que termina (27/out–26/nov = novembro). Dia fixo, sem ajuste de fim de semana.
 *
 * Tudo aqui é aritmética de calendário em UTC sobre "AAAA-MM" e "AAAA-MM-DD" (as datas das
 * transações são o dia à meia-noite UTC), sem fuso: o mesmo resultado no servidor e na tela.
 */

export const MONTH_START_MIN = 1;
/** Até 28: o dia existe em todo mês, e todo período tem o mesmo dia de início. */
export const MONTH_START_MAX = 28;
/** A partir deste dia de início, o período leva o nome do mês em que termina. */
export const NAMED_BY_END_FROM = 16;

const pad = (n: number) => String(n).padStart(2, "0");

function parseKey(key: string): { y: number; m: number } {
  const [y, m] = key.split("-").map(Number);
  return { y, m };
}

/** "AAAA-MM" deslocado de `n` meses. */
export function shiftKey(key: string, n: number): string {
  const { y, m } = parseKey(key);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`;
}

function iso(y: number, m: number, d: number): string {
  const t = new Date(Date.UTC(y, m - 1, d));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Garante um dia de início válido (o que vier fora de 1–28 vira 1: o mês do calendário). */
export function normalizeStartDay(day: number | null | undefined): number {
  return Number.isInteger(day) && day! >= MONTH_START_MIN && day! <= MONTH_START_MAX ? day! : 1;
}

/** Em quantos meses o início do período fica antes do mês que dá nome a ele (0 ou -1). */
function startOffset(startDay: number): number {
  return startDay >= NAMED_BY_END_FROM ? -1 : 0;
}

/** O período (pelo nome, "AAAA-MM") em que cai um dia "AAAA-MM-DD". */
export function periodKeyOf(date: string, startDay: number): string {
  const sd = normalizeStartDay(startDay);
  const key = date.slice(0, 7);
  const day = Number(date.slice(8, 10));
  // O mês do calendário do dia é o mês do início do período se o dia já passou do início.
  const startMonth = day >= sd ? key : shiftKey(key, -1);
  return shiftKey(startMonth, -startOffset(sd));
}

export interface PeriodBounds {
  /** Primeiro dia, "AAAA-MM-DD". */
  start: string;
  /** Último dia (inclusive), "AAAA-MM-DD". */
  end: string;
  /** Quantos dias o período tem. */
  days: number;
}

/** Primeiro e último dia do período que se chama `key` ("AAAA-MM"). */
export function periodBounds(key: string, startDay: number): PeriodBounds {
  const sd = normalizeStartDay(startDay);
  const s = parseKey(shiftKey(key, startOffset(sd)));
  const start = iso(s.y, s.m, sd);
  const end = iso(s.y, s.m + 1, sd - 1);
  const days = Math.round((Date.UTC(s.y, s.m, sd) - Date.UTC(s.y, s.m - 1, sd)) / 86_400_000);
  return { start, end, days };
}

/** O período no formato de filtro da API (`to` inclui o último dia inteiro). */
export function periodRange(key: string, startDay: number): { from: string; to: string } {
  const b = periodBounds(key, startDay);
  return { from: b.start, to: `${b.end}T23:59:59` };
}

/** Cada dia do período, em ordem ("AAAA-MM-DD"). */
export function periodDates(key: string, startDay: number): string[] {
  const b = periodBounds(key, startDay);
  const [y, m, d] = b.start.split("-").map(Number);
  return Array.from({ length: b.days }, (_, i) => iso(y, m, d + i));
}

/** Dias entre dois "AAAA-MM-DD" (b − a). */
export function daysBetween(a: string, b: string): number {
  const t = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  return Math.round((t(b) - t(a)) / 86_400_000);
}

/** "AAAA-MM-DD" do dia local de `d` (o "hoje" de quem está olhando). */
export function localIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const MONTH_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Dia do mês de "AAAA-MM-DD" (27). */
export function dayOfMonth(date: string): number {
  return Number(date.slice(8, 10));
}

/** "27 out" de "AAAA-MM-DD". */
export function shortDate(date: string): string {
  return `${dayOfMonth(date)} ${MONTH_SHORT[Number(date.slice(5, 7)) - 1]}`;
}

/** Dia da semana (0 = domingo) de "AAAA-MM-DD". */
export function weekdayOf(date: string): number {
  return new Date(`${date.slice(0, 10)}T00:00:00.000Z`).getUTCDay();
}

/** "27 out – 26 nov" quando o mês não começa no dia 1; senão nada (o nome do mês já diz). */
export function periodCaption(key: string, startDay: number | undefined): string | undefined {
  if (!startDay || normalizeStartDay(startDay) === 1) return undefined;
  const b = periodBounds(key, startDay);
  return `${shortDate(b.start)} – ${shortDate(b.end)}`;
}
