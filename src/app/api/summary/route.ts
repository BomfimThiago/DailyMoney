import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { handle, json } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";
import { parseFilters } from "@/lib/transactions/query";
import { getMonthStartDay } from "@/lib/settings";
import { periodMonthSql } from "@/lib/transactions/period-sql";

export const dynamic = "force-dynamic";

interface MonthlyRow {
  month: string;
  type: string;
  brl: string;
  usd: string;
  eur: string;
  count: bigint;
}

// Monthly totals per type across all three currencies, by the account's financial month. Internal transfers never
// count (they're neither spending nor income). Uses a grouped raw query for date_trunc.
export const GET = handle(async (req) => {
  const user = await requireUser();
  const f = parseFilters(new URL(req.url).searchParams);
  const startDay = await getMonthStartDay(user.id);

  const conditions: Prisma.Sql[] = [Prisma.sql`"userId" = ${user.id}`];
  conditions.push(Prisma.sql`"isInternalTransfer" = false`);
  if (f.from) conditions.push(Prisma.sql`"date" >= ${f.from}`);
  if (f.to) conditions.push(Prisma.sql`"date" <= ${f.to}`);
  if (f.baseCurrency) conditions.push(Prisma.sql`"baseCurrency" = ${f.baseCurrency}::"Currency"`);
  if (f.bank) conditions.push(Prisma.sql`"bank" = ${f.bank}`);
  if (f.memberId) conditions.push(Prisma.sql`"memberId" = ${f.memberId}`);
  if (f.categoryId) conditions.push(Prisma.sql`"categoryId" = ${f.categoryId}`);
  const whereSql = Prisma.join(conditions, " AND ");

  const rows = await prisma.$queryRaw<MonthlyRow[]>(Prisma.sql`
    SELECT to_char(${periodMonthSql(startDay)}, 'YYYY-MM') AS month,
           "type"::text AS type,
           SUM("amountBRL") AS brl,
           SUM("amountUSD") AS usd,
           SUM("amountEUR") AS eur,
           COUNT(*) AS count
    FROM "Transaction"
    WHERE ${whereSql}
    GROUP BY 1, 2
    ORDER BY 1 DESC, 2
  `);

  const summary = rows.map((r) => ({
    month: r.month,
    type: r.type,
    brl: r.brl ?? "0",
    usd: r.usd ?? "0",
    eur: r.eur ?? "0",
    count: Number(r.count),
  }));
  return json({ summary });
});
