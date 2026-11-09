import { prisma } from "@/lib/prisma";
import { conflict } from "@/lib/http";
import { deleteRawFile } from "@/lib/ingest/storage";

// "Apagar todas as transações": começar do zero sem perder o resto da conta.
// Vai junto o que só existia por causa delas: as importações já confirmadas (ficariam
// vazias na tela de Importar) e o arquivo de cada uma no disco. Fica o resto:
// categorias, responsáveis, regras, bancos conectados e as revisões ainda abertas.

export interface PurgeOverview {
  transactions: number;
  /** Importações confirmadas, que somem junto. */
  imports: number;
  /** Importações esperando revisão: ficam, e tudo nelas passa a ser "nova". */
  openReviews: number;
}

export async function purgeOverview(userId: string): Promise<PurgeOverview> {
  const [transactions, imports, openReviews] = await Promise.all([
    prisma.transaction.count({ where: { userId } }),
    prisma.upload.count({ where: { userId, status: "COMMITTED" } }),
    prisma.upload.count({ where: { userId, status: { in: ["PENDING", "PARSING", "STAGED"] } } }),
  ]);
  return { transactions, imports, openReviews };
}

export interface PurgeResult {
  removedTransactions: number;
  removedImports: number;
  warning?: string;
}

/**
 * Apaga todas as transações do usuário. `expected` é o número que ele viu ao confirmar:
 * se mudou nesse meio-tempo (uma sincronização confirmou algo), nada é apagado e ele
 * confirma de novo vendo o número certo.
 */
export async function deleteAllTransactions(userId: string, expected: number): Promise<PurgeResult> {
  const { removedTransactions, files } = await prisma.$transaction(async (tx) => {
    const count = await tx.transaction.count({ where: { userId } });
    if (count !== expected) {
      throw conflict(
        `Agora são ${count} ${count === 1 ? "transação" : "transações"}, não ${expected}. Nada foi apagado; confira e confirme de novo.`,
      );
    }
    const imports = await tx.upload.findMany({
      where: { userId, status: "COMMITTED" },
      select: { id: true, rawStoragePath: true },
    });
    const removed = await tx.transaction.deleteMany({ where: { userId } });
    await tx.upload.deleteMany({ where: { id: { in: imports.map((u) => u.id) } } });
    // Revisões abertas apontavam para transações que não existem mais: viram "novas".
    await tx.stagedTransaction.updateMany({
      where: { upload: { userId }, OR: [{ existingTransactionId: { not: null } }, { duplicateOfId: { not: null } }] },
      data: { existingTransactionId: null, duplicateOfId: null, match: "NEW", needsReview: false, reviewReason: null },
    });
    return { removedTransactions: removed.count, files: imports };
  });

  // O banco já está limpo. Arquivo que não sai do disco vira aviso, não falha silenciosa.
  const stuck: string[] = [];
  for (const f of files) {
    await deleteRawFile(f.rawStoragePath).catch((err) => {
      console.error("[purge] falha ao apagar arquivo bruto", f.rawStoragePath, err);
      stuck.push(f.id);
    });
  }
  return {
    removedTransactions,
    removedImports: files.length,
    ...(stuck.length
      ? {
          warning: `${stuck.length} ${stuck.length === 1 ? "arquivo original não pôde" : "arquivos originais não puderam"} ser apagados do disco.`,
        }
      : {}),
  };
}
