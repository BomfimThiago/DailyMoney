import type { BankConnection } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { convertToAllCurrencies } from "@/lib/fx/service";
import type { BankProvider, MappedInvestment } from "@/lib/bank-sync/types";

// Investimentos de um banco conectado: a cada sincronização, a posição de cada um é
// atualizada (não duplicada: id do serviço + conexão) e o saldo do dia vira um ponto do
// histórico. São saldos, não transações: não passam pela Revisão.

export interface InvestmentSyncResult {
  status: "ok" | "failed";
  /** Posições abertas (ativas ou em validação) depois desta leitura. */
  open: number;
  /** Posições que não deu para ler (nome: motivo). */
  errors: string[];
  message?: string;
}

const OPEN = ["ACTIVE", "PENDING"];

export async function saveInvestments(
  userId: string,
  conn: Pick<BankConnection, "id" | "bank">,
  read: { positions: MappedInvestment[]; errors: string[] },
): Promise<InvestmentSyncResult> {
  for (const p of read.positions) {
    const conv = await convertToAllCurrencies(p.balance, p.currency, p.valueDate);
    const balances = { balanceBRL: conv.amountBRL, balanceUSD: conv.amountUSD, balanceEUR: conv.amountEUR };
    const data = {
      bank: conn.bank,
      name: p.name,
      type: p.type,
      subtype: p.subtype,
      issuer: p.issuer,
      code: p.code,
      currency: p.currency,
      balance: p.balance,
      ...balances,
      amountOriginal: p.amountOriginal,
      rate: p.rate,
      rateType: p.rateType,
      fixedAnnualRate: p.fixedAnnualRate,
      dueDate: p.dueDate,
      status: p.status,
      valueDate: p.valueDate,
    };
    const saved = await prisma.investment.upsert({
      where: { connectionId_externalId: { connectionId: conn.id, externalId: p.externalId } },
      create: { userId, connectionId: conn.id, externalId: p.externalId, ...data },
      update: data,
    });
    // Ponto do histórico: só de quem tem saldo (o resgatado fica em zero para sempre).
    if (OPEN.includes(p.status) || !p.balance.isZero()) {
      await prisma.investmentSnapshot.upsert({
        where: { investmentId_date: { investmentId: saved.id, date: p.valueDate } },
        create: { investmentId: saved.id, date: p.valueDate, balance: p.balance, ...balances },
        update: { balance: p.balance, ...balances },
      });
    }
  }

  // O banco parou de informar uma posição: deixa de contar como aberta (fica o histórico).
  // Só com uma leitura completa: vazia ou com posição ilegível pode ser falha do serviço.
  if (read.positions.length && !read.errors.length) {
    await prisma.investment.updateMany({
      where: {
        connectionId: conn.id,
        externalId: { notIn: read.positions.map((p) => p.externalId) },
        status: { not: "GONE" },
      },
      data: { status: "GONE" },
    });
  }

  const open = await prisma.investment.count({ where: { connectionId: conn.id, status: { in: OPEN } } });
  return { status: "ok", open, errors: read.errors };
}

/** Lê e grava os investimentos de uma conexão; uma falha fica no resultado, não derruba a sincronização. */
export async function syncInvestments(
  userId: string,
  conn: BankConnection,
  provider: BankProvider,
): Promise<InvestmentSyncResult | undefined> {
  if (!provider.investments) return undefined;
  try {
    return await saveInvestments(userId, conn, await provider.investments(conn));
  } catch (err) {
    return {
      status: "failed",
      open: 0,
      errors: [],
      message: err instanceof Error ? err.message : "Falha ao ler os investimentos",
    };
  }
}
