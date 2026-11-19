import { fullDate } from './format';
import type { Category, Transaction, TxKind } from './types';

// Editing a line (like the old app): what the person types and what goes to the API.
// Amounts stay decimal strings end to end; nothing here goes through a float.

export type Direction = 'out' | 'in';
// 'card': paying a credit card bill, the category "Pago de Cartão de Crédito".
export type EditKind = Exclude<TxKind, 'pending'> | 'card';

// The default category's key; the family may rename it, the key stays.
export const CARD_PAYMENT = 'Pago de Cartão de Crédito';

export function cardCategoryOf(all: Category[]): Category | undefined {
  return all.find((c) => c.key === CARD_PAYMENT);
}

export interface TxForm {
  description: string;
  date: string; // DD/MM/AAAA
  amount: string; // 1.234,56 (no sign)
  direction: Direction;
  kind: EditKind;
  categoryId: string | null;
  // Who the line belongs to; null is the household ("Casa").
  memberId: string | null;
  // "Valer também para as próximas deste estabelecimento".
  forMerchant: boolean;
}

export interface TxPatch {
  description?: string;
  date?: string;
  amount?: string;
  category_id?: string;
  apply_to_merchant?: boolean;
  member_id?: string | null;
}

export type FormErrors = Partial<Record<'description' | 'date' | 'amount', string>>;

export function formOf(t: Transaction, cardId?: string): TxForm {
  const negative = t.amount.trim().startsWith('-');
  const card = cardId !== undefined && t.category_id === cardId;
  return {
    description: t.description,
    date: fullDate(t.date),
    amount: amountText(negative ? t.amount.trim().slice(1) : t.amount.trim()),
    direction: negative ? 'out' : 'in',
    kind: card ? 'card' : t.kind === 'pending' ? 'transfer' : t.kind,
    categoryId: t.category_id,
    memberId: t.member_id ?? null,
    forMerchant: true,
  };
}

// The categories that fit money going out (gastos) or coming in (entradas).
export function categoriesFor(all: Category[], direction: Direction): Category[] {
  const kind = direction === 'out' ? 'expense' : 'income';
  return all.filter((c) => c.kind === kind);
}

// Turning spending into income (or back) drops a category that no longer fits.
export function withDirection(form: TxForm, direction: Direction, all: Category[]): TxForm {
  const fits = categoriesFor(all, direction).some((c) => c.id === form.categoryId);
  return { ...form, direction, categoryId: fits ? form.categoryId : null };
}

// "312.4000" → "312,40"; more than two cents are kept as they are.
export function amountText(plain: string): string {
  const [whole, cents = ''] = plain.split('.');
  const trimmed = cents.replace(/0+$/, '').padEnd(2, '0');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${grouped},${trimmed}`;
}

// "1.234,56", "1234,56" or "1234.56" → "1234.56"; null when it is not a positive amount.
export function parseAmount(text: string): string | null {
  const clean = text.replace(/\s|R\$|€|US\$|\$/g, '');
  let whole: string;
  let cents = '';
  const comma = clean.lastIndexOf(',');
  if (comma >= 0) {
    whole = clean.slice(0, comma).replace(/\./g, '');
    cents = clean.slice(comma + 1);
  } else if (/^\d{1,3}(\.\d{3})+$/.test(clean)) {
    whole = clean.replace(/\./g, ''); // 1.234 is a thousand, not one and a bit
  } else {
    [whole, cents = ''] = clean.split('.');
  }
  if (!/^\d+$/.test(whole) || !/^\d{0,4}$/.test(cents)) {
    return null;
  }
  const normalized = `${whole.replace(/^0+(?=\d)/, '')}${cents ? `.${cents}` : ''}`;
  return /[1-9]/.test(normalized) ? normalized : null;
}

// "28/11/2026" → "2026-11-28"; null when the day does not exist.
export function parseDate(text: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text.trim());
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const day = new Date(Date.UTC(y, mo - 1, d));
  if (day.getUTCFullYear() !== y || day.getUTCMonth() !== mo - 1 || day.getUTCDate() !== d) {
    return null;
  }
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function formErrors(form: TxForm): FormErrors {
  const errors: FormErrors = {};
  if (!form.description.trim()) errors.description = 'Escreva uma descrição.';
  if (!parseDate(form.date)) errors.date = 'Data inválida (ex.: 28/11/2026).';
  if (!parseAmount(form.amount)) errors.amount = 'Valor inválido (ex.: 312,40).';
  return errors;
}

// Only what changed. Call it with a form that has no errors.
export function patchOf(t: Transaction, form: TxForm, cardId?: string): TxPatch {
  const patch: TxPatch = {};
  const description = form.description.trim();
  if (description !== t.description) patch.description = description;
  const date = parseDate(form.date);
  if (date && date !== t.date) patch.date = date;
  const plain = parseAmount(form.amount);
  if (plain) {
    const signed = form.direction === 'out' ? `-${plain}` : plain;
    if (!sameAmount(signed, t.amount)) patch.amount = signed;
  }
  // Only spending and income have a category; the other kinds set their own.
  if (form.kind === 'regular' && form.categoryId && form.categoryId !== t.category_id) {
    patch.category_id = form.categoryId;
    patch.apply_to_merchant = form.forMerchant;
  }
  // The server decides if it counts: only when the card isn't in the app.
  if (form.kind === 'card' && cardId && cardId !== t.category_id) {
    patch.category_id = cardId;
    patch.apply_to_merchant = false;
  }
  if (form.memberId !== (t.member_id ?? null)) patch.member_id = form.memberId;
  return patch;
}

// Compares decimal strings without floats: "-312.4" equals "-312.4000".
function sameAmount(a: string, b: string): boolean {
  const norm = (s: string) => {
    const neg = s.trim().startsWith('-');
    const [w, c = ''] = s.trim().replace(/^[-+]/, '').split('.');
    return `${neg ? '-' : ''}${w.replace(/^0+(?=\d)/, '')}.${c.replace(/0+$/, '')}`;
  };
  return norm(a) === norm(b);
}

// Saying what the line was goes to its own call, except for a card payment (its category
// says it) and for a gasto/entrada given a category (the category already says it, and
// the other call would pick a suggested category over the chosen one).
export function needsKindCall(
  form: TxForm,
  base: TxForm,
  patch: TxPatch,
): form is TxForm & {
  kind: Exclude<EditKind, 'card'>;
} {
  if (form.kind === base.kind || form.kind === 'card') return false;
  return !(form.kind === 'regular' && patch.category_id);
}

// Leaving "Pago de cartão" drops its category, so a new one has to be picked.
export function withKind(form: TxForm, kind: EditKind, cardId?: string): TxForm {
  const keep = kind === 'card' || form.categoryId !== cardId;
  return { ...form, kind, categoryId: keep ? form.categoryId : null };
}
