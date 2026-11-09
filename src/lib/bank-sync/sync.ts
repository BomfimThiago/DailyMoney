import { prisma } from "@/lib/prisma";
import { HttpError, notFound } from "@/lib/http";
import { commitUpload, reimportPlan } from "@/lib/ingest/commit";
import { persistStaged } from "@/lib/ingest/process";
import { pluggyProvider } from "@/lib/pluggy/provider";
import { enableBankingProvider } from "@/lib/enablebanking/provider";
import { failInterruptedReads, startReading, stopReading } from "@/lib/ingest/running";
import { syncInvestments, type InvestmentSyncResult } from "@/lib/investments/save";
import type { BankProvider } from "./types";

// Sincronização de um banco conectado (Pluggy ou Enable Banking). Cada conta do banco é
// tratada como um "arquivo" que se reimporta: mesma `contentHash` a cada sincronização,
// então o que já foi gravado é atualizado (não duplicado), o que o banco apagou some ao
// confirmar, e as escolhas do usuário (categoria, responsável, "Interna") nunca são
// sobrescritas.
//
// Nada é gravado em Transações sem revisão: transação nova ou alterada fica na Revisão.
// Só quando a leitura não muda nada a importação é confirmada sozinha.

export type AccountSyncStatus = "review" | "up-to-date" | "pending-review" | "empty" | "failed";

export interface AccountSyncResult {
  account: string;
  status: AccountSyncStatus;
  uploadId: string | null;
  create: number;
  update: number;
  remove: number;
  /** Já estavam em Transações vindas de um extrato importado: não entram de novo. */
  duplicate: number;
  message?: string;
}

export interface SyncResult {
  connectionId: string;
  bank: string;
  accounts: AccountSyncResult[];
  /** Só quando o serviço informa investimentos (Pluggy). */
  investments?: InvestmentSyncResult;
}

const PROVIDERS: Record<string, BankProvider> = {
  pluggy: pluggyProvider,
  enablebanking: enableBankingProvider,
};

export function providerFor(name: string): BankProvider {
  const p = PROVIDERS[name];
  if (!p) throw new HttpError(500, `Serviço de banco desconhecido: ${name}`, "UNKNOWN_PROVIDER");
  return p;
}

export async function syncConnection(userId: string, connectionId: string): Promise<SyncResult> {
  const conn = await prisma.bankConnection.findFirst({ where: { id: connectionId, userId } });
  if (!conn) throw notFound("Conexão não encontrada");

  const provider = providerFor(conn.provider);
  try {
    const { consentExpiresAt } = await provider.check(conn);
    await prisma.bankConnection.update({ where: { id: conn.id }, data: { consentExpiresAt } });

    const accounts = await provider.accounts(conn);
    const results: AccountSyncResult[] = [];
    for (const account of accounts) {
      const label = account.label;
      const result: AccountSyncResult = {
        account: label,
        status: "empty",
        uploadId: null,
        create: 0,
        update: 0,
        remove: 0,
        duplicate: 0,
      };
      results.push(result);
      try {
        const hash = account.hash;
        // Leitura desta conta interrompida por um reinício: não é revisão aberta.
        await failInterruptedReads(userId, { contentHash: hash });
        // Revisão desta conta ainda aberta: não troca por uma nova (perderia o que o
        // usuário já editou nela). As novidades entram depois que ela for confirmada.
        const open = await prisma.upload.findFirst({
          where: { userId, contentHash: hash, status: { in: ["PENDING", "PARSING", "STAGED"] } },
          include: { _count: { select: { staged: true } } },
        });
        if (open && (open.status !== "STAGED" || open._count.staged > 0)) {
          Object.assign(result, {
            status: "pending-review",
            uploadId: open.id,
            message: "Há uma sincronização desta conta esperando revisão; confirme-a para receber as novidades.",
          });
          continue;
        }
        // Sobras (falhou, ou lida sem linhas): substituídas por esta leitura.
        await prisma.upload.deleteMany({ where: { userId, contentHash: hash, status: { in: ["FAILED", "STAGED"] } } });

        const from = await readFrom(userId, hash, conn.syncFrom);
        const mapped = await account.read(from);
        // De qual conta veio cada linha: o cartão aparece junto na lista de Transações.
        for (const row of mapped.rows) {
          row.account = label;
          row.isCard = account.kind === "card";
        }
        // Nada lido: não cria importação. Também evita apagar o que já está gravado
        // se o banco devolver vazio por um problema de autorização.
        if (!mapped.rows.length && !mapped.errors.length) continue;

        const coversFrom = mapped.earliest && mapped.earliest > from ? mapped.earliest : from;
        const upload = await prisma.upload.create({
          data: {
            userId,
            filename: `${conn.bank} · ${label}`,
            mime: "application/json",
            sizeBytes: 0,
            status: "PARSING",
            detectedFormat: provider.format,
            bank: conn.bank,
            contentHash: hash,
            connectionId: conn.id,
            coversFrom,
          },
        });
        result.uploadId = upload.id;
        startReading(upload.id);
        await persistStaged(userId, upload.id, conn.bank, mapped.rows, mapped.errors, true, {
          label: "transação",
          plural: "transações",
          offset: 1,
        });

        const plan = await reimportPlan(userId, upload.id);
        Object.assign(result, {
          create: plan.create,
          update: plan.update,
          remove: plan.remove,
          duplicate: plan.duplicate,
        });
        if (plan.create + plan.update + plan.remove === 0 && !mapped.errors.length) {
          await commitUpload(userId, upload.id);
          result.status = "up-to-date";
        } else {
          result.status = "review";
        }
      } catch (err) {
        result.status = "failed";
        result.message = err instanceof Error ? err.message : "Falha ao sincronizar a conta";
        if (result.uploadId) {
          await prisma.upload
            .update({ where: { id: result.uploadId }, data: { status: "FAILED", error: result.message } })
            .catch(() => undefined);
        }
      } finally {
        if (result.uploadId) stopReading(result.uploadId);
      }
    }

    const investments = await syncInvestments(userId, conn, provider);

    const failed = results.filter((r) => r.status === "failed").map((r) => `${r.account}: ${r.message}`);
    if (investments?.status === "failed") failed.push(`Investimentos: ${investments.message}`);
    if (investments?.errors.length) failed.push(`Investimentos: ${investments.errors.join("; ")}`);
    await prisma.bankConnection.update({
      where: { id: conn.id },
      data: { lastSyncAt: new Date(), lastError: failed.length ? failed.join(" · ") : null },
    });
    return { connectionId: conn.id, bank: conn.bank, accounts: results, investments };
  } catch (err) {
    // Falha da conexão inteira (autorização, serviço fora): fica registrada e visível.
    const message = err instanceof Error ? err.message : "Falha ao sincronizar";
    await prisma.bankConnection.update({ where: { id: conn.id }, data: { lastError: message } }).catch(() => undefined);
    throw err instanceof HttpError ? err : new HttpError(502, message, "SYNC_FAILED");
  }
}

const OVERLAP_MS = 30 * 86_400_000;

/**
 * De quando ler a conta: depois da primeira sincronização confirmada, só as últimas
 * semanas (desde 30 dias antes dela), não o histórico inteiro de novo. Os bancos
 * europeus só entregam histórico longo logo após a autorização (depois, 90 dias ou
 * recusa), e reler meses a cada dia é trabalho à toa. Os 30 dias de folga pegam o que
 * o banco lançou ou corrigiu com atraso. A importação só cobre esse período, então nada
 * mais antigo é removido.
 */
async function readFrom(userId: string, accountHash: string, syncFrom: Date): Promise<Date> {
  const last = await prisma.upload.findFirst({
    where: { userId, contentHash: accountHash, status: "COMMITTED" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (!last) return syncFrom;
  const recent = new Date(last.createdAt.getTime() - OVERLAP_MS);
  const day = new Date(Date.UTC(recent.getUTCFullYear(), recent.getUTCMonth(), recent.getUTCDate()));
  return day > syncFrom ? day : syncFrom;
}

/** Rotina diária: sincroniza todas as conexões. Uma que falhe não impede as outras. */
export async function syncAll(): Promise<{
  results: SyncResult[];
  failures: { connectionId: string; bank: string; message: string }[];
}> {
  const conns = await prisma.bankConnection.findMany({ orderBy: { createdAt: "asc" } });
  const results: SyncResult[] = [];
  const failures: { connectionId: string; bank: string; message: string }[] = [];
  for (const c of conns) {
    try {
      results.push(await syncConnection(c.userId, c.id));
    } catch (err) {
      failures.push({ connectionId: c.id, bank: c.bank, message: err instanceof Error ? err.message : String(err) });
    }
  }
  return { results, failures };
}
