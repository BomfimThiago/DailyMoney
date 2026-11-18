import { describe, expect, it } from '@jest/globals';

import {
  colorChoices,
  countText,
  deleteHint,
  freeColor,
  kindChangeNote,
  merchantLabel,
  nameError,
  ofKind,
  PALETTE,
} from '@/lib/categories';
import { category } from '@/testing/categories';

const mercado = category({ id: 'a', name: 'Mercado', color: PALETTE[0] });
const salario = category({ id: 'b', name: 'Salário', kind: 'income', color: PALETTE[1] });

describe('categories', () => {
  it('groups by kind', () => {
    expect(ofKind([mercado, salario], 'income')).toEqual([salario]);
  });

  it('says how many lines use a category', () => {
    expect(countText(category({ transaction_count: 0 }))).toBe('Nenhuma transação');
    expect(countText(category({ transaction_count: 1 }))).toBe('1 transação');
    expect(countText(category({ transaction_count: 12 }))).toBe('12 transações');
  });

  it('refuses an empty, too long or repeated name, ignoring case and spaces', () => {
    expect(nameError('  ', [mercado])).toBe('Dê um nome à categoria.');
    expect(nameError('x'.repeat(61), [mercado])).toBe('Use no máximo 60 letras.');
    expect(nameError(' mercado ', [mercado])).toBe('Já existe uma categoria com esse nome.');
    expect(nameError('Mercado', [mercado], 'a')).toBeNull();
    expect(nameError('Pets', [mercado])).toBeNull();
  });

  it('suggests the first colour that kind does not use yet', () => {
    expect(freeColor([mercado, salario], 'expense')).toBe(PALETTE[1]);
    expect(freeColor([], 'expense')).toBe(PALETTE[0]);
  });

  it('keeps a colour outside the palette as the first choice', () => {
    expect(colorChoices('#ABCDEF')[0]).toBe('#abcdef');
    expect(colorChoices(PALETTE[2])).toHaveLength(PALETTE.length);
  });

  it('tells what deleting does', () => {
    expect(deleteHint(category({ transaction_count: 3, rule_count: 1, is_default: false }))).toBe(
      'As 3 transações dela ficam sem categoria. Os estabelecimentos aprendidos para ela são esquecidos.',
    );
    expect(deleteHint(category({ transaction_count: 1 }))).toBe(
      'A transação dela fica sem categoria. É uma categoria padrão e não volta sozinha.',
    );
    expect(deleteHint(category({ is_default: false }))).toBe(
      'Nenhuma transação usa esta categoria.',
    );
  });

  it('makes the learned merchant readable', () => {
    expect(merchantLabel('grupo ahorramas')).toBe('Grupo ahorramas');
    expect(merchantLabel('')).toBe('');
  });
});

describe('kindChangeNote', () => {
  it('says what changing the kind does to the lines already there', () => {
    expect(kindChangeNote(category({ kind: 'expense' }))).toMatch(/^Trocar para movimentação/);
    expect(kindChangeNote(category({ kind: 'transfer' }))).toMatch(/devolve aos totais/);
  });
});
