import { prisma } from "@/lib/prisma";
import { normalizeStartDay } from "@/lib/period";

/** Dia em que o mês financeiro da conta começa (1 = mês do calendário). */
export async function getMonthStartDay(userId: string): Promise<number> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { monthStartDay: true } });
  return normalizeStartDay(u?.monthStartDay);
}
