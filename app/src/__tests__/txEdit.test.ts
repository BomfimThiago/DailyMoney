import { describe, expect, it } from '@jest/globals';

import type { Transaction } from '@/lib/types';
import {
  amountText,
  categoriesFor,
  formErrors,
  formOf,
  parseAmount,
  parseDate,
  patchOf,
  withDirection,
} from '@/lib/txEdit';
import { category } from '@/testing/categories';

const tx = (o: Partial<Transaction> = {}): Transaction => ({
  id: 'tx-1',
  date: '2026-11-28',
  description: 'Pão de Açúcar',
  amount: '-1312.4000',
  currency: 'BRL',
  kind: 'regular',
  account_id: 'a',
  account_name: 'Nubank',
  category_id: 'c',
  category_name: 'Mercado',
  member_id: null,
  review: 'approved',
  ...o,
});

describe('txEdit', () => {
  it('fills the form from the line', () => {
    expect(formOf(tx())).toEqual({
      description: 'Pão de Açúcar',
      date: '28/11/2026',
      amount: '1.312,40',
      direction: 'out',
      kind: 'regular',
      categoryId: 'c',
      forMerchant: true,
    });
    expect(formOf(tx({ amount: '50.0000', kind: 'pending' }))).toMatchObject({
      amount: '50,00',
      direction: 'in',
      kind: 'transfer',
    });
    expect(amountText('0.1234')).toBe('0,1234');
  });

  it('reads amounts the way people type them', () => {
    expect(parseAmount('1.312,40')).toBe('1312.40');
    expect(parseAmount('312,4')).toBe('312.4');
    expect(parseAmount('312.40')).toBe('312.40');
    expect(parseAmount('1.234')).toBe('1234');
    expect(parseAmount(' R$ 12 ')).toBe('12');
    expect(parseAmount('007,5')).toBe('7.5');
    for (const bad of ['', 'abc', '0', '0,00', '-5', '1,23456', '1,2,3']) {
      expect(parseAmount(bad)).toBeNull();
    }
  });

  it('reads only real days', () => {
    expect(parseDate('1/2/2026')).toBe('2026-02-01');
    expect(parseDate('29/02/2028')).toBe('2028-02-29');
    for (const bad of ['29/02/2026', '32/01/2026', '2026-01-01', '']) {
      expect(parseDate(bad)).toBeNull();
    }
  });

  it('says what is wrong in Portuguese', () => {
    expect(formErrors(formOf(tx()))).toEqual({});
    expect(formErrors({ ...formOf(tx()), description: ' ', date: 'x', amount: '0' })).toEqual({
      description: 'Escreva uma descrição.',
      date: 'Data inválida (ex.: 28/11/2026).',
      amount: 'Valor inválido (ex.: 312,40).',
    });
  });

  it('sends a new category only for spending or income, and drops one that no longer fits', () => {
    const cats = [
      category({ id: 'c', name: 'Mercado' }),
      category({ id: 'r', name: 'Restaurantes' }),
      category({ id: 's', name: 'Salário', kind: 'income' }),
    ];
    expect(categoriesFor(cats, 'in').map((c) => c.id)).toEqual(['s']);
    const form = { ...formOf(tx()), categoryId: 'r', forMerchant: false };
    expect(patchOf(tx(), form)).toEqual({ category_id: 'r', apply_to_merchant: false });
    expect(patchOf(tx(), { ...form, kind: 'investment' })).toEqual({});
    expect(withDirection(form, 'in', cats).categoryId).toBeNull();
    expect(withDirection(form, 'out', cats).categoryId).toBe('r');
  });

  it('sends only what changed, with the sign from gasto/entrada', () => {
    expect(patchOf(tx(), formOf(tx()))).toEqual({});
    expect(
      patchOf(tx(), {
        ...formOf(tx()),
        description: ' Mercado ',
        date: '01/12/2026',
        amount: '1.312,4',
      }),
    ).toEqual({ description: 'Mercado', date: '2026-12-01' });
    expect(patchOf(tx(), { ...formOf(tx()), direction: 'in' })).toEqual({ amount: '1312.40' });
    expect(patchOf(tx(), { ...formOf(tx()), amount: '20' })).toEqual({ amount: '-20' });
  });
});
