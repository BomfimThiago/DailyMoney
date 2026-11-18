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
export type Category = S['CategoryOut'];
export type CategoryCreate = S['CategoryCreate'];
export type CategoryPatch = S['CategoryUpdate'];
export type CategoryRule = S['RuleOut'];
export type BankRequest = S['BankRequestOut'];
export type Connection = S['ConnectionOut'];
export type ConnectionsOverview = S['ConnectionsOverview'];
export type SyncResult = S['SyncOut'];
export type BrazilFinish = S['BrazilFinishOut'];
export type BrazilStart = S['BrazilStartOut'];

// regular: spending (negative) or income. pending: looks like money to an account of the
// family, waiting for the person to confirm. Only regular counts as spending or income.
export type TxKind = S['TxKind'];

// Amounts are decimals sent as strings: never do arithmetic on them in the app.
export type Transaction = S['TransactionOut'];
export type TransactionPage = S['TransactionPage'];
// What the list shows with its filters, added up, and by category, Responsável and account.
export type TransactionTotals = S['TransactionTotals'];
export type CurrencyTotals = S['CurrencyTotals'];
export type GroupTotal = S['GroupTotal'];
export type DayTotal = S['DayTotal'];
// A line's amount in BRL, EUR and USD, with the ECB rate of its day.
export type LineCurrencies = S['LineCurrencies'];
export type LatestMonth = S['LatestMonth'];

// Imported lines wait for approval ("pending") before they count anywhere.
export type ReviewStatus = S['ReviewStatus'];
export type ReviewGroup = S['ReviewGroup'];
export type ReviewQueue = S['ReviewQueue'];
export type ReviewResult = S['ReviewResult'];

export type RowStatus = S['PreviewRow']['status'];
export type ImportStatus = S['ImportStatus'];
export type PreviewRow = S['PreviewRow'];
export type GroupCounts = S['GroupCounts'];
export type PreviewGroup = S['PreviewGroup'];
export type ImportPreview = S['ImportPreview'];
export type ImportSummary = S['ImportSummary'];
export type ImportUndone = S['ImportUndone'];

// Stricter than the schema: either an existing account or a new one, never both.
export type AccountChoice =
  | { currency: Currency; account_id: string }
  | { currency: Currency; new_account: { name: string } };

export type CurrencySummary = S['CurrencySummary'];
export type MonthSummary = S['MonthSummary'];
export type MonthDashboard = S['MonthDashboard'];
export type CurrencyDashboard = S['CurrencyDashboard'];
export type InvestmentProduct = S['InvestmentProduct'];
export type InvestmentMonth = S['InvestmentMonth'];
export type InvestmentTotal = S['InvestmentTotal'];
export type InvestmentOverview = S['InvestmentOverview'];
// Credit card bills: the bill of a month (paid or not) and the next one, per card.
export type CardBill = S['CardBill'];
export type CardBills = S['CardBills'];
export type CardBillsOverview = S['CardBillsOverview'];

// The bank's own investment balances (Pluggy), as read on the last sync.
export type Portfolio = S['PortfolioOut'];
export type PortfolioClass = S['ClassOut'];
export type PortfolioPosition = S['PositionOut'];
export type Transfer = S['TransferOut'];
export type TransferOverview = S['TransferOverview'];
export type MovementRow = S['MovementRow'];
export type MovementGroup = S['MovementGroup'];
export type MovementsOverview = S['MovementsOverview'];
export type PurgeOverview = S['PurgeOverview'];
export type PurgeResult = S['PurgeResult'];
export type Analysis = S['Analysis'];
export type CurrencyAnalysis = S['CurrencyAnalysis'];
