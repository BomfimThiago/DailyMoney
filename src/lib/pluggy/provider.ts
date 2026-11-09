import { conflict } from "@/lib/http";
import type { BankProvider } from "@/lib/bank-sync/types";
import { getItem, listAccounts, listInvestments, listTransactions } from "./client";
import { mapInvestments } from "./investments";
import { accountLabel, mapAccountTransactions } from "./map";

// Pluggy (Meu Pluggy, Open Finance Brasil) como serviço de banco conectado.

const DAY = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "UTC" });

/** Confere na Pluggy que a conexão existe e está autorizada; devolve o vencimento. */
export async function checkItem(itemId: string): Promise<{ consentExpiresAt: Date | null }> {
  const item = await getItem(itemId);
  const consentExpiresAt = item.consentExpiresAt ? new Date(item.consentExpiresAt) : null;
  if (consentExpiresAt && consentExpiresAt.getTime() < Date.now()) {
    throw conflict(
      `A autorização desta conexão venceu em ${DAY.format(consentExpiresAt)}. Autorize de novo: Dashboard da Pluggy › Demo › Connect Account › MeuPluggy.`,
    );
  }
  if (item.status === "LOGIN_ERROR" || item.error?.code) {
    throw conflict(
      `A Pluggy não consegue ler este banco (${item.error?.code ?? item.status}${item.error?.message ? `: ${item.error.message}` : ""}). Autorize de novo no meu.pluggy.ai.`,
    );
  }
  return { consentExpiresAt };
}

export const pluggyProvider: BankProvider = {
  format: "pluggy",
  check: (conn) => checkItem(conn.itemId),
  async accounts(conn) {
    const accounts = await listAccounts(conn.itemId);
    return accounts.map((account) => ({
      hash: `pluggy:${conn.itemId}:${account.id}`,
      label: accountLabel(account),
      kind: account.type === "CREDIT" ? ("card" as const) : ("account" as const),
      read: async (from) => mapAccountTransactions(account, await listTransactions(account.id), { from }),
    }));
  },
  investments: async (conn) => mapInvestments(await listInvestments(conn.itemId)),
};
