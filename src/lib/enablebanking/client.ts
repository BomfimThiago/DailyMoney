import { createPrivateKey, type KeyObject } from "node:crypto";
import { readFileSync } from "node:fs";
import { SignJWT } from "jose";
import type { z } from "zod";
import { enableBankingEnabled, env } from "@/lib/env";
import { HttpError, conflict } from "@/lib/http";
import {
  AspspsResponse,
  SessionResponse,
  SessionStatus,
  StartAuthResponse,
  TransactionsPage,
  type Aspsp,
  type EbTransaction,
} from "./schemas";

// Cliente da API da Enable Banking (só leitura de contas). Cada pedido leva um JWT RS256
// assinado com a chave privada da aplicação; o `kid` é o App ID. Vale 1h; guardamos 50 min.

function requireConfig() {
  if (!enableBankingEnabled) {
    throw new HttpError(
      503,
      "Bancos europeus desligados: defina ENABLE_BANKING_APP_ID e a chave da aplicação (ENABLE_BANKING_KEY_FILE ou ENABLE_BANKING_PRIVATE_KEY) no servidor.",
      "ENABLE_BANKING_DISABLED",
    );
  }
}

let key: KeyObject | null = null;
function privateKey(): KeyObject {
  if (key) return key;
  let pem: string;
  try {
    if (env.ENABLE_BANKING_KEY_FILE) pem = readFileSync(env.ENABLE_BANKING_KEY_FILE, "utf8");
    else {
      const v = env.ENABLE_BANKING_PRIVATE_KEY.trim();
      pem = v.includes("-----BEGIN") ? v.replace(/\\n/g, "\n") : Buffer.from(v, "base64").toString("utf8");
    }
    key = createPrivateKey(pem);
  } catch (err) {
    throw new HttpError(
      503,
      `Não deu para ler a chave da Enable Banking: ${err instanceof Error ? err.message : err}. Use o arquivo .pem que o painel baixou ao registrar a aplicação.`,
      "ENABLE_BANKING_KEY",
    );
  }
  return key;
}

let cached: { jwt: string; expiresAt: number } | null = null;
async function token(): Promise<string> {
  requireConfig();
  if (cached && cached.expiresAt > Date.now()) return cached.jwt;
  const now = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: "RS256", typ: "JWT", kid: env.ENABLE_BANKING_APP_ID })
    .setIssuer("enablebanking.com")
    .setAudience("api.enablebanking.com")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey());
  cached = { jwt, expiresAt: Date.now() + 50 * 60_000 };
  return jwt;
}

/** Erro da API → mensagem que diz o que fazer. Sessão vencida/revogada pede nova autorização. */
function apiError(status: number, text: string): HttpError {
  let message = text.slice(0, 200);
  let code = "";
  try {
    const body = JSON.parse(text) as { message?: string; error?: string; detail?: unknown };
    code = body.error ?? "";
    message = body.message ?? message;
    if (typeof body.detail === "string") message = `${message} (${body.detail})`;
  } catch {
    /* corpo não-JSON: fica o texto */
  }
  if (["EXPIRED_SESSION", "CLOSED_SESSION", "REVOKED_SESSION", "UNAUTHORIZED_ACCESS", "ACCESS_DENIED"].includes(code)) {
    return conflict(`O banco não autoriza mais a leitura (${code}). Use "Autorizar de novo".`);
  }
  return new HttpError(
    status === 404 ? 404 : 502,
    `Enable Banking respondeu ${status}${code ? ` ${code}` : ""}: ${message}`,
    "ENABLE_BANKING_ERROR",
  );
}

async function request<S extends z.ZodTypeAny>(
  path: string,
  schema: S,
  what: string,
  init: { method?: string; body?: unknown } = {},
): Promise<z.infer<S>> {
  let res: Response;
  try {
    res = await fetch(`${env.ENABLE_BANKING_API_URL}${path}`, {
      method: init.method ?? "GET",
      headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(60_000),
      cache: "no-store",
    });
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(
      502,
      `Não deu para falar com a Enable Banking: ${err instanceof Error ? err.message : err}`,
      "ENABLE_BANKING_UNREACHABLE",
    );
  }
  const text = await res.text();
  if (!res.ok) throw apiError(res.status, text);
  let data: unknown = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new HttpError(502, `Resposta ilegível da Enable Banking (${what})`, "ENABLE_BANKING_SHAPE");
    }
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new HttpError(
      502,
      `Resposta inesperada da Enable Banking (${what}): ${issue.path.join(".")} ${issue.message}`,
      "ENABLE_BANKING_SHAPE",
    );
  }
  return parsed.data;
}

const banksCache = new Map<string, { at: number; aspsps: Aspsp[] }>();
/** Bancos de um país (guardado 1h: a lista muda pouco). */
export async function listAspsps(country: string): Promise<Aspsp[]> {
  const hit = banksCache.get(country);
  if (hit && Date.now() - hit.at < 3_600_000) return hit.aspsps;
  const res = await request(`/aspsps?country=${encodeURIComponent(country)}`, AspspsResponse, "bancos");
  // Só os que aceitam pessoa física (conta pessoal); sem a informação, fica.
  const aspsps = res.aspsps.filter((a) => !a.psu_types?.length || a.psu_types.includes("personal"));
  banksCache.set(country, { at: Date.now(), aspsps });
  return aspsps;
}

export async function startAuthorization(v: {
  aspsp: { name: string; country: string };
  validUntil: Date;
  state: string;
  redirectUrl: string;
}): Promise<{ url: string }> {
  return request("/auth", StartAuthResponse, "início da autorização", {
    method: "POST",
    body: {
      access: { valid_until: v.validUntil.toISOString() },
      aspsp: v.aspsp,
      state: v.state,
      redirect_url: v.redirectUrl,
      psu_type: "personal",
    },
  });
}

export function createSession(code: string) {
  return request("/sessions", SessionResponse, "sessão", { method: "POST", body: { code } });
}

export function getSession(sessionId: string) {
  return request(`/sessions/${encodeURIComponent(sessionId)}`, SessionStatus, "sessão");
}

export async function deleteSession(sessionId: string): Promise<void> {
  await request(`/sessions/${encodeURIComponent(sessionId)}`, SessionStatus.partial(), "encerrar sessão", {
    method: "DELETE",
  });
}

/** Transações da conta desde `from` (yyyy-mm-dd), seguindo `continuation_key`. */
export async function listTransactions(accountUid: string, from: string): Promise<EbTransaction[]> {
  const base = `/accounts/${encodeURIComponent(accountUid)}/transactions?date_from=${from}`;
  const all: EbTransaction[] = [];
  let next: string | null = null;
  for (let pages = 0; ; pages++) {
    if (pages >= 200)
      throw new HttpError(502, "Enable Banking: paginação de transações não terminou", "ENABLE_BANKING_ERROR");
    const path: string = next ? `${base}&continuation_key=${encodeURIComponent(next)}` : base;
    const page: z.infer<typeof TransactionsPage> = await request(path, TransactionsPage, "transações");
    all.push(...page.transactions);
    next = page.continuation_key || null;
    if (!next) return all;
  }
}
