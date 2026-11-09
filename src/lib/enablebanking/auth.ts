import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { badRequest, conflict, forbidden, notFound } from "@/lib/http";
import { canonicalBank } from "@/lib/ingest/bank";
import { defaultSyncFrom } from "@/lib/bank-sync/sync-from";
import { createSession, deleteSession, listAspsps, startAuthorization } from "./client";
import { ebAccountKey, ebAccountLabel } from "./map";
import type { StoredAccount } from "./provider";

// Autorizar um banco europeu: o app pede à Enable Banking um endereço de autorização, o
// usuário entra no banco e aprova, e o banco o devolve ao app com um `code`, que vira a
// sessão com as contas autorizadas. O `state` que vai e volta é assinado pelo app: diz
// quem pediu e o quê (banco, conexão a renovar, data de início) e vale 1 hora.

const secret = new TextEncoder().encode(env.JWT_SECRET);
const AUDIENCE = "enablebanking-auth";
/** PSD2: o banco pode limitar; pedimos o máximo que ele aceita, até 180 dias. */
const MAX_CONSENT_S = 180 * 86_400;

const StateClaims = z.object({
  sub: z.string(),
  bank: z.string(),
  country: z.string(),
  connectionId: z.string().nullish(),
  syncFrom: z.string().nullish(),
});

export async function startBankAuthorization(
  userId: string,
  v: { country: string; bank: string; connectionId?: string; syncFrom?: string },
  redirectUrl: string,
): Promise<{ url: string }> {
  let { country, bank } = v;
  if (v.connectionId) {
    const conn = await prisma.bankConnection.findFirst({ where: { id: v.connectionId, userId } });
    if (!conn) throw notFound("Conexão não encontrada");
    if (conn.provider !== "enablebanking" || !conn.aspspName || !conn.aspspCountry) {
      throw badRequest("Esta conexão não é da Enable Banking.");
    }
    country = conn.aspspCountry;
    bank = conn.aspspName;
  }
  const aspsp = (await listAspsps(country)).find((a) => a.name === bank);
  if (!aspsp) throw badRequest(`${bank} não aparece entre os bancos de ${country} na Enable Banking.`);

  const validity = Math.min(aspsp.maximum_consent_validity || MAX_CONSENT_S, MAX_CONSENT_S);
  const validUntil = new Date(Date.now() + (validity - 300) * 1000);
  const state = await new SignJWT({ bank, country, connectionId: v.connectionId ?? null, syncFrom: v.syncFrom ?? null })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret);
  return startAuthorization({ aspsp: { name: bank, country }, validUntil, state, redirectUrl });
}

async function readState(state: string, userId: string) {
  let payload: unknown;
  try {
    ({ payload } = await jwtVerify(state, secret, { algorithms: ["HS256"], audience: AUDIENCE }));
  } catch {
    throw badRequest("Este retorno do banco venceu ou não é deste app. Comece a conexão de novo.");
  }
  const claims = StateClaims.parse(payload);
  if (claims.sub !== userId) throw forbidden("Esta autorização foi iniciada por outro usuário.");
  return claims;
}

const last4 = (s: string | null | undefined) => {
  const digits = (s ?? "").replace(/\s+/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
};

export interface FinishResult {
  connectionId: string;
  bank: string;
  accounts: number;
  /** true: renovou uma conexão que já existia (mesmo banco). */
  renewed: boolean;
}

/** Volta do banco: troca o `code` pela sessão e grava (ou renova) a conexão. */
export async function finishBankAuthorization(userId: string, code: string, state: string): Promise<FinishResult> {
  const claims = await readState(state, userId);
  const session = await createSession(code);
  if (!session.accounts.length) {
    await deleteSession(session.session_id).catch(() => undefined);
    throw conflict("O banco não autorizou nenhuma conta. Conecte de novo e marque as contas que quer trazer.");
  }
  const accounts: StoredAccount[] = session.accounts.map((a) => ({
    uid: a.uid,
    key: ebAccountKey(a),
    label: ebAccountLabel(a),
    currency: a.currency?.toUpperCase() ?? null,
    last4: last4(a.account_id?.iban ?? a.account_id?.other?.identification),
  }));
  const until = session.access?.valid_until ? new Date(session.access.valid_until) : null;
  const consentExpiresAt = until && !Number.isNaN(until.getTime()) ? until : null;
  const aspspName = session.aspsp.name;
  const aspspCountry = session.aspsp.country;

  // Renovar: a conexão pedida, ou a que já existe para o mesmo banco. Mantém o id, o
  // nome e a data de início; as importações seguem as mesmas (identidade da conta fixa).
  const existing = claims.connectionId
    ? await prisma.bankConnection.findFirst({ where: { id: claims.connectionId, userId, provider: "enablebanking" } })
    : await prisma.bankConnection.findFirst({ where: { userId, provider: "enablebanking", aspspName, aspspCountry } });
  if (existing) {
    await prisma.bankConnection.update({
      where: { id: existing.id },
      data: { itemId: session.session_id, accounts, consentExpiresAt, aspspName, aspspCountry, lastError: null },
    });
    if (existing.itemId !== session.session_id) await deleteSession(existing.itemId).catch(() => undefined);
    return { connectionId: existing.id, bank: existing.bank, accounts: accounts.length, renewed: true };
  }

  const bank = canonicalBank(aspspName) ?? aspspName;
  const syncFrom = claims.syncFrom ? new Date(`${claims.syncFrom}T00:00:00.000Z`) : await defaultSyncFrom(userId, bank);
  const conn = await prisma.bankConnection.create({
    data: {
      userId,
      provider: "enablebanking",
      itemId: session.session_id,
      bank,
      aspspName,
      aspspCountry,
      accounts,
      syncFrom,
      consentExpiresAt,
    },
  });
  return { connectionId: conn.id, bank, accounts: accounts.length, renewed: false };
}
