import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, json, notFound } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";
import { setCategoryKind } from "@/lib/categories/movement";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  color: z.string().optional(),
  icon: z.string().nullable().optional(),
  /** Gasto, entrada ou movimentação (fora dos totais); vale também para o que já está nela. */
  kind: z.enum(["EXPENSE", "INCOME", "TRANSFER"]).optional(),
});

export const PATCH = handle(async (req, ctx: { params: { id: string } }) => {
  const user = await requireUser();
  const category = await prisma.category.findFirst({ where: { id: ctx.params.id, userId: user.id } });
  if (!category) throw notFound("Categoria não encontrada");
  const { kind, ...rest } = patchSchema.parse(await req.json());
  // Trocar o tipo mexe nas transações dela: movimentação sai dos totais, gasto/entrada volta.
  const moved = kind && kind !== category.kind ? await setCategoryKind(user.id, category.id, kind) : 0;
  const updated = Object.keys(rest).length
    ? await prisma.category.update({ where: { id: category.id }, data: rest })
    : await prisma.category.findUniqueOrThrow({ where: { id: category.id } });
  return json({ category: updated, moved });
});

// Deleting a category nulls it on transactions (schema onDelete: SetNull) and
// removes its learned rules (Cascade).
export const DELETE = handle(async (_req, ctx: { params: { id: string } }) => {
  const user = await requireUser();
  const category = await prisma.category.findFirst({ where: { id: ctx.params.id, userId: user.id } });
  if (!category) throw notFound("Categoria não encontrada");
  await prisma.category.delete({ where: { id: category.id } });
  return json({ ok: true });
});
