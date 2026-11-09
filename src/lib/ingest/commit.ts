import { prisma } from "@/lib/prisma";
import { dedupeHash, occurrenceHashes } from "@/lib/ingest/dedupe";
import { convertToAllCurrencies, getRatesForDate } from "@/lib/fx/service";
import { HttpError } from "@/lib/http";
import { deleteRawFile } from "@/lib/ingest/storage";
import { changedFields } from "@/lib/ingest/identity";
import { isUndecidedDuplicate } from "@/lib/ingest/cross-source";
import { lineageUploadIds, priorTransactions } from "@/lib/ingest/lineage";

// Confirmação de uma importação revisada: linhas em revisão → Transações, com câmbio do
// dia. `reimportPlan` diz antes o que ela vai fazer (novas, corrigidas, removidas…).

export interface ReimportPlan {
  /** Importações anteriores do mesmo arquivo (serão substituídas por esta). */
  previous: { id: string; filename: string; createdAt: Date }[];
  create: number;
  update: number;
  same: number;
  /** Gravadas a partir deste arquivo que não aparecem mais nele: serão removidas. */
  remove: number;
  /** Já estão em Transações vindas de outra fonte (arquivo × banco conectado): não entram. */
  duplicate: number;
}

export async function reimportPlan(userId: string, uploadId: string): Promise<ReimportPlan> {
  const upload = await prisma.upload.findFirstOrThrow({ where: { id: uploadId, userId } });
  const staged = await prisma.stagedTransaction.findMany({
    where: { uploadId },
    select: { match: true, existingTransactionId: true },
  });
  const prior = await priorTransactions(userId, upload);
  const kept = new Set(staged.map((s) => s.existingTransactionId).filter(Boolean));
  return {
    previous: prior.previousUploads
      .filter((u) => u.status === "COMMITTED")
      .map(({ id, filename, createdAt }) => ({ id, filename, createdAt })),
    create: staged.filter((s) => s.match === "NEW").length,
    update: staged.filter((s) => s.match === "UPDATE").length,
    same: staged.filter((s) => s.match === "SAME").length,
    remove: upload.partialRead ? 0 : prior.transactionIds.filter((id) => !kept.has(id)).length,
    duplicate: staged.filter((s) => s.match === "DUPLICATE").length,
  };
}

// --- Commit (staged -> transactions, with FX) ------------------------------

export interface CommitResult {
  /** Transações novas. */
  committed: number;
  /** Já gravadas e corrigidas pelo arquivo (ou com categoria/responsável trocados na revisão). */
  updated: number;
  /** Já gravadas e iguais. */
  unchanged: number;
  /** Gravadas por uma leitura anterior deste arquivo e que não estão mais nele. */
  removed: number;
  /** Já estavam em Transações vindas de outro extrato ou do banco conectado. */
  skippedDuplicates: number;
  failed: { description: string; message: string }[];
}

export async function commitUpload(userId: string, uploadId: string): Promise<CommitResult> {
  const upload = await prisma.upload.findFirst({ where: { id: uploadId, userId } });
  if (!upload) throw new Error("Upload não encontrado");
  const bankKey = upload.bank ?? "";

  const staged = await prisma.stagedTransaction.findMany({
    where: { uploadId },
    orderBy: [{ date: "asc" }, { id: "asc" }],
  });
  const undecided = staged.filter(isUndecidedDuplicate).length;
  if (undecided) {
    throw new HttpError(
      409,
      `${undecided} ${undecided === 1 ? "linha pode já estar" : "linhas podem já estar"} em Transações vinda${undecided === 1 ? "" : "s"} de outra fonte. Diga se é a mesma ou não antes de confirmar; nada foi gravado.`,
      "UNDECIDED_DUPLICATES",
    );
  }
  const result: CommitResult = { committed: 0, updated: 0, unchanged: 0, removed: 0, skippedDuplicates: 0, failed: [] };

  // Pré-carrega o câmbio de todas as datas ANTES de gravar qualquer linha. Se o
  // serviço de câmbio estiver fora, nada é gravado, a importação continua em
  // revisão (com as edições do usuário) e o erro aparece na tela.
  await preloadRates(staged);

  const prior = await priorTransactions(userId, upload);
  const priorIds = new Set(prior.transactionIds);
  const lineage = await lineageUploadIds(userId, uploadId);
  const matched = new Set<string>();
  // Recalculada (o usuário pode ter editado data/valor/descrição na revisão), com as
  // repetições do mesmo arquivo numeradas como na leitura.
  const hashes = occurrenceHashes(
    staged.map((s) =>
      dedupeHash({ bank: bankKey, date: s.date, baseAmount: s.baseAmount.toString(), description: s.description }),
    ),
  );

  for (const [i, s] of staged.entries()) {
    try {
      // Já está em Transações vinda de outra fonte: não entra, e a de lá não é tocada.
      // Se ela foi apagada nesse meio-tempo, esta linha entra como nova.
      if (s.match === "DUPLICATE" && s.duplicateOfId) {
        const other = await prisma.transaction.findFirst({
          where: { id: s.duplicateOfId, userId },
          select: { id: true },
        });
        if (other) {
          result.skippedDuplicates++;
          continue;
        }
      }
      const conv = await convertToAllCurrencies(s.baseAmount.toString(), s.baseCurrency, s.date);
      const hash = hashes[i];
      const values = {
        bank: upload.bank,
        memberId: s.memberId,
        categoryId: s.categoryId,
        date: s.date,
        description: s.description,
        merchantRaw: s.merchantRaw,
        type: s.type,
        state: s.state,
        isInternalTransfer: s.isInternalTransfer,
        baseCurrency: s.baseCurrency,
        baseAmount: s.baseAmount,
        amountBRL: conv.amountBRL,
        amountUSD: conv.amountUSD,
        amountEUR: conv.amountEUR,
        feeAmount: s.feeAmount,
        fxRateDate: conv.fxRateDate,
        fxSource: conv.fxSource,
        dedupeHash: hash,
        sourceKey: s.sourceKey,
        // De qual conta veio (banco conectado): o cartão fica junto na lista.
        account: s.account,
        isCard: s.isCard,
        cardBill: s.cardBill,
        installment: s.installment,
      };

      // A transação que esta linha representa: a apontada na revisão (se ainda
      // existir), senão procura de novo pela chave da linha e pela impressão digital.
      let target =
        (s.existingTransactionId &&
          (await prisma.transaction.findFirst({ where: { id: s.existingTransactionId, userId } }))) ||
        (s.sourceKey && (await prisma.transaction.findFirst({ where: { userId, sourceKey: s.sourceKey } }))) ||
        (await prisma.transaction.findUnique({ where: { userId_dedupeHash: { userId, dedupeHash: hash } } }));
      if (target && matched.has(target.id)) target = null;

      if (!target) {
        await prisma.transaction.create({ data: { userId, uploadId, ...values } });
        result.committed++;
        continue;
      }
      matched.add(target.id);
      // Desta fonte: gravada por uma leitura deste arquivo/conta, ou solta (a importação
      // foi excluída mantendo as transações) com a mesma chave de linha.
      const sameFile =
        priorIds.has(target.id) ||
        (target.uploadId ? lineage.has(target.uploadId) : Boolean(s.sourceKey) && target.sourceKey === s.sourceKey);

      // De outra fonte (extrato sobreposto, banco conectado), gravada depois da revisão:
      // fica a de lá, intocada; esta linha não entra.
      if (!sameFile) {
        result.skippedDuplicates++;
        continue;
      }

      const changed =
        changedFields(values, target).length > 0 ||
        target.categoryId !== values.categoryId ||
        target.memberId !== values.memberId ||
        target.isInternalTransfer !== values.isInternalTransfer;
      try {
        await prisma.transaction.update({
          where: { id: target.id },
          // Do mesmo arquivo: passa a pertencer a esta importação (a anterior sai).
          data: { ...values, ...(sameFile ? { uploadId } : {}) },
        });
      } catch (err) {
        // A versão corrigida já existe como outra transação (veio de outro extrato):
        // fica aquela; a desta leitura antiga do arquivo sai.
        if ((err as { code?: string }).code === "P2002" && sameFile) {
          await prisma.transaction.delete({ where: { id: target.id } });
          result.skippedDuplicates++;
          continue;
        }
        throw err;
      }
      if (changed) result.updated++;
      else result.unchanged++;
    } catch (err) {
      result.failed.push({
        description: s.description,
        message: err instanceof Error ? err.message : "Erro ao converter/gravar",
      });
    }
  }

  // Só substitui a leitura anterior do arquivo se TUDO desta deu certo: com falhas,
  // apagar o que sobrou poderia perder transações que esta leitura não gravou.
  if (result.failed.length === 0) {
    const leftovers = prior.transactionIds.filter((id) => !matched.has(id));
    if (leftovers.length && upload.partialRead) {
      // Leitura com linhas ilegíveis: o que não veio pode ser justamente uma delas. Fica,
      // e passa a esta importação para continuar sendo desta fonte.
      await prisma.transaction.updateMany({ where: { userId, id: { in: leftovers } }, data: { uploadId } });
    } else if (leftovers.length) {
      const del = await prisma.transaction.deleteMany({ where: { userId, id: { in: leftovers } } });
      result.removed = del.count;
    }
    // Importações anteriores do mesmo arquivo: substituídas por esta. O que elas ainda
    // têm (fora do período desta leitura: sincronização lê só as últimas semanas) passa
    // a esta, para continuar sendo desta fonte.
    if (prior.previousUploads.length) {
      await prisma.transaction.updateMany({
        where: { userId, uploadId: { in: prior.previousUploads.map((u) => u.id) } },
        data: { uploadId },
      });
    }
    for (const old of prior.previousUploads) {
      const gone = await prisma.upload.delete({ where: { id: old.id } }).catch(() => null);
      if (gone) await deleteRawFile(gone.rawStoragePath).catch(() => undefined);
    }
  }

  await prisma.upload.update({
    where: { id: uploadId },
    data: {
      status:
        result.failed.length && result.committed + result.updated + result.unchanged === 0 ? "FAILED" : "COMMITTED",
      error: result.failed.length ? `${result.failed.length} transação(ões) falharam ao gravar` : null,
    },
  });

  return result;
}

async function preloadRates(rows: { date: Date; baseCurrency: import("@prisma/client").Currency }[]) {
  const seen = new Set<string>();
  for (const r of rows) {
    const key = `${r.date.toISOString().slice(0, 10)}|${r.baseCurrency}`;
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      await getRatesForDate(r.date, r.baseCurrency);
    } catch (err) {
      throw new HttpError(
        503,
        `Não deu para buscar o câmbio agora, então nada foi gravado. ${err instanceof Error ? err.message : ""}`.trim(),
        "FX_UNAVAILABLE",
      );
    }
  }
}
