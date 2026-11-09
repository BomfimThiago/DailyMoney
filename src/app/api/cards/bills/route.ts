import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { handle, json } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const query = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mês no formato AAAA-MM") });

const SUMS = { amountBRL: true, amountUSD: true, amountEUR: true } as const;

/** "2026-11" → "2026-12". */
function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
}

/**
 * As faturas de cada cartão vistas de um mês (o "caixa" do cartão, ao lado das compras
 * por data no resto do Resumo):
 *  - `bill`: a fatura deste mês (compras com `cardBill` = mês), o que sai da conta agora;
 *  - `paid`: pagamentos recebidos no cartão dentro do mês (quanto e quando);
 *  - `next`: a fatura seguinte, o que já foi comprado para o mês que vem.
 * Pagamento não é compra: fica fora dos totais da fatura (é dinheiro mudando de lugar).
 */
export const GET = handle(async (req) => {
  const user = await requireUser();
  const { month } = query.parse(Object.fromEntries(new URL(req.url).searchParams));
  const next = nextMonth(month);
  const from = new Date(`${month}-01T00:00:00.000Z`);
  const to = new Date(`${next}-01T00:00:00.000Z`);

  const isPayment: Prisma.TransactionWhereInput = {
    baseAmount: { gt: 0 },
    OR: [{ isInternalTransfer: true }, { description: { startsWith: "Pagamento", mode: "insensitive" } }],
  };
  const cardWhere = { userId: user.id, isCard: true };

  const [cards, totals, payments, withBill] = await Promise.all([
    prisma.transaction.groupBy({
      by: ["bank", "account"],
      where: cardWhere,
      orderBy: [{ bank: "asc" }, { account: "asc" }],
    }),
    prisma.transaction.groupBy({
      by: ["bank", "account", "cardBill"],
      where: { ...cardWhere, cardBill: { in: [month, next] }, isInternalTransfer: false, NOT: isPayment },
      _count: { _all: true },
      _sum: SUMS,
    }),
    prisma.transaction.findMany({
      where: { ...cardWhere, ...isPayment, date: { gte: from, lt: to } },
      select: { bank: true, account: true, date: true, ...SUMS },
      orderBy: { date: "asc" },
    }),
    prisma.transaction.count({ where: { ...cardWhere, cardBill: { not: null } } }),
  ]);

  const key = (c: { bank: string | null; account: string | null }) => `${c.bank}|${c.account}`;
  const total = (bill: string, c: { bank: string | null; account: string | null }) => {
    const t = totals.find((x) => key(x) === key(c) && x.cardBill === bill);
    return t ? { month: bill, count: t._count._all, _sum: t._sum } : { month: bill, count: 0, _sum: null };
  };

  return json({
    month,
    /** Sem nenhuma compra com mês de fatura ainda (importadas antes desta versão). */
    billsKnown: withBill > 0,
    cards: cards.map((c) => ({
      bank: c.bank,
      account: c.account,
      bill: total(month, c),
      next: total(next, c),
      paid: payments
        .filter((p) => key(p) === key(c))
        .map((p) => ({
          date: p.date,
          _sum: { amountBRL: p.amountBRL, amountUSD: p.amountUSD, amountEUR: p.amountEUR },
        })),
    })),
  });
});
