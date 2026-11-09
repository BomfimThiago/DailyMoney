import { prisma } from "@/lib/prisma";
import { badRequest } from "@/lib/http";

/** Categoria e responsável escolhidos precisam ser do próprio usuário. */
export async function assertOwnRefs(userId: string, refs: { categoryId?: string | null; memberId?: string | null }) {
  const [category, member] = await Promise.all([
    refs.categoryId
      ? prisma.category.findFirst({ where: { id: refs.categoryId, userId }, select: { id: true } })
      : true,
    refs.memberId ? prisma.member.findFirst({ where: { id: refs.memberId, userId }, select: { id: true } }) : true,
  ]);
  if (!category) throw badRequest("Categoria não encontrada");
  if (!member) throw badRequest("Responsável não encontrado");
}
