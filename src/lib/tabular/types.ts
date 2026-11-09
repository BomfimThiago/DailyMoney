import type { Currency, TxType, TxState } from "@prisma/client";
import type { DecimalSeparator } from "@/lib/tabular/normalize";

// Roles map a semantic field to a column index in the tabular file.
export interface ColumnRoles {
  date: number;
  amount: number;
  description: number;
  currency?: number;
  fee?: number;
  balance?: number;
  state?: number;
  type?: number;
}

export interface FormatProfileSpec {
  delimiter: string;
  columnRoles: ColumnRoles;
  decimalSeparator: DecimalSeparator;
  dateFormat: "DMY" | "MDY" | "YMD" | "auto";
  signConvention: "negative_is_expense";
  defaultCurrency: Currency | null;
  // Confidence of a heuristic/AI inference (0..1). Used to decide review.
  confidence: number;
}

// A normalized transaction produced by applying a profile to one row.
export interface NormalizedRow {
  date: Date;
  description: string;
  merchantRaw: string;
  baseCurrency: Currency;
  baseAmount: string; // Decimal serialized
  feeAmount: string;
  type: TxType;
  state: TxState;
  isInternalTransfer: boolean;
  sourceRowRaw: string;
  /** PDF: `sourceRowRaw` é a linha literal do extrato (não a saída da IA) e identifica a linha. */
  sourceIsStatementLine?: boolean;
  balance?: string | null; // running balance from the statement, if present
  needsReview?: boolean;
  reviewReason?: string | null;
  /** Banco conectado: a conta de onde veio ("Conta corrente", "Cartão de crédito"). */
  account?: string | null;
  /** Compra no cartão de crédito. */
  isCard?: boolean;
  /** Mês da fatura do cartão (yyyy-mm). */
  cardBill?: string | null;
  /** Parcela da compra no cartão ("3/10"). */
  installment?: string | null;
}
