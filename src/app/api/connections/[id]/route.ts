import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, json, notFound } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";
import { canonicalBank } from "@/lib/ingest/bank";
import { providerFor } from "@/lib/bank-sync/sync";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  bank: z.string().trim().min(1, "Informe o banco").optional(),
  syncFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato AAAA-MM-DD")
    .transform((s) => new Date(`${s}T00:00:00.000Z`))
    .refine((d) => !Number.isNaN(d.getTime()), "Data inválida")
    .optional(),
});

async function own(userId: string, id: string) {
  const c = await prisma.bankConnection.findFirst({ where: { id, userId } });
  if (!c) throw notFound("Conexão não encontrada");
  return c;
}

export const PATCH = handle(async (req, ctx: { params: { id: string } }) => {
  const user = await requireUser();
  await own(user.id, ctx.params.id);
  const body = patchSchema.parse(await req.json());
  const connection = await prisma.bankConnection.update({
    where: { id: ctx.params.id },
    data: { ...body, ...(body.bank ? { bank: canonicalBank(body.bank) ?? body.bank } : {}) },
  });
  return json({ connection });
});

/**
 * Desconecta. As transações já confirmadas ficam; revisões abertas desta conexão são
 * descartadas. Na Enable Banking a autorização também é encerrada; na Pluggy ela continua
 * até você removê-la no meu.pluggy.ai. Se encerrar falhar, desconecta mesmo assim e avisa.
 */
export const DELETE = handle(async (_req, ctx: { params: { id: string } }) => {
  const user = await requireUser();
  const conn = await own(user.id, ctx.params.id);
  let warning: string | undefined;
  const revoke = providerFor(conn.provider).revoke;
  if (revoke) {
    await revoke(conn).catch((err) => {
      warning = `A autorização no banco não pôde ser encerrada (${err instanceof Error ? err.message : err}); ela vence sozinha.`;
    });
  }
  await prisma.$transaction([
    prisma.upload.deleteMany({ where: { userId: user.id, connectionId: ctx.params.id, status: { not: "COMMITTED" } } }),
    prisma.bankConnection.delete({ where: { id: ctx.params.id } }),
  ]);
  return json({ ok: true, ...(warning ? { warning } : {}) });
});
