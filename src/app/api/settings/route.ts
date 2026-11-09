import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, json } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";
import { MONTH_START_MAX, MONTH_START_MIN } from "@/lib/period";
import { getMonthStartDay } from "@/lib/settings";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  monthStartDay: z
    .number({ invalid_type_error: "Dia de início inválido" })
    .int("Dia de início inválido")
    .min(MONTH_START_MIN, `O mês começa entre o dia ${MONTH_START_MIN} e o ${MONTH_START_MAX}`)
    .max(MONTH_START_MAX, `O mês começa entre o dia ${MONTH_START_MIN} e o ${MONTH_START_MAX}`),
});

/** Configurações da conta que mudam o que as telas mostram (hoje: o dia em que o mês começa). */
export const GET = handle(async () => {
  const user = await requireUser();
  return json({ monthStartDay: await getMonthStartDay(user.id) });
});

export const PATCH = handle(async (req) => {
  const user = await requireUser();
  const body = patchSchema.parse(await req.json());
  const u = await prisma.user.update({
    where: { id: user.id },
    data: { monthStartDay: body.monthStartDay },
    select: { monthStartDay: true },
  });
  return json({ monthStartDay: u.monthStartDay });
});
