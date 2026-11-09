import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { handle, json, notFound } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";
import { convertToAllCurrencies } from "@/lib/fx/service";
import { dedupeHash, nthOccurrence } from "@/lib/ingest/dedupe";
import { decimalAmount, dateInput } from "@/lib/validation";
import { assertOwnRefs } from "@/lib/transactions/refs";
import { categoryKinds, internalAfterCategoryChange } from "@/lib/categories/movement";
import { typeBySign } from "@/lib/ingest/classify";
import { learnFromCorrection } from "@/lib/categories/rules";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  date: dateInput.optional(),
  description: z.string().min(1).optional(),
  type: z.enum(["EXPENSE", "INCOME"]).optional(),
  categoryId: z.string().nullable().optional(),
  memberId: z.string().nullable().optional(),
  isInternalTransfer: z.boolean().optional(),
  baseCurrency: z.enum(["BRL", "USD", "EUR"]).optional(),
  baseAmount: decimalAmount.optional(),
  feeAmount: decimalAmount.optional(),
});

// Edit a committed transaction. If amount/currency/date change, the 3-currency
// values and the dedupe hash are recomputed so everything stays consistent.
export const PATCH = handle(async (req, ctx: { params: { id: string } }) => {
  const user = await requireUser();
  const tx = await prisma.transaction.findFirst({ where: { id: ctx.params.id, userId: user.id } });
  if (!tx) throw notFound("Transação não encontrada");

  const body = patchSchema.parse(await req.json());
  await assertOwnRefs(user.id, body);
  const data: Prisma.TransactionUpdateInput = {};

  if (body.description !== undefined) data.description = body.description;
  if (body.categoryId !== undefined)
    data.category = body.categoryId ? { connect: { id: body.categoryId } } : { disconnect: true };
  if (body.memberId !== undefined)
    data.member = body.memberId ? { connect: { id: body.memberId } } : { disconnect: true };
  if (body.isInternalTransfer !== undefined) data.isInternalTransfer = body.isInternalTransfer;
  else if (body.categoryId !== undefined && body.categoryId !== tx.categoryId) {
    // Categoria de movimentação leva a transação para fora dos totais (e tirar dela, de volta).
    const kinds = await categoryKinds(user.id);
    data.isInternalTransfer = internalAfterCategoryChange(kinds, tx.categoryId, body.categoryId, tx.isInternalTransfer);
  }
  if (body.feeAmount !== undefined) data.feeAmount = body.feeAmount.abs().toFixed(4);

  // Campos que mexem no dinheiro (sem mudança, valem os atuais).
  const date = body.date ?? tx.date;
  const currency = body.baseCurrency ?? tx.baseCurrency;
  const amount = body.baseAmount ?? tx.baseAmount;
  const moneyChanged = body.date !== undefined || body.baseCurrency !== undefined || body.baseAmount !== undefined;
  // Sem tipo escolhido, o tipo segue o sinal quando ele muda e no tipo legado "TRANSFER"
  // (só `isInternalTransfer` tira dos totais).
  const signFlipped = body.baseAmount !== undefined && body.baseAmount.isNegative() !== tx.baseAmount.isNegative();
  if (body.type !== undefined) data.type = body.type;
  else if (tx.type === "TRANSFER" || signFlipped) data.type = typeBySign(amount.toString());

  if (moneyChanged) {
    const conv = await convertToAllCurrencies(amount, currency, date);
    Object.assign(data, {
      date,
      baseCurrency: currency,
      baseAmount: amount.toFixed(4),
      amountBRL: conv.amountBRL,
      amountUSD: conv.amountUSD,
      amountEUR: conv.amountEUR,
      fxRateDate: conv.fxRateDate,
      fxSource: conv.fxSource,
    });
  }
  // Data, valor e descrição formam a impressão digital: muda com eles. Se outra
  // transação já tem essa (duas iguais no mesmo dia), esta ganha a 2ª, 3ª… ocorrência,
  // como na importação, em vez de falhar com "registro duplicado".
  if (moneyChanged || body.description !== undefined) {
    const base = dedupeHash({
      bank: tx.bank ?? "",
      date,
      baseAmount: amount.toString(),
      description: body.description ?? tx.description,
    });
    data.dedupeHash = await freeDedupeHash(user.id, tx.id, base);
  }

  const updated = await prisma.transaction.update({ where: { id: tx.id }, data });
  if (body.categoryId) await learnFromCorrection(user.id, updated.description, body.categoryId);
  return json({ transaction: updated });
});

/** A primeira ocorrência livre da impressão digital (a própria transação não conta). */
async function freeDedupeHash(userId: string, txId: string, base: string): Promise<string> {
  for (let n = 1; n < 100; n++) {
    const hash = nthOccurrence(base, n);
    const taken = await prisma.transaction.findFirst({
      where: { userId, dedupeHash: hash, id: { not: txId } },
      select: { id: true },
    });
    if (!taken) return hash;
  }
  return nthOccurrence(base, Date.now());
}

export const DELETE = handle(async (_req, ctx: { params: { id: string } }) => {
  const user = await requireUser();
  const tx = await prisma.transaction.findFirst({
    where: { id: ctx.params.id, userId: user.id },
    select: { id: true },
  });
  if (!tx) throw notFound("Transação não encontrada");
  await prisma.transaction.delete({ where: { id: tx.id } });
  return json({ ok: true });
});
