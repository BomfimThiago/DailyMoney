import { z } from "zod";
import type { BankConnection } from "@prisma/client";
import { conflict } from "@/lib/http";
import type { BankProvider, SyncAccount } from "@/lib/bank-sync/types";
import { deleteSession, getSession, listTransactions } from "./client";
import { mapEbTransactions } from "./map";

// Enable Banking (Open Banking na Europa, modo restrito) como serviço de banco conectado.
// A conexão guarda a sessão autorizada e as contas dela: o `uid` de cada conta só vale
// nessa sessão; o `key` (hash da identificação da conta) é o mesmo em todas, e é ele que
// identifica as importações, para que autorizar de novo não duplique nada.

export const StoredAccount = z.object({
  uid: z.string(),
  key: z.string(),
  label: z.string(),
  currency: z.string().nullable(),
  /** Últimos 4 dígitos do IBAN, para distinguir contas na tela. */
  last4: z.string().nullable(),
});
export type StoredAccount = z.infer<typeof StoredAccount>;

export function storedAccounts(conn: Pick<BankConnection, "accounts">): StoredAccount[] {
  const parsed = z.array(StoredAccount).safeParse(conn.accounts ?? []);
  if (!parsed.success) throw conflict('As contas desta conexão estão ilegíveis. Use "Autorizar de novo".');
  return parsed.data;
}

const SUPPORTED = new Set(["BRL", "EUR", "USD"]);
const DAY = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "UTC" });
const STATUS: Record<string, string> = {
  EXPIRED: "venceu",
  REVOKED: "foi revogada no banco",
  CLOSED: "foi encerrada",
  CANCELLED: "foi cancelada",
  INVALID: "não vale mais",
  PENDING_AUTHORIZATION: "não foi concluída",
  RETURNED_FROM_BANK: "não foi concluída",
};

/** Nomes distintos para contas do mesmo tipo: "Conta corrente EUR", "Conta corrente USD"… */
function labels(accounts: StoredAccount[]): string[] {
  const count = (xs: string[]) => xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>());
  let out = accounts.map((a) => a.label);
  let c = count(out);
  out = out.map((l, i) => (c.get(l)! > 1 && accounts[i].currency ? `${l} ${accounts[i].currency}` : l));
  c = count(out);
  return out.map((l, i) => (c.get(l)! > 1 && accounts[i].last4 ? `${l} ••${accounts[i].last4}` : l));
}

export const enableBankingProvider: BankProvider = {
  format: "enablebanking",

  async check(conn) {
    const s = await getSession(conn.itemId);
    const until = s.access?.valid_until ? new Date(s.access.valid_until) : null;
    const consentExpiresAt = until && !Number.isNaN(until.getTime()) ? until : null;
    if (s.status !== "AUTHORIZED") {
      throw conflict(
        `A autorização do ${conn.bank} ${STATUS[s.status] ?? `está ${s.status}`}. Use "Autorizar de novo".`,
      );
    }
    if (consentExpiresAt && consentExpiresAt.getTime() < Date.now()) {
      throw conflict(
        `A autorização do ${conn.bank} venceu em ${DAY.format(consentExpiresAt)}. Use "Autorizar de novo".`,
      );
    }
    return { consentExpiresAt };
  },

  async accounts(conn): Promise<SyncAccount[]> {
    const accounts = storedAccounts(conn);
    const names = labels(accounts);
    return accounts.map((a, i) => ({
      hash: `enablebanking:${a.key}`,
      label: names[i],
      kind: a.label.startsWith("Cartão") ? ("card" as const) : ("account" as const),
      async read(from) {
        if (a.currency && !SUPPORTED.has(a.currency.toUpperCase())) {
          throw new Error(`Conta em ${a.currency}: o app só trabalha com BRL, EUR e USD`);
        }
        const txs = await listTransactions(a.uid, from.toISOString().slice(0, 10));
        return mapEbTransactions(a, txs, { from });
      },
    }));
  },

  revoke: (conn) => deleteSession(conn.itemId),
};
