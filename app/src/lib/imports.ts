import { api } from './api';
import type { TxPatch } from './txEdit';
import type {
  Analysis,
  Account,
  AccountChoice,
  BankRequest,
  BrazilFinish,
  BrazilStart,
  CardBillsOverview,
  ConnectionsOverview,
  SyncResult,
  Category,
  CategoryCreate,
  CategoryPatch,
  CategoryRule,
  Currency,
  ImportPreview,
  ImportSummary,
  ImportUndone,
  LatestMonth,
  LineCurrencies,
  Portfolio,
  MonthDashboard,
  MonthSummary,
  MovementsOverview,
  PurgeOverview,
  PurgeResult,
  ReviewQueue,
  ReviewResult,
  Transaction,
  TransactionPage,
  TransactionTotals,
  TransferOverview,
  TxKind,
} from './types';

export interface PickedFile {
  name: string;
  uri: string;
  mimeType?: string;
  // Present on web (picker or drag and drop); native sends the file by uri.
  file?: File;
}

// `replaces`: reading again a statement sent before (its lines go when this one is imported).
export function uploadStatement(file: PickedFile, defaultCurrency?: Currency, replaces?: string) {
  const form = new FormData();
  if (file.file) {
    form.append('file', file.file, file.name);
  } else {
    // React Native's FormData takes a {uri, name, type} object for files.
    const part = {
      uri: file.uri,
      name: file.name,
      type: file.mimeType ?? 'application/octet-stream',
    };
    form.append('file', part as unknown as Blob);
  }
  if (defaultCurrency) form.append('default_currency', defaultCurrency);
  if (replaces) form.append('replaces', replaces);
  return api<ImportPreview>('/imports', { method: 'POST', body: form });
}

export function refreshPreview(
  id: string,
  accounts: Partial<Record<Currency, string | null>>,
  since: string | null,
  replaces?: string,
) {
  return api<ImportPreview>(`/imports/${id}/preview`, {
    method: 'POST',
    body: JSON.stringify({ accounts, since, replaces: replaces ?? null }),
  });
}

export function confirmImport(
  id: string,
  accounts: AccountChoice[],
  since: string | null,
  replaces?: string,
) {
  return api<ImportSummary>(`/imports/${id}/confirm`, {
    method: 'POST',
    body: JSON.stringify({ accounts, since, replaces: replaces ?? null }),
  });
}

// Takes a sent statement back, with every line that came from it.
export function undoImport(id: string) {
  return api<ImportUndone>(`/imports/${id}/undo`, { method: 'POST' });
}

// What "Apagar todas as transações" would take away.
export function getPurgeOverview() {
  return api<PurgeOverview>('/transactions/purge');
}

// `expected` is the number the person confirmed: if it changed, nothing is deleted.
export function deleteAllTransactions(expected: number) {
  return api<PurgeResult>(`/transactions?expected=${expected}`, { method: 'DELETE' });
}

// Money that only changed place in the month, and whether it all came back.
export function getMovements(month: string, currency: Currency) {
  return api<MovementsOverview>(`/transactions/movements?month=${month}&currency=${currency}`);
}

export function cancelImport(id: string) {
  return api<ImportSummary>(`/imports/${id}/cancel`, { method: 'POST' });
}

export function listImports() {
  return api<ImportSummary[]>('/imports');
}

export function listAccounts() {
  return api<Account[]>('/accounts');
}

// Several values of one dimension to show, or, with "exclude", to hide.
export type TxPick = { ids: string[]; exclude: boolean };
type PickDim = 'category' | 'member' | 'account' | 'bank';

// The query parameter of each dimension; hiding uses it with "exclude_" in front.
const PICK_PARAMS: Record<PickDim, string> = {
  category: 'category_id',
  member: 'member',
  account: 'account_id',
  bank: 'bank',
};

export interface TxFilters {
  q?: string;
  // One account (a card's bill); the list's menus use picks instead.
  accountId?: string | null;
  // Categoria ("none" = no category), Responsável ("casa" = the household), Conta, Banco.
  picks?: Partial<Record<PickDim, TxPick>>;
  // Gastos ("out") or entradas ("in").
  direction?: 'in' | 'out' | null;
  // Lines of accounts in this currency.
  accountCurrency?: Currency | null;
  // A free period instead of a month: from/to days, "YYYY-MM-DD", both inclusive.
  dateFrom?: string | null;
  dateTo?: string | null;
  // A card's bill (YYYY-MM): its purchases, whatever day they were made.
  cardBill?: string | null;
}

// "date" is by day, newest first; the others sort the whole list by that column.
export type TxSort = 'date' | 'description' | '-description' | 'amount' | '-amount';

type ListQuery = {
  month?: string | null;
  kinds?: TxKind[];
  currency?: Currency;
  sort?: TxSort;
} & TxFilters;

// The filters of the list as query parameters; the totals take exactly the same ones.
function listParams(opts: ListQuery, q = new URLSearchParams()): URLSearchParams {
  const optional = {
    month: opts.month,
    q: opts.q?.trim(),
    account_id: opts.accountId,
    direction: opts.direction,
    account_currency: opts.accountCurrency,
    date_from: opts.dateFrom,
    date_to: opts.dateTo,
    card_bill: opts.cardBill,
    currency: opts.currency,
    sort: opts.sort === 'date' ? null : opts.sort,
  };
  for (const [key, value] of Object.entries(optional)) if (value) q.set(key, value);
  for (const k of opts.kinds ?? []) q.append('kind', k);
  for (const [dim, pick] of Object.entries(opts.picks ?? {}) as [PickDim, TxPick][]) {
    const key = (pick.exclude ? 'exclude_' : '') + PICK_PARAMS[dim];
    for (const id of pick.ids) q.append(key, id);
  }
  return q;
}

export function listTransactions(opts: { limit?: number; offset?: number } & ListQuery = {}) {
  const q = new URLSearchParams({ limit: String(opts.limit ?? 20) });
  if (opts.offset) q.set('offset', String(opts.offset));
  return api<TransactionPage>(`/transactions?${listParams(opts, q).toString()}`);
}

// Entradas and saídas of everything the list shows with these filters, and by group.
export function getTotals(opts: ListQuery) {
  return api<TransactionTotals>(`/transactions/totals?${listParams(opts).toString()}`);
}

// The newest month with spending or income, for opening Transações where the data is.
export function getLatestMonth() {
  return api<LatestMonth>('/transactions/latest-month');
}

export function getLineCurrencies(id: string) {
  return api<LineCurrencies>(`/transactions/${id}/currencies`);
}

// With a currency, every amount comes converted into it (ECB rate of each line's day).
export function getSummary(month: string, currency: Currency) {
  return api<MonthSummary>(`/transactions/summary?month=${month}&currency=${currency}`);
}

export function getCardBills(month: string, currency: Currency) {
  return api<CardBillsOverview>(`/transactions/card-bills?month=${month}&currency=${currency}`);
}

export function getPortfolio(currency: Currency) {
  return api<Portfolio>(`/portfolio?currency=${currency}`);
}

export function getTransfers(month: string) {
  return api<TransferOverview>(`/transactions/transfers?month=${month}`);
}

export function setKind(id: string, kind: Exclude<TxKind, 'pending'>) {
  return api<Transaction>(`/transactions/${id}/kind`, {
    method: 'PUT',
    body: JSON.stringify({ kind }),
  });
}

export function getDashboard(month: string, currency: Currency) {
  return api<MonthDashboard>(`/transactions/dashboard?month=${month}&currency=${currency}`);
}

export function getAnalysis(month: string, months: number, currency: Currency) {
  return api<Analysis>(
    `/transactions/analysis?month=${month}&months=${months}&currency=${currency}`,
  );
}

export function listCategories() {
  return api<Category[]>('/categories');
}

export function createCategory(data: CategoryCreate) {
  return api<Category>('/categories', { method: 'POST', body: JSON.stringify(data) });
}

export function editCategory(id: string, patch: CategoryPatch) {
  return api<Category>(`/categories/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
}

export function deleteCategory(id: string) {
  return api<void>(`/categories/${id}`, { method: 'DELETE' });
}

// Merchants the app learned to send to a category.
export function listCategoryRules(id: string) {
  return api<CategoryRule[]>(`/categories/${id}/rules`);
}

export function deleteCategoryRule(ruleId: string) {
  return api<void>(`/categories/rules/${ruleId}`, { method: 'DELETE' });
}

// "applyToMerchant": the next lines from the same shop get this category too.
export function updateCategory(id: string, categoryId: string, applyToMerchant: boolean) {
  return api<Transaction>(`/transactions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ category_id: categoryId, apply_to_merchant: applyToMerchant }),
  });
}

// Banks someone asked the app to read (Enviar extrato > Bancos suportados).
export function listBankRequests() {
  return api<BankRequest[]>('/bank-requests');
}

export function askForBank(bankName: string, note?: string) {
  return api<BankRequest>('/bank-requests', {
    method: 'POST',
    body: JSON.stringify({ bank_name: bankName, note: note || null }),
  });
}

// Banks read automatically: Wise, Revolut and CaixaBank (Enable Banking) and the
// Brazilian banks (Meu Pluggy).
export function getConnections() {
  return api<ConnectionsOverview>('/connections');
}

// The bank's own page to authorize the app; it comes back to /conexoes/retorno.
// Which connection the authorization is for: an existing one to renew, or a new one
// whose accounts belong to a person (null = the household). Nothing = whoever connects.
export type ConnectionTarget = { connection_id: string } | { member_id: string | null };

export function startConnection(bank: string, target?: ConnectionTarget) {
  return api<{ url: string }>('/connections/europe', {
    method: 'POST',
    body: JSON.stringify({ bank, ...target }),
  });
}

export function finishConnection(code: string, state: string) {
  return api<SyncResult>('/connections/europe/finish', {
    method: 'POST',
    body: JSON.stringify({ code, state }),
  });
}

// The key that opens Pluggy's window, where one Brazilian bank is authorized.
export function startBrazilConnection() {
  return api<BrazilStart>('/connections/brazil', { method: 'POST' });
}

// Pluggy's window made an authorization: the server waits for it to be readable.
export function registerBrazilItem(itemId: string) {
  return api<void>('/connections/brazil/items', {
    method: 'POST',
    body: JSON.stringify({ item_id: itemId }),
  });
}

// Whether the bank authorized in Meu Pluggy is connected yet.
export function finishBrazilConnection() {
  return api<BrazilFinish>('/connections/brazil/finish', { method: 'POST' });
}

export function syncConnection(id: string) {
  return api<SyncResult>(`/connections/${id}/sync`, { method: 'POST' });
}

export function disconnectBank(id: string) {
  return api<void>(`/connections/${id}`, { method: 'DELETE' });
}

// Corrects a line: description, date and/or signed amount (only what changed).
export function updateTransaction(id: string, patch: TxPatch) {
  return api<Transaction>(`/transactions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function deleteTransaction(id: string) {
  return api<void>(`/transactions/${id}`, { method: 'DELETE' });
}

// Imported lines waiting for approval, by upload or bank read (any month).
export function getReviewQueue(currency: Currency) {
  return api<ReviewQueue>(`/transactions/review?currency=${currency}`);
}

// Approve (the lines start counting) or turn down (hidden for good) imported lines.
export function decideReview(ids: string[], decision: 'approve' | 'reject') {
  return api<ReviewResult>('/transactions/review', {
    method: 'POST',
    body: JSON.stringify({ ids, decision }),
  });
}
