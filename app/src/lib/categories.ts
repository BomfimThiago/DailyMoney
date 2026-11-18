import type { Category } from './types';

// Categorias: what the page groups, checks and says. The colours are data saved with each
// category (the screens only paint a dot with them), so they live here and not in theme.ts.

export type CategoryKind = Category['kind'];

export const KINDS: { value: CategoryKind; label: string }[] = [
  { value: 'expense', label: 'Gastos' },
  { value: 'income', label: 'Entradas' },
  { value: 'transfer', label: 'Movimentações' },
];

// The kind of one category, in the singular (its detail).
export const KIND_CHOICES: { value: CategoryKind; label: string }[] = [
  { value: 'expense', label: 'Gasto' },
  { value: 'income', label: 'Entrada' },
  { value: 'transfer', label: 'Movimentação' },
];

// Under the kind choice: what changing it does to the lines already in the category.
export function kindChangeNote(c: Category): string {
  if (c.kind === 'transfer') {
    return 'As transações desta categoria ficam fora de Gastos e Entradas. Trocar para gasto ou entrada as devolve aos totais.';
  }
  return 'Trocar para movimentação tira desta categoria todas as transações dos totais, inclusive as que já estão nela.';
}

const NOUN: Record<CategoryKind, string> = {
  expense: 'gasto',
  income: 'entrada',
  transfer: 'movimentação',
};

// The default categories' muted tones, plus a few more in the same key.
export const PALETTE = [
  '#5f8f7b',
  '#4f9a9a',
  '#5f9f6b',
  '#6f8fb8',
  '#5a74b8',
  '#8a7fb8',
  '#b86f8f',
  '#c75a5a',
  '#c7795a',
  '#b8a25a',
  '#9a98a6',
  '#8a8799',
] as const;

export function ofKind(categories: Category[], kind: CategoryKind): Category[] {
  return categories.filter((c) => c.kind === kind);
}

export function kindNote(kind: CategoryKind): string {
  return kind === 'transfer'
    ? 'Dinheiro que só muda de lugar: entre contas suas, aplicação e resgate, pagamento de cartão. Fica fora de Gastos e Entradas.'
    : `Categorias de ${NOUN[kind]}. O app aprende a categoria de cada estabelecimento quando você troca a de uma transação.`;
}

export function emptyText(kind: CategoryKind): string {
  return `Nenhuma categoria de ${NOUN[kind]} ainda.`;
}

export function countText(c: Category): string {
  const n = c.transaction_count;
  return n === 0 ? 'Nenhuma transação' : n === 1 ? '1 transação' : `${n} transações`;
}

// Error under the name field, or null when it can be saved.
export function nameError(name: string, all: Category[], id?: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Dê um nome à categoria.';
  if (trimmed.length > 60) return 'Use no máximo 60 letras.';
  const lower = trimmed.toLowerCase();
  if (all.some((c) => c.id !== id && c.name.trim().toLowerCase() === lower)) {
    return 'Já existe uma categoria com esse nome.';
  }
  return null;
}

// The first colour nobody in that kind uses yet, for a new category.
export function freeColor(categories: Category[], kind: CategoryKind): string {
  const used = new Set(ofKind(categories, kind).map((c) => c.color.toLowerCase()));
  return PALETTE.find((p) => !used.has(p)) ?? PALETTE[0];
}

// The palette, with the category's own colour first when it is not one of them.
export function colorChoices(current?: string): string[] {
  const c = current?.toLowerCase();
  return c && !(PALETTE as readonly string[]).includes(c) ? [c, ...PALETTE] : [...PALETTE];
}

export function deleteHint(c: Category): string {
  const lines =
    c.transaction_count === 0
      ? ''
      : ` ${c.transaction_count === 1 ? 'A transação dela fica' : `As ${c.transaction_count} transações dela ficam`} sem categoria.`;
  const rules = c.rule_count ? ' Os estabelecimentos aprendidos para ela são esquecidos.' : '';
  const back = c.is_default ? ' É uma categoria padrão e não volta sozinha.' : '';
  return `${lines}${rules}${back}`.trim() || 'Nenhuma transação usa esta categoria.';
}

// "grupo ahorramas" → "Grupo ahorramas": how the app stored the merchant, made readable.
export function merchantLabel(key: string): string {
  return key ? key[0].toUpperCase() + key.slice(1) : key;
}
