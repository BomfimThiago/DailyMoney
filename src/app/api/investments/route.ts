import { prisma } from "@/lib/prisma";
import { handle, json } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * Os investimentos abertos dos bancos conectados, como o banco informou na última
 * sincronização (saldo líquido nas três moedas). Os resgatados e os que o banco deixou de
 * informar só entram na contagem.
 */
export const GET = handle(async () => {
  const user = await requireUser();
  const [positions, closed] = await Promise.all([
    prisma.investment.findMany({
      where: { userId: user.id, status: { in: ["ACTIVE", "PENDING"] } },
      orderBy: [{ bank: "asc" }, { name: "asc" }],
      select: {
        id: true,
        bank: true,
        name: true,
        type: true,
        subtype: true,
        issuer: true,
        code: true,
        currency: true,
        balance: true,
        balanceBRL: true,
        balanceUSD: true,
        balanceEUR: true,
        amountOriginal: true,
        rate: true,
        rateType: true,
        fixedAnnualRate: true,
        dueDate: true,
        status: true,
        valueDate: true,
      },
    }),
    prisma.investment.count({ where: { userId: user.id, status: { notIn: ["ACTIVE", "PENDING"] } } }),
  ]);
  const valueDate = positions.reduce<Date | null>((d, p) => (!d || p.valueDate > d ? p.valueDate : d), null);
  return json({ positions, closed, valueDate });
});
