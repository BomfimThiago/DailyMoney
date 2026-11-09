import type { z } from "zod";
import { env, pluggyEnabled } from "@/lib/env";
import { HttpError } from "@/lib/http";
import {
  AccountsPage,
  InvestmentsPage,
  PluggyItem,
  TransactionsPage,
  type PluggyAccount,
  type PluggyInvestment,
  type PluggyTransaction,
} from "./schemas";

// Cliente da API da Pluggy (só leitura). A chave de API vale 2h; guardamos por 1h50.

let cached: { apiKey: string; expiresAt: number } | null = null;

function requireConfig() {
  if (!pluggyEnabled) {
    throw new HttpError(
      503,
      "Sincronização de banco desligada: defina PLUGGY_APP_ID e PLUGGY_APP_SECRET no servidor.",
      "BANK_SYNC_DISABLED",
    );
  }
}

async function request(path: string, init: RequestInit = {}): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${env.PLUGGY_API_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });
  } catch (err) {
    throw new HttpError(
      502,
      `Não deu para falar com a Pluggy: ${err instanceof Error ? err.message : err}`,
      "PLUGGY_UNREACHABLE",
    );
  }
  const text = await res.text();
  if (!res.ok) {
    let message = text.slice(0, 200);
    try {
      message = (JSON.parse(text) as { message?: string }).message ?? message;
    } catch {
      /* corpo não-JSON: fica o texto */
    }
    throw new HttpError(res.status === 404 ? 404 : 502, `Pluggy respondeu ${res.status}: ${message}`, "PLUGGY_ERROR");
  }
  return JSON.parse(text);
}

async function apiKey(): Promise<string> {
  requireConfig();
  if (cached && cached.expiresAt > Date.now()) return cached.apiKey;
  const body = (await request("/auth", {
    method: "POST",
    body: JSON.stringify({ clientId: env.PLUGGY_APP_ID, clientSecret: env.PLUGGY_APP_SECRET }),
  })) as { apiKey?: string };
  if (!body.apiKey) throw new HttpError(502, "Pluggy não devolveu a chave de API", "PLUGGY_ERROR");
  cached = { apiKey: body.apiKey, expiresAt: Date.now() + 110 * 60_000 };
  return cached.apiKey;
}

async function get<S extends z.ZodTypeAny>(path: string, schema: S, what: string): Promise<z.infer<S>> {
  const data = await request(path, { headers: { "X-API-KEY": await apiKey() } });
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new HttpError(
      502,
      `Resposta inesperada da Pluggy (${what}): ${issue.path.join(".")} ${issue.message}`,
      "PLUGGY_SHAPE",
    );
  }
  return parsed.data;
}

export async function getItem(itemId: string): Promise<PluggyItem> {
  try {
    return await get(`/items/${encodeURIComponent(itemId)}`, PluggyItem, "conexão");
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) {
      throw new HttpError(
        404,
        "Conexão não encontrada na Pluggy. Use o id que aparece em Applications › sua aplicação › Demo › Connected Items (não o do meu.pluggy.ai).",
        "PLUGGY_ITEM_NOT_FOUND",
      );
    }
    throw err;
  }
}

export async function listAccounts(itemId: string): Promise<PluggyAccount[]> {
  return (await get(`/accounts?itemId=${encodeURIComponent(itemId)}`, AccountsPage, "contas")).results;
}

/** Todas as transações da conta (a Pluggy guarda até 12 meses). A v2 não filtra por data. */
export async function listTransactions(accountId: string): Promise<PluggyTransaction[]> {
  const base = `/v2/transactions?accountId=${encodeURIComponent(accountId)}`;
  const all: PluggyTransaction[] = [];
  let path: string | null = base;
  for (let pages = 0; path; pages++) {
    if (pages >= 200) throw new HttpError(502, "Pluggy: paginação de transações não terminou", "PLUGGY_ERROR");
    const page: z.infer<typeof TransactionsPage> = await get(path, TransactionsPage, "transações");
    all.push(...page.results);
    const next = page.next;
    path = !next
      ? null
      : next.startsWith("http")
        ? next.replace(env.PLUGGY_API_URL, "")
        : `${base}&cursor=${encodeURIComponent(next)}`;
  }
  return all;
}

/** Todos os investimentos da conexão (ativos e já resgatados). */
export async function listInvestments(itemId: string): Promise<PluggyInvestment[]> {
  const all: PluggyInvestment[] = [];
  for (let page = 1; ; page++) {
    if (page > 50) throw new HttpError(502, "Pluggy: paginação de investimentos não terminou", "PLUGGY_ERROR");
    const p = await get(
      `/investments?itemId=${encodeURIComponent(itemId)}&page=${page}&pageSize=500`,
      InvestmentsPage,
      "investimentos",
    );
    all.push(...p.results);
    if (page >= (p.totalPages ?? 1)) return all;
  }
}
