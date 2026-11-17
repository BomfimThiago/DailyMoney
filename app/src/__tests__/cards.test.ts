import { describe, expect, it } from '@jest/globals';

import { billMonthName, billStatus, homeBillLine, nextBillLine } from '@/lib/cards';
import type { CardBills } from '@/lib/types';

const card = (o: Partial<CardBills> = {}): CardBills => ({
  account_id: 'a-card',
  account_name: 'Nubank cartão',
  bank: 'Nubank',
  currency: 'BRL',
  bill: { month: '2026-11', total: '450.00', count: 3 },
  next: { month: '2026-12', total: '80.00', count: 1 },
  payments: [],
  paid: '0',
  status: 'open',
  months: ['2026-12', '2026-11'],
  ...o,
});

const nbsp = (s: string | null) => s?.replace(/\s/g, ' ') ?? null;

describe('card bills', () => {
  it('names the bill by its month', () => {
    expect(billMonthName('2026-11')).toBe('novembro');
  });

  it('says whether the bill was paid', () => {
    const paid = card({
      status: 'paid',
      paid: '450.00',
      payments: [{ date: '2026-11-10', amount: '450.00' }],
    });
    expect(billStatus(paid)).toBe('Paga em 10 nov');
    expect(billStatus(card())).toBe('A pagar');
    expect(nbsp(billStatus(card({ paid: '100.00' })))).toBe('A pagar · R$ 100,00 pagos até agora');
    expect(billStatus(card({ status: 'unpaid' }))).toBe('Sem pagamento registrado em novembro');
    expect(nbsp(billStatus(card({ status: 'unpaid', paid: '100.00' })))).toBe(
      'R$ 100,00 pagos no mês',
    );
    expect(billStatus(card({ status: 'empty' }))).toBe('Nenhuma compra nesta fatura');
  });

  it('counts the next bill purchases', () => {
    expect(nextBillLine(card())).toBe('1 compra até agora');
    expect(nextBillLine(card({ next: { month: '2026-12', total: '0', count: 0 } }))).toBe(
      'Nenhuma compra ainda',
    );
  });

  it('sums up the cards for Início', () => {
    expect(nbsp(homeBillLine([card()]))).toBe('Fatura de novembro: R$ 450,00 · a pagar');
    expect(homeBillLine([card(), card({ account_id: 'b' })])).toBe(
      'Faturas de novembro: 2 cartões',
    );
    expect(homeBillLine([card({ status: 'empty' })])).toBeNull();
    expect(homeBillLine([])).toBeNull();
  });
});
