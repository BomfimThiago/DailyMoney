import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { aiExtractionEnabled } from "@/lib/env";
import { classifyFile, toDelimitedText } from "@/lib/ingest/extract-tabular";
import { parseTabular } from "@/lib/tabular/pipeline";
import { headerFingerprint, parseDelimited, detectDelimiter } from "@/lib/tabular/detect";
import type { FormatProfileSpec, NormalizedRow } from "@/lib/tabular/types";
import { dedupeHash, occurrenceHashes } from "@/lib/ingest/dedupe";
import { Decimal } from "@/lib/money";
import { whileReading } from "@/lib/ingest/running";
import { extractDocument } from "@/lib/ai/extract";
import { suggestCategories } from "@/lib/categories/rules";
import { changedFields, sourceKeys } from "@/lib/ingest/identity";
import { parseOfx } from "@/lib/ingest/ofx";
import { summarizeReadErrors } from "@/lib/ingest/read-warnings";
import { canonicalBank } from "@/lib/ingest/bank";
import { lineageUploadIds } from "@/lib/ingest/lineage";
import { categoryKinds, internalForSuggested } from "@/lib/categories/movement";
import {
  describeOther,
  duplicateReason,
  matchAcrossSources,
  type Coverage,
  type CrossMatch,
} from "@/lib/ingest/cross-source";

// Leitura de uma importação: arquivo (CSV/XLSX, OFX, PDF/imagem) ou conta de banco
// conectado → linhas em revisão (StagedTransaction). Nada vai para Transações aqui; isso
// é a confirmação (commit.ts).

export async function processUpload(params: {
  userId: string;
  uploadId: string;
  filename: string;
  mime: string;
  bytes: Buffer;
}): Promise<void> {
  // Marca como "em leitura" já na chamada (antes de qualquer await): uma importação
  // PENDING que não está marcada é tratada como interrompida (ver running.ts).
  return whileReading(params.uploadId, () => readUpload(classifyFile(params.filename, params.mime), params));
}

async function readUpload(
  kind: ReturnType<typeof classifyFile>,
  { userId, uploadId, filename, mime, bytes }: Parameters<typeof processUpload>[0],
): Promise<void> {
  try {
    await prisma.upload.update({
      where: { id: uploadId },
      data: { status: "PARSING", detectedFormat: kind },
    });

    if (kind === "tabular") {
      await processTabular({ userId, uploadId, filename, bytes });
    } else if (kind === "ofx") {
      await processOfx({ userId, uploadId, bytes });
    } else if (kind === "document") {
      await processDocument({ userId, uploadId, filename, mime, bytes });
    } else {
      throw new Error("Formato não suportado. Envie CSV, XLSX, OFX, PDF ou imagem de um extrato/recibo.");
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao processar o arquivo";
    await prisma.upload.update({
      where: { id: uploadId },
      data: { status: "FAILED", error: message },
    });
    throw err;
  }
}

async function processTabular(params: { userId: string; uploadId: string; filename: string; bytes: Buffer }) {
  const { userId, uploadId, bytes } = params;
  const upload = await prisma.upload.findUniqueOrThrow({ where: { id: uploadId } });
  const text = toDelimitedText(params.filename, bytes);

  // Reuse a stored FormatProfile for this exact layout (0 AI calls); else infer.
  const delimiter = detectDelimiter(text);
  const grid = parseDelimited(text, delimiter);
  const headers = grid[0] ?? [];
  const fingerprint = headerFingerprint(headers, delimiter);
  const stored = await prisma.formatProfile.findUnique({ where: { headerFingerprint: fingerprint } });

  const parsed = parseTabular(text, {
    profile: stored ? profileFromRow(stored) : undefined,
  });

  // Persist / bump the profile so next time is deterministic + free.
  await upsertProfile(userId, fingerprint, parsed.profile, headers, Boolean(stored));

  // Banco digitado pelo usuário vale; senão o reconhecido pelo cabeçalho do arquivo.
  const bank = upload.bank ?? parsed.bank;
  if (bank !== upload.bank) await prisma.upload.update({ where: { id: uploadId }, data: { bank } });
  await persistStaged(userId, uploadId, bank, parsed.applied.rows, parsed.applied.errors, true);
}

// OFX: estruturado, sem IA. Banco e moeda vêm do próprio arquivo.
async function processOfx(params: { userId: string; uploadId: string; bytes: Buffer }) {
  const { userId, uploadId, bytes } = params;
  const upload = await prisma.upload.findUniqueOrThrow({ where: { id: uploadId } });
  const parsed = parseOfx(bytes.toString("utf8"));
  const bank = upload.bank ?? parsed.bank;
  if (bank !== upload.bank) await prisma.upload.update({ where: { id: uploadId }, data: { bank } });
  await persistStaged(userId, uploadId, bank, parsed.rows, parsed.errors, true, {
    label: "transação",
    plural: "transações",
    offset: 1,
  });
}

async function processDocument(params: {
  userId: string;
  uploadId: string;
  filename: string;
  mime: string;
  bytes: Buffer;
}) {
  const { userId, uploadId, filename, mime, bytes } = params;
  if (!aiExtractionEnabled) {
    throw new Error(
      "Extração por IA desativada. Defina OPENROUTER_API_KEY, ou use EXTRACTION_PROVIDER=ollama (local, grátis), para importar PDFs/imagens — ou envie o extrato em CSV/XLSX.",
    );
  }
  const upload = await prisma.upload.findUniqueOrThrow({ where: { id: uploadId } });
  const {
    bank: detectedBank,
    rows,
    warnings,
    readFromText,
    readByOcr,
    rowErrors,
  } = await extractDocument({ filename, mime, bytes });
  // PDF lido sem IA (texto por seções, ou imagem por OCR conferida pelo saldo): a tela
  // diz isso em vez de "extraído pela IA".
  if (readFromText || readByOcr) {
    await prisma.upload.update({
      where: { id: uploadId },
      data: { detectedFormat: readByOcr ? "pdf-ocr" : "pdf-text" },
    });
  }
  // Linhas do extrato que a IA pulou ou inventou: erro visível na importação, não silêncio.
  // As do OCR que não fecharam com o saldo vão por linha (e a leitura conta como parcial).
  const errors = [...warnings.map((message) => ({ rowIndex: -1, message, raw: "" })), ...(rowErrors ?? [])];

  // User-provided bank wins; otherwise use what the AI detected from the document.
  const resolvedBank = upload.bank ?? detectedBank;
  if (resolvedBank !== upload.bank) {
    await prisma.upload.update({ where: { id: uploadId }, data: { bank: resolvedBank } });
  }
  await persistStaged(userId, uploadId, resolvedBank, rows, errors, false);
}

// Shared: write staged rows + attach errors to the upload, set STAGED.
// Learned category rules pre-fill categories so the user reviews less each time.
//
// Reimportação idempotente: cada linha é comparada com o que já está gravado —
// primeiro pela chave da linha bruta (CSV/XLSX; sobrevive a correções do leitor),
// depois pela impressão digital (data+valor+descrição). Linha que já existe herda as
// decisões do usuário (categoria, responsável, tipo, transferência interna) e vira
// SAME (igual) ou UPDATE (o arquivo corrige data/valor/descrição…).
//
// Só é "a mesma linha" o que foi gravado por esta fonte (importações com a mesma
// `contentHash`, ou uma transação solta com a mesma chave de linha). Achada por chave ou
// impressão digital mas gravada por OUTRA fonte (extrato sobreposto, banco conectado),
// ela é repetida (DUPLICATE): não entra e a de lá não é tocada.
export async function persistStaged(
  userId: string,
  uploadId: string,
  bank: string | null,
  rows: NormalizedRow[],
  errors: { rowIndex: number; message: string; raw: string }[],
  tabular: boolean,
  rowsAre?: Parameters<typeof summarizeReadErrors>[1],
) {
  const bankKey = bank ?? "";
  const [suggestions, kinds] = await Promise.all([
    suggestCategories(
      userId,
      rows.map((r) => r.description),
    ),
    categoryKinds(userId),
  ]);
  const keys = sourceKeys(rows, tabular);
  const hashes = occurrenceHashes(
    rows.map((r) => dedupeHash({ bank: bankKey, date: r.date, baseAmount: r.baseAmount, description: r.description })),
  );
  const presentKeys = keys.filter((k): k is string => Boolean(k));
  const withSource = { upload: { select: { filename: true, detectedFormat: true } } } as const;
  const [bySource, byHash, lineage] = await Promise.all([
    presentKeys.length
      ? prisma.transaction.findMany({ where: { userId, sourceKey: { in: presentKeys } }, include: withSource })
      : Promise.resolve([]),
    prisma.transaction.findMany({ where: { userId, dedupeHash: { in: hashes } }, include: withSource }),
    lineageUploadIds(userId, uploadId),
  ]);
  const sourceMap = new Map(bySource.map((t) => [t.sourceKey!, t]));
  const hashMap = new Map(byHash.map((t) => [t.dedupeHash, t]));
  const claimed = new Set<string>();
  const found = rows.map((_, i) => {
    let existing = (keys[i] && sourceMap.get(keys[i]!)) || hashMap.get(hashes[i]) || null;
    if (existing && claimed.has(existing.id)) existing = null;
    if (existing) claimed.add(existing.id);
    return existing;
  });
  const isOwn = (t: (typeof found)[number], i: number) =>
    Boolean(t && (t.uploadId ? lineage.has(t.uploadId) : keys[i] && t.sourceKey === keys[i]));
  const own = found.map((t, i) => (isOwn(t, i) ? t : null));
  // O que não é desta fonte pode já estar em Transações vindo de outra (arquivo × banco):
  // a mesma linha exata (acima) ou o mesmo dia inteiro (cross-source.ts).
  const cross = await crossSourceMatches(userId, uploadId, bank, rows, found, claimed);
  found.forEach((t, i) => {
    if (t && !own[i]) cross.set(i, { existingId: t.id, confident: true, tx: t });
  });

  const suggested = (r: NormalizedRow) => (r.type === "TRANSFER" ? null : (suggestions.get(r.description) ?? null));
  const data: Prisma.StagedTransactionCreateManyInput[] = rows.map((r, i) => {
    const existing = own[i];

    const base = {
      uploadId,
      bank,
      date: r.date,
      description: r.description,
      merchantRaw: r.merchantRaw,
      baseCurrency: r.baseCurrency,
      baseAmount: r.baseAmount,
      feeAmount: r.feeAmount,
      state: r.state,
      confidence: 1,
      sourceRowRaw: r.sourceRowRaw,
      sourceKey: keys[i],
      dedupeHash: hashes[i],
      account: r.account ?? null,
      isCard: r.isCard ?? false,
      cardBill: r.cardBill ?? null,
      installment: r.installment ?? null,
    };
    const dup = cross.get(i);
    if (!existing && dup) {
      // Outra fonte já gravou: herda o que o usuário decidiu lá (só para mostrar; ao
      // confirmar, a linha não entra e a transação da outra fonte fica como está).
      return {
        ...base,
        type: r.type,
        isInternalTransfer: dup.tx.isInternalTransfer,
        categoryId: dup.tx.categoryId,
        memberId: dup.tx.memberId,
        duplicateOfId: dup.tx.id,
        match: dup.confident ? ("DUPLICATE" as const) : ("NEW" as const),
        needsReview: !dup.confident,
        reviewReason: duplicateReason(describeOther(dup.tx), dup.confident),
      };
    }
    if (!existing) {
      return {
        ...base,
        type: r.type,
        // Categoria aprendida de movimentação (investimento, entre contas…): já chega fora dos totais.
        isInternalTransfer: internalForSuggested(kinds, suggested(r), r.isInternalTransfer),
        categoryId: suggested(r),
        needsReview: r.needsReview ?? false,
        reviewReason: r.reviewReason ?? null,
        match: "NEW" as const,
      };
    }
    // Já gravada: as decisões do usuário ficam. O tipo só segue o arquivo se o sinal
    // do valor mudou (aí era erro de leitura, não escolha do usuário).
    const signFlipped = new Decimal(r.baseAmount).isNegative() !== existing.baseAmount.isNegative();
    const type = signFlipped ? r.type : existing.type;
    const changed = changedFields({ ...r, type }, existing);
    return {
      ...base,
      type,
      isInternalTransfer: existing.isInternalTransfer,
      categoryId: existing.categoryId,
      memberId: existing.memberId,
      existingTransactionId: existing.id,
      match: changed.length ? ("UPDATE" as const) : ("SAME" as const),
      needsReview: changed.length > 0,
      reviewReason: changed.length ? `Já importada; o arquivo corrige ${changed.join(", ")}` : null,
    };
  });

  await prisma.$transaction([
    prisma.stagedTransaction.deleteMany({ where: { uploadId } }),
    prisma.stagedTransaction.createMany({ data }),
    prisma.upload.update({
      where: { id: uploadId },
      data: {
        status: "STAGED",
        // Linha ilegível (não aviso do documento inteiro): nada desta fonte é removido ao confirmar.
        partialRead: errors.some((e) => e.rowIndex >= 0),
        // rowIndex < 0: aviso do documento inteiro (leitura de PDF), mostrado como veio.
        // Um problema por linha, erros de linha agrupados com o número no arquivo.
        error: summarizeReadErrors(errors, rowsAre),
      },
    }),
  ]);
}

const DAY_MS = 86_400_000;
const dayOf = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Linhas desta importação que já estão em Transações vindas de OUTRA fonte (outro
 * arquivo ou o banco conectado), pelo dia inteiro de cada fonte (ver cross-source.ts).
 * Só no mesmo banco; nunca a linhagem desta importação (essa é a reimportação, tratada
 * pela chave da linha). Sem banco conhecido, não compara.
 */
async function crossSourceMatches(
  userId: string,
  uploadId: string,
  bank: string | null,
  rows: NormalizedRow[],
  own: ({ id: string } | null)[],
  claimed: Set<string>,
): Promise<Map<number, CrossMatch & { tx: CrossCandidate }>> {
  const result = new Map<number, CrossMatch & { tx: CrossCandidate }>();
  const bankKey = canonicalBank(bank);
  const open = rows.map((r, i) => ({ r, i })).filter(({ i }) => !own[i]);
  if (!bankKey || !open.length) return result;

  const upload = await prisma.upload.findUniqueOrThrow({ where: { id: uploadId }, select: { contentHash: true } });
  const times = open.map(({ r }) => Date.parse(`${dayOf(r.date)}T00:00:00Z`));
  const candidates = await prisma.transaction.findMany({
    where: {
      userId,
      id: { notIn: [...claimed] },
      date: { gte: new Date(Math.min(...times)), lt: new Date(Math.max(...times) + DAY_MS) },
      baseCurrency: { in: [...new Set(open.map(({ r }) => r.baseCurrency))] },
      OR: [{ uploadId: null }, { uploadId: { not: uploadId } }],
    },
    select: {
      id: true,
      date: true,
      bank: true,
      baseCurrency: true,
      baseAmount: true,
      description: true,
      categoryId: true,
      memberId: true,
      isInternalTransfer: true,
      upload: { select: { contentHash: true, filename: true, detectedFormat: true } },
    },
  });
  const others = candidates.filter(
    (t) => canonicalBank(t.bank) === bankKey && !(upload.contentHash && t.upload?.contentHash === upload.contentHash),
  );
  if (!others.length) return result;

  // Período de cada fonte (pelas linhas lidas, não só as gravadas) e desta importação:
  // o primeiro e o último dia podem estar pela metade (ver cross-source.ts).
  const hashes = [...new Set(others.map((t) => t.upload?.contentHash).filter((h): h is string => Boolean(h)))];
  const sourceUploads = await prisma.upload.findMany({
    where: { userId, contentHash: { in: hashes }, status: "COMMITTED" },
    select: { id: true, contentHash: true },
  });
  const spans = await prisma.stagedTransaction.groupBy({
    by: ["uploadId"],
    where: { uploadId: { in: sourceUploads.map((u) => u.id) } },
    _min: { date: true },
    _max: { date: true },
  });
  const sources = new Map<string, Coverage>();
  for (const sp of spans) {
    const h = sourceUploads.find((u) => u.id === sp.uploadId)?.contentHash;
    if (!h || !sp._min.date || !sp._max.date) continue;
    const prev = sources.get(h);
    const first = dayOf(sp._min.date);
    const last = dayOf(sp._max.date);
    sources.set(
      h,
      prev
        ? { first: first < prev.first ? first : prev.first, last: last > prev.last ? last : prev.last }
        : { first, last },
    );
  }
  const days = rows.map((r) => dayOf(r.date)).sort();

  const matches = matchAcrossSources(
    open.map(({ r }) => ({
      day: dayOf(r.date),
      currency: r.baseCurrency,
      amount: r.baseAmount,
      description: r.description,
    })),
    others.map((t) => ({
      id: t.id,
      source: t.upload?.contentHash ?? "sem-importacao",
      day: dayOf(t.date),
      currency: t.baseCurrency,
      amount: t.baseAmount.toString(),
      description: t.description,
    })),
    { incoming: { first: days[0], last: days[days.length - 1] }, sources },
  );
  const byId = new Map(others.map((t) => [t.id, t]));
  matches.forEach((m, k) => {
    if (m) result.set(open[k].i, { ...m, tx: byId.get(m.existingId)! });
  });
  return result;
}

type CrossCandidate = {
  id: string;
  description: string;
  categoryId: string | null;
  memberId: string | null;
  isInternalTransfer: boolean;
  upload: { filename: string; detectedFormat: string | null } | null;
};

// --- FormatProfile <-> spec ----------------------------------------------------

function profileFromRow(row: {
  delimiter: string;
  columnRoles: Prisma.JsonValue;
  decimalSeparator: string;
  dateFormat: string;
  defaultCurrency: import("@prisma/client").Currency | null;
}): FormatProfileSpec {
  return {
    delimiter: row.delimiter,
    columnRoles: row.columnRoles as unknown as FormatProfileSpec["columnRoles"],
    decimalSeparator: row.decimalSeparator as FormatProfileSpec["decimalSeparator"],
    dateFormat: row.dateFormat as FormatProfileSpec["dateFormat"],
    signConvention: "negative_is_expense",
    defaultCurrency: row.defaultCurrency,
    confidence: 1,
  };
}

async function upsertProfile(
  userId: string,
  fingerprint: string,
  spec: FormatProfileSpec,
  headers: string[],
  existed: boolean,
) {
  await prisma.formatProfile.upsert({
    where: { headerFingerprint: fingerprint },
    create: {
      userId,
      headerFingerprint: fingerprint,
      delimiter: spec.delimiter,
      columnRoles: spec.columnRoles as unknown as Prisma.InputJsonValue,
      decimalSeparator: spec.decimalSeparator,
      dateFormat: spec.dateFormat,
      signConvention: spec.signConvention,
      defaultCurrency: spec.defaultCurrency,
      source: "AI",
      sampleRaw: headers.join(spec.delimiter),
      hitCount: 1,
    },
    update: { hitCount: { increment: 1 } },
  });
}
