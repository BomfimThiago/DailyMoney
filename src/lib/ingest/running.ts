import { prisma } from "@/lib/prisma";

// Leituras em andamento NESTE processo. A leitura de um arquivo (PDF pela IA leva até
// 40 min) e a de um banco conectado rodam dentro do servidor; se ele reinicia no meio
// (deploy), a importação ficava "lendo" para sempre: a tela consultava sem fim e a
// sincronização da conta dizia "esperando revisão" sem nada para revisar.
//
// Uma importação PENDING/PARSING que não está aqui e não muda há um minuto foi
// interrompida: vira FAILED com o motivo, e dá para reprocessar ou sincronizar de novo.
// O conjunto fica no `globalThis` para ser um só mesmo com rotas em pacotes separados.

const g = globalThis as unknown as { __dailyMoneyReading?: Set<string> };
const reading: Set<string> = (g.__dailyMoneyReading ??= new Set());

const GRACE_MS = 60_000;

export const INTERRUPTED =
  "A leitura foi interrompida no meio (o servidor reiniciou). Reprocesse o arquivo ou sincronize de novo.";

/** Marca a importação como em leitura enquanto `work` roda. */
export async function whileReading<T>(uploadId: string, work: () => Promise<T>): Promise<T> {
  reading.add(uploadId);
  try {
    return await work();
  } finally {
    reading.delete(uploadId);
  }
}

export function startReading(uploadId: string): void {
  reading.add(uploadId);
}

export function stopReading(uploadId: string): void {
  reading.delete(uploadId);
}

/** Leituras órfãs (de antes de um reinício) do usuário viram FAILED. Devolve quantas. */
export async function failInterruptedReads(userId: string, where: { contentHash?: string } = {}): Promise<number> {
  const { count } = await prisma.upload.updateMany({
    where: {
      userId,
      ...where,
      status: { in: ["PENDING", "PARSING"] },
      id: { notIn: [...reading] },
      updatedAt: { lt: new Date(Date.now() - GRACE_MS) },
    },
    data: { status: "FAILED", error: INTERRUPTED },
  });
  return count;
}
