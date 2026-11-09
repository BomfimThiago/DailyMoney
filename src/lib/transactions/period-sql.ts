import { Prisma } from "@prisma/client";
import { NAMED_BY_END_FROM } from "@/lib/period";

/**
 * O mês financeiro (o nome do período, 1º dia do mês) de cada "date", na mesma regra de
 * `periodKeyOf` (src/lib/period.ts): o dia antes do início volta um mês, e começando a
 * partir de NAMED_BY_END_FROM o período leva o nome do mês em que termina.
 */
export function periodMonthSql(startDay: number): Prisma.Sql {
  const month = Prisma.sql`date_trunc('month', "date")`;
  if (startDay <= 1) return month;
  const startMonth = Prisma.sql`CASE WHEN extract(day from "date") >= ${startDay} THEN ${month} ELSE ${month} - interval '1 month' END`;
  return startDay >= NAMED_BY_END_FROM ? Prisma.sql`(${startMonth}) + interval '1 month'` : startMonth;
}
