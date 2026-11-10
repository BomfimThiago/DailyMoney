import { api } from './api';
import type {
  Account,
  AccountChoice,
  Currency,
  ImportPreview,
  ImportSummary,
  TransactionPage,
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

export function listTransactions(limit = 20) {
  return api<TransactionPage>(`/transactions?limit=${limit}`);
}
