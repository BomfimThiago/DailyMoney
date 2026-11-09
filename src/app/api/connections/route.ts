import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { conflict, handle, json } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";
import { enableBankingEnabled, pluggyEnabled } from "@/lib/env";
import { canonicalBank } from "@/lib/ingest/bank";
import { checkItem } from "@/lib/pluggy/provider";
import { defaultSyncFrom } from "@/lib/bank-sync/sync-from";
import { storedAccounts } from "@/lib/enablebanking/provider";

export const dynamic = "force-dynamic";

const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato AAAA-MM-DD")
  .transform((s) => new Date(`${s}T00:00:00.000Z`))
  .refine((d) => !Number.isNaN(d.getTime()), "Data inválida");

const createSchema = z.object({
  itemId: z.string().trim().uuid("O id da conexão é um código como a1b2c3d4-…; copie de Connected Items"),
  bank: z.string().trim().min(1, "Informe o banco"),
  syncFrom: isoDay.optional(),
});

function safeAccounts(c: { accounts: unknown }) {
  try {
    return storedAccounts(c as Parameters<typeof storedAccounts>[0]);
  } catch {
    return [];
  }
}

/** Bancos conectados, com a revisão de sincronização que estiver aberta. */
export const GET = handle(async () => {
  const user = await requireUser();
  const connections = await prisma.bankConnection.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    include: {
      uploads: {
        where: { status: "STAGED" },
        select: { id: true, filename: true, _count: { select: { staged: true } } },
      },
    },
  });
  return json({
    providers: { pluggy: pluggyEnabled, enablebanking: enableBankingEnabled },
    connections: connections.map(({ uploads, accounts, ...c }) => ({
      ...c,
      // Só o que a tela mostra; o uid da sessão não sai do servidor.
      accounts: safeAccounts({ accounts }).map((a) => ({ label: a.label, currency: a.currency, last4: a.last4 })),
      pendingReviews: uploads
        .filter((u) => u._count.staged > 0)
        .map((u) => ({ uploadId: u.id, filename: u.filename, rows: u._count.staged })),
    })),
  });
});

/**
 * Conecta um banco pela Pluggy: confere o id antes de gravar (os europeus entram pela
 * autorização em /api/connections/enablebanking). Sem data de início, começa
 * no dia seguinte à última transação desse banco que já está no app (o que veio por
 * arquivo não é lido de novo — as descrições do Open Finance são outras e duplicariam).
 */
export const POST = handle(async (req) => {
  const user = await requireUser();
  const body = createSchema.parse(await req.json());
  const bank = canonicalBank(body.bank) ?? body.bank;

  const existing = await prisma.bankConnection.findUnique({
    where: { userId_itemId: { userId: user.id, itemId: body.itemId } },
  });
  if (existing) throw conflict(`Esta conexão já está cadastrada (${existing.bank}).`);

  const { consentExpiresAt } = await checkItem(body.itemId);

  const syncFrom = body.syncFrom ?? (await defaultSyncFrom(user.id, bank));

  const connection = await prisma.bankConnection.create({
    data: { userId: user.id, provider: "pluggy", itemId: body.itemId, bank, syncFrom, consentExpiresAt },
  });
  return json({ connection }, { status: 201 });
});
