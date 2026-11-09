import { prisma } from "@/lib/prisma";
import { handle, json, notFound } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";
import { deleteRawFile } from "@/lib/ingest/storage";

export const dynamic = "force-dynamic";

export const GET = handle(async (_req, ctx: { params: { id: string } }) => {
  const user = await requireUser();
  const upload = await prisma.upload.findFirst({
    where: { id: ctx.params.id, userId: user.id },
    include: { _count: { select: { staged: true, transactions: true } } },
  });
  if (!upload) throw notFound("Upload não encontrado");
  return json({ upload });
});

// Delete an upload: its staged rows cascade. Already-committed transactions:
// - `?transactions=delete` → apagadas junto (a importação some por inteiro);
// - padrão → ficam (o uploadId vira null pela relação do schema).
// The raw file on disk is removed too — a deleted statement must not linger in storage/.
export const DELETE = handle(async (req, ctx: { params: { id: string } }) => {
  const user = await requireUser();
  const upload = await prisma.upload.findFirst({
    where: { id: ctx.params.id, userId: user.id },
    select: { id: true, rawStoragePath: true },
  });
  if (!upload) throw notFound("Upload não encontrado");
  const withTransactions = new URL(req.url).searchParams.get("transactions") === "delete";

  const [deleted] = await prisma.$transaction([
    prisma.transaction.deleteMany({
      where: withTransactions ? { userId: user.id, uploadId: upload.id } : { id: { in: [] } },
    }),
    prisma.upload.delete({ where: { id: upload.id } }),
  ]);
  const removedTransactions = deleted.count;

  // O banco é a fonte da verdade: a importação já foi excluída. Se o arquivo
  // não puder ser apagado, avisamos (em vez de falhar em silêncio).
  try {
    await deleteRawFile(upload.rawStoragePath);
    return json({ ok: true, removedTransactions });
  } catch (err) {
    console.error("[uploads] falha ao apagar arquivo bruto", upload.rawStoragePath, err);
    return json({
      ok: true,
      removedTransactions,
      warning: "A importação foi excluída, mas o arquivo original não pôde ser apagado do disco.",
    });
  }
});
