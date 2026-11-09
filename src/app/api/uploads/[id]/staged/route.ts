import { prisma } from "@/lib/prisma";
import { handle, json, notFound } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";
import { reimportPlan } from "@/lib/ingest/commit";
import { failInterruptedReads } from "@/lib/ingest/running";

export const dynamic = "force-dynamic";

// List the staged (draft) transactions for review before commit.
export const GET = handle(async (_req, ctx: { params: { id: string } }) => {
  const user = await requireUser();
  await failInterruptedReads(user.id);
  const upload = await prisma.upload.findFirst({
    where: { id: ctx.params.id, userId: user.id },
  });
  if (!upload) throw notFound("Upload não encontrado");

  const staged = await prisma.stagedTransaction.findMany({
    where: { uploadId: upload.id },
    // Secondary sort by id keeps the order stable across refetches (same-date
    // rows won't shuffle when a row is edited).
    orderBy: [{ date: "asc" }, { id: "asc" }],
  });
  // O que confirmar vai fazer (novas, corrigidas, iguais, removidas).
  const plan = upload.status === "STAGED" ? await reimportPlan(user.id, upload.id) : null;
  return json({ upload, staged, plan });
});
