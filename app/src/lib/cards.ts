import { dayMonth, money, monthLabel } from './format';
import type { CardBills } from './types';

// "novembro": the bill's month, as people say it.
export function billMonthName(month: string): string {
  return monthLabel(month).split(' ')[0].toLowerCase();
}

// What happened to the bill: paid (and when), still to pay, or not paid in its month.
export function billStatus(card: CardBills): string {
  const last = card.payments.at(-1);
  switch (card.status) {
    case 'paid':
      return last ? `Paga em ${dayMonth(last.date)}` : 'Paga';
    case 'open':
      return Number(card.paid) > 0
        ? `A pagar · ${money(card.paid, card.currency)} pagos até agora`
        : 'A pagar';
    case 'unpaid':
      return Number(card.paid) > 0
        ? `${money(card.paid, card.currency)} pagos no mês`
        : `Sem pagamento registrado em ${billMonthName(card.bill.month)}`;
    default:
      return 'Nenhuma compra nesta fatura';
  }
}

export function purchases(count: number): string {
  return count === 1 ? '1 compra' : `${count} compras`;
}

// "Próxima fatura · dezembro: 3 compras até agora".
export function nextBillLine(card: CardBills): string {
  const n = card.next.count;
  return n === 0 ? 'Nenhuma compra ainda' : `${purchases(n)} até agora`;
}

// Início's one line about the cards: "Fatura de novembro: R$ 450,00 · paga".
export function homeBillLine(cards: CardBills[]): string | null {
  const withBill = cards.filter((c) => c.status !== 'empty');
  if (withBill.length === 0) return null;
  const first = withBill[0];
  const status =
    first.status === 'paid' ? 'paga' : first.status === 'open' ? 'a pagar' : 'sem pagamento';
  const amount =
    withBill.length === 1 ? money(first.bill.total, first.currency) : `${withBill.length} cartões`;
  return withBill.length === 1
    ? `Fatura de ${billMonthName(first.bill.month)}: ${amount} · ${status}`
    : `Faturas de ${billMonthName(first.bill.month)}: ${amount}`;
}

export const NO_BILLS =
  'Nenhuma fatura ainda. As faturas aparecem quando um cartão é conectado em Conexões ' +
  '(Nubank e Inter): o banco diz em que fatura cai cada compra.';
