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
  InvestmentOverview,
  MonthDashboard,
  MonthSummary,
  ReviewQueue,
  ReviewResult,
  Transaction,
  TransactionPage,
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

export function uploadStatement(file: PickedFile, defaultCurrency?: Currency) {
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
  return api<ImportPreview>('/imports', { method: 'POST', body: form });
}

export function refreshPreview(
  id: string,
  accounts: Partial<Record<Currency, string | null>>,
  since: string | null,
) {
  return api<ImportPreview>(`/imports/${id}/preview`, {
    method: 'POST',
    body: JSON.stringify({ accounts, since }),
  });
}

export function confirmImport(id: string, accounts: AccountChoice[], since: string | null) {
  return api<ImportSummary>(`/imports/${id}/confirm`, {
    method: 'POST',
    body: JSON.stringify({ accounts, since }),
  });
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

export interface TxFilters {
  q?: string;
  categoryId?: string | null;
  accountId?: string | null;
}

export function listTransactions(
  opts: {
    limit?: number;
    offset?: number;
    month?: string;
    kinds?: TxKind[];
    currency?: Currency;
    // A card's bill (YYYY-MM): its purchases, whatever day they were made.
    cardBill?: string;
  } & TxFilters = {},
) {
  const q = new URLSearchParams({ limit: String(opts.limit ?? 20) });
  const optional = {
    offset: opts.offset ? String(opts.offset) : undefined,
    month: opts.month,
    q: opts.q?.trim(),
    category_id: opts.categoryId,
    account_id: opts.accountId,
    card_bill: opts.cardBill,
    currency: opts.currency,
  };
  for (const [key, value] of Object.entries(optional)) if (value) q.set(key, value);
  for (const k of opts.kinds ?? []) q.append('kind', k);
  return api<TransactionPage>(`/transactions?${q.toString()}`);
}

// With a currency, every amount comes converted into it (ECB rate of each line's day).
export function getSummary(month: string, currency: Currency) {
  return api<MonthSummary>(`/transactions/summary?month=${month}&currency=${currency}`);
}

export function getInvestments(month: string, currency: Currency) {
  return api<InvestmentOverview>(`/transactions/investments?month=${month}&currency=${currency}`);
}

export function getCardBills(month: string, currency: Currency) {
  return api<CardBillsOverview>(`/transactions/card-bills?month=${month}&currency=${currency}`);
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
export function startConnection(bank: string) {
  return api<{ url: string }>('/connections/europe', {
    method: 'POST',
    body: JSON.stringify({ bank }),
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
