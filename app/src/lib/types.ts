// The API's types, generated from its OpenAPI schema into api.gen.ts (`npm run api:types`).
// Names here are the app's; a change in the backend shows up as a type error.
import type { components } from './api.gen';

type S = components['schemas'];

export type Currency = S['Currency'];
export type Member = S['MemberOut'];
export type Family = S['FamilyOut'];
export type Me = S['MeOut'];
export type TokenPair = S['TokenPair'];
export type Account = S['AccountOut'];

// regular: spending (negative) or income. pending: looks like money to an account of the
// family, waiting for the person to confirm. Only regular counts as spending or income.
export type TxKind = S['TxKind'];

// Amounts are decimals sent as strings: never do arithmetic on them in the app.
export type Transaction = S['TransactionOut'];
export type TransactionPage = S['TransactionPage'];

export type RowStatus = S['PreviewRow']['status'];
export type ImportStatus = S['ImportStatus'];
export type PreviewRow = S['PreviewRow'];
export type GroupCounts = S['GroupCounts'];
export type PreviewGroup = S['PreviewGroup'];
export type ImportPreview = S['ImportPreview'];
export type ImportSummary = S['ImportSummary'];

// Stricter than the schema: either an existing account or a new one, never both.
export type AccountChoice =
  | { currency: Currency; account_id: string }
  | { currency: Currency; new_account: { name: string } };

export type CurrencySummary = S['CurrencySummary'];
export type MonthSummary = S['MonthSummary'];
export type InvestmentProduct = S['InvestmentProduct'];
export type InvestmentMonth = S['InvestmentMonth'];
export type InvestmentTotal = S['InvestmentTotal'];
export type InvestmentOverview = S['InvestmentOverview'];
export type Transfer = S['TransferOut'];
export type TransferOverview = S['TransferOverview'];
