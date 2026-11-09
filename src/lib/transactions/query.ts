import type { Prisma, Currency } from "@prisma/client";

export interface TxFilters {
  from?: Date;
  to?: Date;
  baseCurrency?: Currency;
  type?: "EXPENSE" | "INCOME" | "TRANSFER";
  categoryId?: string;
  memberId?: string;
  bank?: string;
  /** Conta do banco ("Cartão de crédito"…), com `bank`: as compras de um cartão. */
  account?: string;
  /** Só compras do cartão ("only") ou tudo menos elas ("exclude"). */
  card?: "only" | "exclude";
  includeInternal: boolean;
  search?: string;
}

// Build a Prisma where clause from filters. Internal transfers are excluded by
// default so household totals aren't inflated by money moving between own accounts.
export function buildWhere(userId: string, f: TxFilters): Prisma.TransactionWhereInput {
  const where: Prisma.TransactionWhereInput = { userId };
  if (f.from || f.to) {
    where.date = {};
    if (f.from) where.date.gte = f.from;
    if (f.to) where.date.lte = f.to;
  }
  if (f.baseCurrency) where.baseCurrency = f.baseCurrency;
  if (f.type) where.type = f.type;
  if (f.categoryId) where.categoryId = f.categoryId;
  if (f.memberId) where.memberId = f.memberId;
  if (f.bank) where.bank = f.bank;
  if (f.account) where.account = f.account;
  if (f.card) where.isCard = f.card === "only";
  if (!f.includeInternal) where.isInternalTransfer = false;
  if (f.search) where.description = { contains: f.search, mode: "insensitive" };
  return where;
}

export function amountField(display: Currency): "amountBRL" | "amountUSD" | "amountEUR" {
  return display === "BRL" ? "amountBRL" : display === "USD" ? "amountUSD" : "amountEUR";
}

/**
 * Datas de filtro são dias de lançamento, gravados à meia-noite UTC. Um horário sem
 * fuso ("2026-10-31T23:59:59") é lido como UTC — antes era lido no fuso do servidor e,
 * em UTC−3, o fim de outubro ia até 02:59 UTC de 1º/11, puxando o dia 1º do mês
 * seguinte para o mês anterior (e inflando os totais).
 */
export function parseFilterDate(v: string | null): Date | undefined {
  if (!v) return undefined;
  const hasTime = /T\d{2}:\d{2}/.test(v);
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/i.test(v);
  const d = new Date(hasTime && !hasZone ? `${v}Z` : v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

const asCard = (v: string | null): TxFilters["card"] => (v === "only" || v === "exclude" ? v : undefined);

export function parseFilters(searchParams: URLSearchParams): TxFilters {
  const toDate = parseFilterDate;
  const asCur = (v: string | null) => (v === "BRL" || v === "USD" || v === "EUR" ? (v as Currency) : undefined);
  const asType = (v: string | null) => (v === "EXPENSE" || v === "INCOME" || v === "TRANSFER" ? v : undefined);
  return {
    from: toDate(searchParams.get("from")),
    to: toDate(searchParams.get("to")),
    baseCurrency: asCur(searchParams.get("baseCurrency")),
    type: asType(searchParams.get("type")) as TxFilters["type"],
    categoryId: searchParams.get("categoryId") || undefined,
    memberId: searchParams.get("memberId") || undefined,
    bank: searchParams.get("bank") || undefined,
    account: searchParams.get("account") || undefined,
    card: asCard(searchParams.get("card")),
    includeInternal: searchParams.get("includeInternal") === "true",
    search: searchParams.get("search") || undefined,
  };
}

// --- Paginação e ordenação da lista -------------------------------------------

export const PAGE_SIZE = 50;
/** Teto de uma página. O Resumo pede um mês inteiro de uma vez (e avisa se passar). */
export const MAX_PAGE_SIZE = 1000;

export type ListSort = { key: "value" | "description"; dir: "asc" | "desc" } | null;

export interface ListPage {
  limit: number;
  offset: number;
  sort: ListSort;
  lens: Currency;
}

/** `limit`/`offset` (inteiros, com teto), `sort=value:asc|description:desc` e `lens` (moeda do valor). */
export function parseListPage(searchParams: URLSearchParams): ListPage {
  const int = (v: string | null, def: number) => {
    const n = v === null ? NaN : Number(v);
    return Number.isInteger(n) && n >= 0 ? n : def;
  };
  const limit = Math.min(Math.max(int(searchParams.get("limit"), PAGE_SIZE), 1), MAX_PAGE_SIZE);
  const offset = int(searchParams.get("offset"), 0);
  const m = /^(value|description):(asc|desc)$/.exec(searchParams.get("sort") ?? "");
  const sort: ListSort = m ? { key: m[1] as "value" | "description", dir: m[2] as "asc" | "desc" } : null;
  const l = searchParams.get("lens");
  const lens: Currency = l === "BRL" || l === "USD" || l === "EUR" ? l : "EUR";
  return { limit, offset, sort, lens };
}

/**
 * Ordem da lista, sempre com desempate por `id`: com paginação por offset, uma ordem
 * sem desempate pode repetir ou pular linhas de mesmo dia/valor entre uma página e outra.
 */
export function listOrderBy(page: ListPage): Prisma.TransactionOrderByWithRelationInput[] {
  if (!page.sort) return [{ date: "desc" }, { createdAt: "desc" }, { id: "desc" }];
  const field = page.sort.key === "description" ? "description" : amountField(page.lens);
  return [{ [field]: page.sort.dir }, { date: "desc" }, { id: "desc" }];
}
