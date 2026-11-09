import { prisma } from "@/lib/prisma";

// Linhagem de uma importação: as importações da MESMA fonte (mesmo arquivo, ou a mesma
// conta de um banco conectado), reconhecidas pela `contentHash`. É o que separa "a mesma
// linha lida de novo" (reimportação: atualiza) de "a mesma transação vinda de outra
// fonte" (repetida: não entra). Usada pela leitura (process.ts) e pela confirmação (commit.ts).

/** Importações desta fonte: esta e as anteriores com a mesma `contentHash`. */
export async function lineageUploadIds(userId: string, uploadId: string): Promise<Set<string>> {
  const self = await prisma.upload.findUniqueOrThrow({ where: { id: uploadId }, select: { contentHash: true } });
  const same = self.contentHash
    ? await prisma.upload.findMany({ where: { userId, contentHash: self.contentHash }, select: { id: true } })
    : [];
  return new Set([uploadId, ...same.map((u) => u.id)]);
}

/**
 * Transações gravadas por importações do MESMO arquivo (mesmo conteúdo), inclusive
 * por esta mesma importação (reprocessar). Ao confirmar, as que não estiverem mais
 * entre as linhas lidas são removidas: eram erro de um leitor antigo.
 *
 * Sincronização de banco: o "arquivo" é a conta (mesma `contentHash` a cada sincronização)
 * e só conta o período que ela cobre (`coversFrom`): o que é mais antigo saiu da janela
 * do banco, não foi apagado.
 */
export async function priorTransactions(
  userId: string,
  upload: { id: string; contentHash: string | null; coversFrom?: Date | null },
) {
  const uploads = upload.contentHash
    ? await prisma.upload.findMany({
        where: { userId, contentHash: upload.contentHash },
        select: { id: true, filename: true, createdAt: true, status: true },
      })
    : [];
  const ids = new Set([upload.id, ...uploads.map((u) => u.id)]);
  const txs = await prisma.transaction.findMany({
    where: { userId, uploadId: { in: [...ids] }, ...(upload.coversFrom ? { date: { gte: upload.coversFrom } } : {}) },
    select: { id: true },
  });
  return { previousUploads: uploads.filter((u) => u.id !== upload.id), transactionIds: txs.map((t) => t.id) };
}
