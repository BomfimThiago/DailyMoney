import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, json, notFound } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  kind: z.enum(["ME", "SPOUSE", "FAMILY", "OTHER"]).optional(),
  color: z.string().optional(),
});

export const PATCH = handle(async (req, ctx: { params: { id: string } }) => {
  const user = await requireUser();
  const member = await prisma.member.findFirst({ where: { id: ctx.params.id, userId: user.id } });
  if (!member) throw notFound("Responsável não encontrado");
  const body = patchSchema.parse(await req.json());
  const updated = await prisma.member.update({ where: { id: member.id }, data: body });
  return json({ member: updated });
});

// Deleting a member sets memberId to null on its transactions (schema onDelete).
export const DELETE = handle(async (_req, ctx: { params: { id: string } }) => {
  const user = await requireUser();
  const member = await prisma.member.findFirst({ where: { id: ctx.params.id, userId: user.id } });
  if (!member) throw notFound("Responsável não encontrado");
  await prisma.member.delete({ where: { id: member.id } });
  return json({ ok: true });
});
