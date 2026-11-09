import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, json, notFound, badRequest, conflict } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";
import { learnFromCorrection } from "@/lib/categories/rules";
import { typeBySign } from "@/lib/ingest/classify";
import { decimalAmount, dateInput } from "@/lib/validation";
import { assertOwnRefs } from "@/lib/transactions/refs";
import { categoryKinds, internalAfterCategoryChange } from "@/lib/categories/movement";
import { describeOther, duplicateReason, isUndecidedDuplicate } from "@/lib/ingest/cross-source";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  type: z.enum(["EXPENSE", "INCOME"]).optional(),
  categoryId: z.string().nullable().optional(),
  memberId: z.string().nullable().optional(),
  isInternalTransfer: z.boolean().optional(),
  baseCurrency: z.enum(["BRL", "USD", "EUR"]).optional(),
  description: z.string().min(1).optional(),
  baseAmount: decimalAmount.optional(),
  feeAmount: decimalAmount.optional(),
  date: dateInput.optional(),
  /** Linha que parece repetida de outra fonte: "é a mesma" (DUPLICATE) ou "não é" (NEW). */
  match: z.enum(["NEW", "DUPLICATE"]).optional(),
});

// Edit a single staged row during review (fixes feed the category-learning later).
export const PATCH = handle(async (req, ctx: { params: { id: string } }) => {
  const user = await requireUser();
  const staged = await prisma.stagedTransaction.findFirst({
    where: { id: ctx.params.id, upload: { userId: user.id } },
  });
  if (!staged) throw notFound("Linha não encontrada");

  const body = patchSchema.parse(await req.json());
  const { baseAmount, feeAmount, date, match, ...rest } = body;
  await assertOwnRefs(user.id, body);

  // Qualquer edição tira a linha da revisão, menos a pergunta "é a mesma de outra fonte?",
  // que só se responde com `match`.
  const data: Record<string, unknown> = {
    ...rest,
    needsReview: match === undefined && isUndecidedDuplicate(staged),
  };
  if (match !== undefined && match !== staged.match) {
    // Só alterna entre "nova" e "já está em Transações" numa linha que tem par de outra fonte.
    if (!staged.duplicateOfId || (staged.match !== "NEW" && staged.match !== "DUPLICATE")) {
      throw badRequest("Esta linha não tem uma transação de outra fonte para comparar");
    }
    const other = await prisma.transaction.findFirst({
      where: { id: staged.duplicateOfId, userId: user.id },
      select: { description: true, upload: { select: { filename: true, detectedFormat: true } } },
    });
    if (match === "DUPLICATE" && !other)
      throw conflict("A transação de outra fonte não existe mais; esta linha entra como nova");
    data.match = match;
    if (other) data.reviewReason = duplicateReason(describeOther(other), true);
  }
  if (body.isInternalTransfer === undefined && body.categoryId !== undefined && body.categoryId !== staged.categoryId) {
    const kinds = await categoryKinds(user.id);
    data.isInternalTransfer = internalAfterCategoryChange(
      kinds,
      staged.categoryId,
      body.categoryId,
      staged.isInternalTransfer,
    );
  }
  if (baseAmount !== undefined) data.baseAmount = baseAmount.toFixed(4);
  if (feeAmount !== undefined) data.feeAmount = feeAmount.abs().toFixed(4);
  if (date !== undefined) data.date = date;
  // Sem tipo escolhido, o tipo segue o sinal quando ele muda (era erro de leitura) e no
  // tipo legado "TRANSFER": só `isInternalTransfer` tira dos totais.
  const signFlipped = baseAmount !== undefined && baseAmount.isNegative() !== staged.baseAmount.isNegative();
  if (body.type === undefined && (staged.type === "TRANSFER" || signFlipped)) {
    data.type = typeBySign((baseAmount ?? staged.baseAmount).toString());
  }

  const updated = await prisma.stagedTransaction.update({
    where: { id: staged.id },
    data,
  });

  // Learn: assigning a category to a merchant reinforces a rule for next time.
  if (body.categoryId) {
    await learnFromCorrection(user.id, updated.description, body.categoryId);
  }
  return json({ staged: updated });
});

// Tira uma linha da revisão: ela não vai para Transações ao confirmar. Só enquanto a
// importação não foi confirmada; numa reimportação, a transação que ela representava
// sai junto ao confirmar (o usuário disse que não a quer).
export const DELETE = handle(async (_req, ctx: { params: { id: string } }) => {
  const user = await requireUser();
  const staged = await prisma.stagedTransaction.findFirst({
    where: { id: ctx.params.id, upload: { userId: user.id } },
    include: { upload: { select: { status: true } } },
  });
  if (!staged) throw notFound("Linha não encontrada");
  if (staged.upload.status === "COMMITTED")
    throw conflict("Importação já confirmada: exclua a transação em Transações");
  await prisma.stagedTransaction.delete({ where: { id: staged.id } });
  return json({ ok: true });
});
