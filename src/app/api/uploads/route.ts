import { prisma } from "@/lib/prisma";
import { handle, json, badRequest } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";
import { deleteRawFile, saveRawFile } from "@/lib/ingest/storage";
import { contentHash } from "@/lib/ingest/identity";
import { processUpload } from "@/lib/ingest/process";
import { failInterruptedReads } from "@/lib/ingest/running";

export const dynamic = "force-dynamic";

const MAX_BYTES = 15 * 1024 * 1024;

// Upload a statement/receipt. Processes it synchronously (single-user app) and
// returns the upload with its resulting status (STAGED or FAILED).
export const POST = handle(async (req) => {
  const user = await requireUser();
  const form = await req.formData();
  const file = form.get("file");
  const bank = ((form.get("bank") as string | null) || "").trim() || null;

  if (!(file instanceof File)) throw badRequest("Nenhum arquivo enviado");
  if (file.size === 0) throw badRequest("Arquivo vazio");
  if (file.size > MAX_BYTES) throw badRequest("Arquivo muito grande (máx. 15MB)");

  const bytes = Buffer.from(await file.arrayBuffer());
  const hash = contentHash(bytes);

  // O mesmo arquivo ainda em revisão (ou que falhou): esta nova leitura o substitui,
  // para não ficarem duas revisões do mesmo extrato. Importações já confirmadas só
  // são substituídas quando esta for confirmada (ver commitUpload).
  const stale = await prisma.upload.findMany({
    where: { userId: user.id, contentHash: hash, status: { not: "COMMITTED" } },
    select: { id: true, rawStoragePath: true },
  });
  for (const old of stale) {
    await prisma.upload.delete({ where: { id: old.id } });
    await deleteRawFile(old.rawStoragePath).catch(() => undefined);
  }

  const upload = await prisma.upload.create({
    data: {
      userId: user.id,
      filename: file.name,
      mime: file.type || "application/octet-stream",
      sizeBytes: file.size,
      status: "PENDING",
      bank,
      contentHash: hash,
    },
  });

  await saveRawFile(upload.id, file.name, bytes).then((path) =>
    prisma.upload.update({ where: { id: upload.id }, data: { rawStoragePath: path } }),
  );

  // Process in the background: fast for CSV/XLSX, but PDF via a free AI model can
  // take minutes. The route returns immediately (status PENDING) and the UI polls
  // /api/uploads until it becomes STAGED or FAILED. Errors are recorded on the row.
  void processUpload({
    userId: user.id,
    uploadId: upload.id,
    filename: file.name,
    mime: upload.mime,
    bytes,
  }).catch(() => undefined);

  const result = await prisma.upload.findUnique({
    where: { id: upload.id },
    include: { _count: { select: { staged: true } } },
  });
  return json({ upload: result }, { status: 201 });
});

export const GET = handle(async () => {
  const user = await requireUser();
  await failInterruptedReads(user.id);
  const uploads = await prisma.upload.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { staged: true, transactions: true } } },
    take: 50,
  });
  return json({ uploads });
});
