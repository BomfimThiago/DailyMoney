export type Currency = 'BRL' | 'USD' | 'EUR';

export interface Member {
  id: string;
  name: string;
  color: string;
  user_id: string | null;
}

export interface Family {
  id: string;
  name: string;
  display_currency: Currency;
  month_start_day: number;
  members: Member[];
}

export interface Me {
  id: string;
  email: string;
  name: string;
  picture_url: string | null;
  family: Family;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
}

export interface Account {
  id: string;
  name: string;
  bank: string;
  currency: Currency;
  is_card: boolean;
  member_id: string | null;
}

export interface Transaction {
  id: string;
  date: string;
  description: string;
  // Decimal from the API, as a string: never do arithmetic on it in the app.
  amount: string;
  currency: Currency;
  is_transfer: boolean;
  account_id: string;
  account_name: string;
  category_id: string | null;
  category_name: string | null;
  member_id: string | null;
}

export interface TransactionPage {
  total: number;
  items: Transaction[];
}

export type RowStatus = 'new' | 'duplicate' | 'transfer' | 'skipped';
export type ImportStatus = 'preview' | 'imported' | 'cancelled';

export interface PreviewRow {
  index: number;
  date: string;
  description: string;
  amount: string;
  currency: Currency;
  category: string | null;
  status: RowStatus;
}

export interface GroupCounts {
  new: number;
  duplicate: number;
  transfer: number;
  skipped: number;
}

export interface PreviewGroup {
  currency: Currency;
  account: { id: string; name: string } | null;
  suggested_name: string;
  first_import: boolean;
  counts: GroupCounts;
}

export interface ImportPreview {
  id: string;
  filename: string;
  format: string;
  bank: string | null;
  is_card: boolean;
  status: ImportStatus;
  period_start: string | null;
  period_end: string | null;
  needs_currency: boolean;
  groups: PreviewGroup[];
  rows: PreviewRow[];
  errors: { row: number; message: string }[];
}

export interface ImportSummary {
  id: string;
  filename: string;
  format: string;
  bank: string | null;
  status: ImportStatus;
  period_start: string | null;
  period_end: string | null;
  imported_count: number;
  duplicate_count: number;
  transfer_count: number;
  skipped_count: number;
  created_at: string;
  finished_at: string | null;
}

export type AccountChoice =
  | { currency: Currency; account_id: string }
  | { currency: Currency; new_account: { name: string } };
