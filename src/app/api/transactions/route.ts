import { prisma } from "@/lib/prisma";
import { handle, json } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";
import { buildWhere, listOrderBy, parseFilters, parseListPage } from "@/lib/transactions/query";

export const dynamic = "force-dynamic";

/**
 * Lista paginada (50 por vez; `offset` para "Carregar mais"), com ordenação no servidor.
 * `groupCards=true` (lista por dia): as compras do cartão saem das linhas e voltam em
 * `cards`, uma entrada por cartão com quantas são e quanto somam no período; os totais do
 * período continuam contando com elas (são gastos).
 * Tudo que resume o período vem calculado sobre TODAS as transações, não só a página:
 * totais por tipo, pendentes, contagem e o total de cada dia que aparece na página
 * (um dia dividido entre duas páginas mostra o total certo desde a primeira).
 */
export const GET = handle(async (req) => {
  const user = await requireUser();
  const url = new URL(req.url);
  const filters = parseFilters(url.searchParams);
  const page = parseListPage(url.searchParams);
  const where = buildWhere(user.id, filters);
  const groupCards = url.searchParams.get("groupCards") === "true" && filters.card === undefined;
  // As linhas (e o total de cada dia, que soma as linhas) ficam sem as compras do cartão.
  const rows = groupCards ? { ...where, isCard: false } : where;
  // Totais nunca contam transferência interna, mesmo com elas visíveis na lista.
  const counted = { ...where, isInternalTransfer: false };

  const [transactions, total, totals, pending, cards] = await Promise.all([
    prisma.transaction.findMany({
      where: rows,
      orderBy: listOrderBy(page),
      include: { category: true, member: true },
      skip: page.offset,
      take: page.limit,
    }),
    prisma.transaction.count({ where: rows }),
    prisma.transaction.groupBy({
      by: ["type"],
      where: counted,
      _sum: { amountBRL: true, amountUSD: true, amountEUR: true },
    }),
    prisma.transaction.aggregate({
      where: { ...counted, state: "PENDING" },
      _count: { _all: true },
      _sum: { amountBRL: true, amountUSD: true, amountEUR: true },
    }),
    groupCards
      ? prisma.transaction.groupBy({
          by: ["bank", "account"],
          where: { ...where, isCard: true },
          _count: { _all: true },
          _sum: { amountBRL: true, amountUSD: true, amountEUR: true },
          orderBy: [{ bank: "asc" }, { account: "asc" }],
        })
      : Promise.resolve([]),
  ]);

  const days = [...new Set(transactions.map((t) => t.date.getTime()))].map((ms) => new Date(ms));
  const dayTotals = days.length
    ? await prisma.transaction.groupBy({
        by: ["date"],
        where: { ...counted, ...(groupCards ? { isCard: false } : {}), type: { not: "TRANSFER" }, date: { in: days } },
        _sum: { amountBRL: true, amountUSD: true, amountEUR: true },
      })
    : [];

  return json({
    transactions,
    total,
    offset: page.offset,
    limit: page.limit,
    totals,
    pending: { count: pending._count._all, _sum: pending._sum },
    dayTotals: dayTotals.map((d) => ({ day: d.date.toISOString().slice(0, 10), _sum: d._sum })),
    cards: cards.map((c) => ({ bank: c.bank, account: c.account, count: c._count._all, _sum: c._sum })),
  });
});
