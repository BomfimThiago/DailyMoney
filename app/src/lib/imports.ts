import { api } from './api';
import type {
  Account,
  AccountChoice,
  Category,
  Currency,
  ImportPreview,
  ImportSummary,
  InvestmentOverview,
  MonthDashboard,
  MonthSummary,
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
  opts: { limit?: number; offset?: number; month?: string; kinds?: TxKind[] } & TxFilters = {},
) {
  const q = new URLSearchParams({ limit: String(opts.limit ?? 20) });
  if (opts.offset) q.set('offset', String(opts.offset));
  if (opts.month) q.set('month', opts.month);
  if (opts.q?.trim()) q.set('q', opts.q.trim());
  if (opts.categoryId) q.set('category_id', opts.categoryId);
  if (opts.accountId) q.set('account_id', opts.accountId);
  for (const k of opts.kinds ?? []) q.append('kind', k);
  return api<TransactionPage>(`/transactions?${q.toString()}`);
}

export function getSummary(month: string) {
  return api<MonthSummary>(`/transactions/summary?month=${month}`);
}

export function getInvestments(month: string) {
  return api<InvestmentOverview>(`/transactions/investments?month=${month}`);
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

export function getDashboard(month: string) {
  return api<MonthDashboard>(`/transactions/dashboard?month=${month}`);
}

export function listCategories() {
  return api<Category[]>('/categories');
}

// "applyToMerchant": the next lines from the same shop get this category too.
export function updateCategory(id: string, categoryId: string, applyToMerchant: boolean) {
  return api<Transaction>(`/transactions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ category_id: categoryId, apply_to_merchant: applyToMerchant }),
  });
}
