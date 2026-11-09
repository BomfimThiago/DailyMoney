import { z } from "zod";

// Respostas da API da Pluggy validadas na borda: um campo que mude de forma vira erro
// visível, não uma transação com valor errado. Só o que o app usa; o resto é ignorado.

export const PluggyItem = z.object({
  id: z.string(),
  status: z.string(),
  executionStatus: z.string().nullish(),
  consentExpiresAt: z.string().nullish(),
  lastUpdatedAt: z.string().nullish(),
  error: z.object({ code: z.string().nullish(), message: z.string().nullish() }).nullish(),
  connector: z.object({ name: z.string().nullish() }).nullish(),
});
export type PluggyItem = z.infer<typeof PluggyItem>;

export const PluggyAccount = z.object({
  id: z.string(),
  type: z.string(),
  subtype: z.string().nullish(),
  currencyCode: z.string(),
  name: z.string().nullish(),
  marketingName: z.string().nullish(),
});
export type PluggyAccount = z.infer<typeof PluggyAccount>;

export const PluggyTransaction = z.object({
  id: z.string(),
  date: z.string(),
  description: z.string(),
  descriptionRaw: z.string().nullish(),
  amount: z.number(),
  amountInAccountCurrency: z.number().nullish(),
  currencyCode: z.string(),
  status: z.string().nullish(),
  type: z.string().nullish(),
  /** Categoria da Pluggy ("Credit card payment"…): só para reconhecer pagamento de fatura. */
  category: z.string().nullish(),
  operationType: z.string().nullish(),
  /** Só no cartão: a fatura (mês previsto) e a parcela. */
  creditCardMetadata: z
    .object({
      billId: z.string().nullish(),
      billForecastDate: z.string().nullish(),
      installmentNumber: z.number().nullish(),
      totalInstallments: z.number().nullish(),
    })
    .nullish(),
});
export type PluggyTransaction = z.infer<typeof PluggyTransaction>;

export const AccountsPage = z.object({ results: z.array(PluggyAccount) });
/** /v2/transactions: paginado por cursor em `next` (null na última página). */
export const TransactionsPage = z.object({ results: z.array(PluggyTransaction), next: z.string().nullish() });

/** Investimento (posição) na Pluggy. Valores como número JSON: viram Decimal na leitura. */
export const PluggyInvestment = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  subtype: z.string().nullish(),
  code: z.string().nullish(),
  issuer: z.string().nullish(),
  currencyCode: z.string(),
  /** Saldo líquido (IR e taxas já descontados). */
  balance: z.number(),
  amountOriginal: z.number().nullish(),
  rate: z.number().nullish(),
  rateType: z.string().nullish(),
  fixedAnnualRate: z.number().nullish(),
  dueDate: z.string().nullish(),
  /** Dia a que o saldo se refere. */
  date: z.string(),
  status: z.string().nullish(),
});
export type PluggyInvestment = z.infer<typeof PluggyInvestment>;

/** /investments: paginado por número de página. */
export const InvestmentsPage = z.object({
  results: z.array(PluggyInvestment),
  page: z.number().nullish(),
  totalPages: z.number().nullish(),
});
