import { readFile } from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import { handle, json, notFound, badRequest } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";
import { processUpload } from "@/lib/ingest/process";

export const dynamic = "force-dynamic";

// Re-run extraction on the stored raw file (e.g. after a FAILED/timeout, or after
// changing the AI model). Runs in the background; the UI polls for the new status.
export const POST = handle(async (_req, ctx: { params: { id: string } }) => {
  const user = await requireUser();
  const upload = await prisma.upload.findFirst({ where: { id: ctx.params.id, userId: user.id } });
  if (!upload) throw notFound("Upload não encontrado");
  if (!upload.rawStoragePath) throw badRequest("Arquivo original indisponível para reprocessar");

  const bytes = await readFile(upload.rawStoragePath).catch(() => null);
  if (!bytes) throw badRequest("Arquivo original não encontrado no disco");

  await prisma.upload.update({
    where: { id: upload.id },
    data: { status: "PENDING", error: null },
  });

  void processUpload({
    userId: user.id,
    uploadId: upload.id,
    filename: upload.filename,
    mime: upload.mime,
    bytes,
  }).catch(() => undefined);

  return json({ ok: true });
});
