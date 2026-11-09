import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, json } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";
import { periodBounds } from "@/lib/period";
import { getMonthStartDay } from "@/lib/settings";

export const dynamic = "force-dynamic";

const query = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mês no formato AAAA-MM") });

const SUMS = { amountBRL: true, amountUSD: true, amountEUR: true } as const;

/**
 * As movimentações de um mês: o dinheiro que só mudou de lugar (marcado como interno, fora
 * de todos os totais), por categoria e por sentido. Com todas as contas conectadas, o que
 * sai de uma entra em outra; o que não volta foi para investimentos ou para contas que
 * ainda não estão no app.
 */
export const GET = handle(async (req) => {
  const user = await requireUser();
  const { month } = query.parse(Object.fromEntries(new URL(req.url).searchParams));
  // O "mês" é o mês financeiro da conta (pode começar no dia do salário).
  const b = periodBounds(month, await getMonthStartDay(user.id));
  const from = new Date(`${b.start}T00:00:00.000Z`);
  const to = new Date(`${b.end}T23:59:59.999Z`);
  const where = { userId: user.id, isInternalTransfer: true, date: { gte: from, lte: to } };

  const [out, inn] = await Promise.all(
    [{ lt: 0 }, { gt: 0 }].map((baseAmount) =>
      prisma.transaction.groupBy({
        by: ["categoryId"],
        where: { ...where, baseAmount },
        _count: { _all: true },
        _sum: SUMS,
      }),
    ),
  );
  const ids = [...new Set([...out, ...inn].map((g) => g.categoryId).filter((id): id is string => id !== null))];
  const categories = ids.length
    ? await prisma.category.findMany({
        where: { userId: user.id, id: { in: ids } },
        select: { id: true, name: true, color: true, icon: true },
      })
    : [];

  const pick = (rows: typeof out, id: string | null) => {
    const g = rows.find((r) => r.categoryId === id);
    return g ? { count: g._count._all, _sum: g._sum } : { count: 0, _sum: null };
  };
  const keys = [...new Set([...out, ...inn].map((g) => g.categoryId))];

  return json({
    month,
    groups: keys.map((id) => ({
      key: id ?? "none",
      category: categories.find((c) => c.id === id) ?? null,
      out: pick(out, id),
      in: pick(inn, id),
    })),
  });
});
