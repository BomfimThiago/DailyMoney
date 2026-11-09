import { prisma } from "@/lib/prisma";

const DAY_MS = 86_400_000;

/**
 * De quando ler um banco recém-conectado: o dia seguinte à última transação dele que já
 * está no app (o que veio por extrato não é lido de novo), ou 1 ano atrás.
 */
export async function defaultSyncFrom(userId: string, bank: string): Promise<Date> {
  const last = await prisma.transaction.findFirst({
    where: { userId, bank },
    orderBy: { date: "desc" },
    select: { date: true },
  });
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return last ? new Date(last.date.getTime() + DAY_MS) : new Date(todayUtc - 365 * DAY_MS);
}
