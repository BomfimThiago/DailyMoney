// Tipos do que a API devolve (JSON). Valores monetários chegam como string
// decimal (Prisma Decimal serializado) — nunca convertidos para number.

export type Currency = "BRL" | "USD" | "EUR";
export type TxType = "EXPENSE" | "INCOME" | "TRANSFER";

export interface Member {
  id: string;
  name: string;
  kind: "ME" | "SPOUSE" | "FAMILY" | "OTHER";
  color: string;
}

export interface Category {
  id: string;
  name: string;
  /** TRANSFER = movimentação: dinheiro que só muda de lugar, fora de Gastos e Entradas. */
  kind: "EXPENSE" | "INCOME" | "TRANSFER";
  color: string;
  icon: string | null;
  isDefault: boolean;
}

export interface Transaction {
  id: string;
  date: string;
  description: string;
  merchantRaw: string | null;
  type: TxType;
  state: "COMPLETED" | "PENDING";
  isInternalTransfer: boolean;
  baseCurrency: Currency;
  /** Sinal no próprio valor: gasto negativo, entrada positiva. */
  baseAmount: string;
  amountBRL: string;
  amountUSD: string;
  amountEUR: string;
  feeAmount: string;
  fxRateDate: string | null;
  fxSource: string | null;
  manualFxOverride: boolean;
  bank: string | null;
  /** Conta do banco conectado ("Conta corrente", "Cartão de crédito"). */
  account: string | null;
  /** Compra no cartão de crédito. */
  isCard: boolean;
  /** Mês da fatura (yyyy-mm). */
  cardBill: string | null;
  /** Parcela ("3/10"). */
  installment: string | null;
  uploadId: string | null;
  categoryId: string | null;
  memberId: string | null;
  category: Category | null;
  member: Member | null;
}

export interface TransactionTotals {
  type: TxType;
  _sum: { amountBRL: string | null; amountUSD: string | null; amountEUR: string | null };
}

type CurrencySums = { amountBRL: string | null; amountUSD: string | null; amountEUR: string | null };

/** Uma página da lista. Totais, pendentes e totais por dia valem para TODO o período filtrado. */
export interface TransactionPage {
  transactions: Transaction[];
  /** Quantas transações o período/filtro tem ao todo. */
  total: number;
  offset: number;
  limit: number;
  totals: TransactionTotals[];
  pending: { count: number; _sum: CurrencySums };
  /** Total de cada dia que aparece nesta página (dia inteiro, não só as linhas carregadas). */
  dayTotals: { day: string; _sum: CurrencySums }[];
  /** Com `groupCards`: as compras de cada cartão no período, fora das linhas. */
  cards: CardGroup[];
}

/** As compras de um cartão no período: uma linha na lista que abre todas elas. */
export interface CardGroup {
  bank: string | null;
  account: string | null;
  count: number;
  _sum: CurrencySums;
}

export type TransactionSort = { key: "value" | "description"; dir: "asc" | "desc" } | null;

export interface TransactionFilters {
  from?: string;
  to?: string;
  type?: TxType;
  baseCurrency?: Currency;
  categoryId?: string;
  memberId?: string;
  bank?: string;
  account?: string;
  /** "only": só compras do cartão; "exclude": tudo menos elas. */
  card?: "only" | "exclude";
  search?: string;
  includeInternal?: boolean;
}

export interface TransactionPatch {
  date?: string;
  description?: string;
  type?: TxType;
  baseCurrency?: Currency;
  /** String decimal ("412,90" ou "412.90"). */
  baseAmount?: string;
  categoryId?: string | null;
  memberId?: string | null;
  isInternalTransfer?: boolean;
}

export interface SummaryRow {
  month: string; // "2026-08"
  type: TxType;
  brl: string;
  usd: string;
  eur: string;
  count: number;
}

export type UploadStatus = "PENDING" | "PARSING" | "STAGED" | "COMMITTED" | "FAILED";

export interface Upload {
  id: string;
  filename: string;
  mime: string;
  sizeBytes: number;
  status: UploadStatus;
  detectedFormat: string | null;
  bank: string | null;
  error: string | null;
  createdAt: string;
  _count?: { staged: number; transactions: number };
}

export interface StagedTransaction {
  id: string;
  uploadId: string;
  date: string;
  description: string;
  merchantRaw: string | null;
  type: TxType;
  baseCurrency: Currency;
  baseAmount: string;
  feeAmount: string;
  state: "COMPLETED" | "PENDING";
  isInternalTransfer: boolean;
  confidence: number;
  needsReview: boolean;
  reviewReason: string | null;
  categoryId: string | null;
  memberId: string | null;
  bank: string | null;
  /**
   * NEW: será criada · SAME: já existe igual · UPDATE: já existe e o arquivo corrige ·
   * DUPLICATE: já está em Transações vinda de outra fonte (arquivo × banco), não entra.
   */
  match: "NEW" | "SAME" | "UPDATE" | "DUPLICATE";
  existingTransactionId: string | null;
  /** Transação de outra fonte que parece ser esta linha (DUPLICATE, ou NEW para o usuário decidir). */
  duplicateOfId: string | null;
}

/** O que confirmar a importação vai fazer (reimportação idempotente). */
export interface ReimportPlan {
  previous: { id: string; filename: string; createdAt: string }[];
  create: number;
  update: number;
  same: number;
  remove: number;
  duplicate: number;
}

export type StagedPatch = Partial<
  Pick<
    StagedTransaction,
    "type" | "categoryId" | "memberId" | "isInternalTransfer" | "baseCurrency" | "description" | "date"
  >
> & { baseAmount?: string; match?: "NEW" | "DUPLICATE" };

export interface CommitResult {
  committed: number;
  updated: number;
  unchanged: number;
  removed: number;
  skippedDuplicates: number;
  failed: { description: string; message: string }[];
}

// --- Bancos conectados (Pluggy no Brasil, Enable Banking na Europa) ------------

export type BankProviderName = "pluggy" | "enablebanking";

export interface BankConnection {
  id: string;
  provider: BankProviderName;
  bank: string;
  itemId: string;
  /** Enable Banking: o banco na API (para autorizar de novo). */
  aspspName: string | null;
  aspspCountry: string | null;
  /** Enable Banking: contas autorizadas. Pluggy: vazio (as contas vêm a cada leitura). */
  accounts: { label: string; currency: string | null; last4: string | null }[];
  syncFrom: string;
  consentExpiresAt: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  createdAt: string;
  /** Sincronizações desta conexão esperando revisão. */
  pendingReviews: { uploadId: string; filename: string; rows: number }[];
}

/** Banco europeu disponível na Enable Banking. */
export interface EuropeanBank {
  name: string;
  country: string;
  logo: string | null;
  beta: boolean;
}

export interface BankAuthorizationResult {
  connectionId: string;
  bank: string;
  accounts: number;
  renewed: boolean;
}

export type AccountSyncStatus = "review" | "up-to-date" | "pending-review" | "empty" | "failed";

export interface SyncResult {
  connectionId: string;
  bank: string;
  accounts: {
    account: string;
    status: AccountSyncStatus;
    uploadId: string | null;
    create: number;
    update: number;
    remove: number;
    duplicate: number;
    message?: string;
  }[];
  /** Só nos bancos que informam investimentos (Pluggy). */
  investments?: { status: "ok" | "failed"; open: number; errors: string[]; message?: string };
}

/** Uma fatura do cartão: total das compras (sem os pagamentos) e quantas são. */
export interface CardBillTotal {
  /** yyyy-mm */
  month: string;
  count: number;
  _sum: CurrencySums | null;
}

/** As faturas de um cartão vistas de um mês: a deste mês, o que foi pago nele e a próxima. */
export interface CardBills {
  bank: string | null;
  account: string | null;
  bill: CardBillTotal;
  next: CardBillTotal;
  paid: { date: string; _sum: CurrencySums }[];
}

export interface CardBillsResponse {
  month: string;
  /** false: nenhuma compra tem mês de fatura ainda (importadas antes; a próxima sincronização preenche). */
  billsKnown: boolean;
  cards: CardBills[];
}

/** Movimentações de um grupo no mês (categoria de movimentação, ou sem categoria). */
export interface MovementGroup {
  /** id da categoria, ou "none". */
  key: string;
  category: { id: string; name: string; color: string; icon: string | null } | null;
  out: { count: number; _sum: CurrencySums | null };
  in: { count: number; _sum: CurrencySums | null };
}

export interface MovementsResponse {
  month: string;
  groups: MovementGroup[];
}

/** Investimento aberto de um banco conectado (valores em string decimal). */
export interface InvestmentPosition {
  id: string;
  bank: string;
  name: string;
  /** FIXED_INCOME | SECURITY | MUTUAL_FUND | EQUITY | ETF | COE | OTHER */
  type: string;
  subtype: string | null;
  issuer: string | null;
  code: string | null;
  currency: Currency;
  balance: string;
  balanceBRL: string;
  balanceUSD: string;
  balanceEUR: string;
  amountOriginal: string | null;
  rate: string | null;
  rateType: string | null;
  fixedAnnualRate: string | null;
  /** ISO */
  dueDate: string | null;
  status: string;
  /** ISO: dia a que o saldo se refere. */
  valueDate: string;
}

export interface InvestmentsResponse {
  positions: InvestmentPosition[];
  /** Resgatados ou que o banco deixou de informar. */
  closed: number;
  /** ISO: o dia mais recente dos saldos. */
  valueDate: string | null;
}
