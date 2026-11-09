import type { CategoryKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Categoria de movimentação (kind TRANSFER): dinheiro que só muda de lugar — entre contas
// suas, aplicação e resgate de investimento, pagamento de cartão. Não é gasto nem entrada.
//
// A transação numa categoria dessas fica marcada como interna (`isInternalTransfer`), e
// todos os totais do app já deixam interna de fora. Assim a regra vale em um lugar só:
//  - trocar o tipo da categoria marca (ou desmarca) as transações que já estão nela;
//  - pôr uma transação numa categoria de movimentação a marca; tirar de uma a desmarca;
//  - na importação, a categoria sugerida pela regra aprendida faz o mesmo.

export type KindById = Map<string, CategoryKind>;

/** Tipo de cada categoria do usuário. */
export async function categoryKinds(userId: string): Promise<KindById> {
  const rows = await prisma.category.findMany({ where: { userId }, select: { id: true, kind: true } });
  return new Map(rows.map((c) => [c.id, c.kind]));
}

/**
 * Interna depois de trocar a categoria (sem o usuário dizer nada sobre "interna"): entra
 * numa de movimentação → sim; sai de uma de movimentação para outra → não; senão, fica.
 */
export function internalAfterCategoryChange(
  kinds: KindById,
  from: string | null,
  to: string | null,
  current: boolean,
): boolean {
  if (to && kinds.get(to) === "TRANSFER") return true;
  if (from && kinds.get(from) === "TRANSFER") return false;
  return current;
}

/** Linha nova chegando com a categoria sugerida: de movimentação, já vem interna. */
export function internalForSuggested(kinds: KindById, categoryId: string | null, current: boolean): boolean {
  return current || (categoryId !== null && kinds.get(categoryId) === "TRANSFER");
}

/**
 * Troca o tipo de uma categoria e aplica às transações que já estão nela (e às linhas em
 * revisão): movimentação → todas internas; gasto/entrada → nenhuma interna. Devolve quantas
 * transações mudaram de lado.
 */
export async function setCategoryKind(userId: string, categoryId: string, kind: CategoryKind): Promise<number> {
  const internal = kind === "TRANSFER";
  const [, moved] = await prisma.$transaction([
    prisma.category.update({ where: { id: categoryId }, data: { kind } }),
    prisma.transaction.updateMany({
      where: { userId, categoryId, isInternalTransfer: !internal },
      data: { isInternalTransfer: internal },
    }),
    prisma.stagedTransaction.updateMany({
      where: { categoryId, upload: { userId } },
      data: { isInternalTransfer: internal },
    }),
  ]);
  return moved.count;
}
