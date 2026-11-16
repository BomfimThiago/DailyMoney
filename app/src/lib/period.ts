import { addDays, dayMonth, daysBetween, monthLabel, shiftMonth } from './format';

// The app's month may start on a day other than the 1st (the salary day). The family
// chooses it (1–28: a day every month has). A period is named after the month holding
// most of its days: starting up to the 15th, the month it starts in (15 May–14 Jun is
// May); from the 16th on, the month it ends in (27 Oct–26 Nov is November). Same rule as
// the backend (app/transactions/services/months.py) and the old Daily Money.

export const MONTH_START_MAX = 28;
const NAMED_BY_END_FROM = 16;

const pad = (n: number) => String(n).padStart(2, '0');

export function normalizeStartDay(day: number | null | undefined): number {
  return Number.isInteger(day) && day! >= 1 && day! <= MONTH_START_MAX ? day! : 1;
}

// Months the period starts before the month it is named after (0 or -1).
function startOffset(startDay: number): number {
  return startDay >= NAMED_BY_END_FROM ? -1 : 0;
}

// The period ("YYYY-MM") a day ("YYYY-MM-DD") falls in.
export function periodOf(date: string, startDay: number): string {
  const sd = normalizeStartDay(startDay);
  const key = date.slice(0, 7);
  const startsIn = Number(date.slice(8, 10)) >= sd ? key : shiftMonth(key, -1);
  return shiftMonth(startsIn, -startOffset(sd));
}

// First and last day (inclusive) of the period named `month`.
export function periodBounds(month: string, startDay: number): { start: string; end: string } {
  const sd = normalizeStartDay(startDay);
  const startMonth = shiftMonth(month, startOffset(sd));
  const nextStart = `${shiftMonth(startMonth, 1)}-${pad(sd)}`;
  return { start: `${startMonth}-${pad(sd)}`, end: addDays(nextStart, -1) };
}

// "YYYY-MM-DD" of the local day (today for whoever is looking).
export function localIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function currentPeriod(startDay: number, today = new Date()): string {
  return periodOf(localIso(today), startDay);
}

// "27 out – 26 nov" when the month does not start on the 1st; nothing otherwise (the
// month's name already says it).
export function periodCaption(month: string, startDay: number): string | null {
  if (normalizeStartDay(startDay) === 1) return null;
  const { start, end } = periodBounds(month, startDay);
  return `${dayMonth(start)} – ${dayMonth(end)}`;
}

// "Hoje é novembro: de 27 out a 26 nov." for the setting's preview.
export function periodPreview(startDay: number, today = new Date()): string {
  const month = currentPeriod(startDay, today);
  const { start, end } = periodBounds(month, startDay);
  const name = monthLabel(month).split(' ')[0].toLowerCase();
  return `Hoje é ${name}: de ${dayMonth(start)} a ${dayMonth(end)}.`;
}

// Days of the period that have already happened: up to today in the current one, all of
// a past one, none of a future one.
export function daysElapsed(start: string, days: number, today = new Date()): number {
  return Math.max(0, Math.min(daysBetween(start, localIso(today)) + 1, days));
}
