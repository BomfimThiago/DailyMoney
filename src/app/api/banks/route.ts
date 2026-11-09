import { prisma } from "@/lib/prisma";
import { handle, json } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

// Distinct bank labels the user has used — powers the upload datalist + filters.
export const GET = handle(async () => {
  const user = await requireUser();
  const rows = await prisma.transaction.findMany({
    where: { userId: user.id, bank: { not: null } },
    distinct: ["bank"],
    select: { bank: true },
    orderBy: { bank: "asc" },
  });
  const banks = rows.map((r) => r.bank).filter((b): b is string => Boolean(b));
  return json({ banks });
});
