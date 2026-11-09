import { z } from "zod";

// Respostas da API da Enable Banking validadas na borda: um campo que mude de forma vira
// erro visível, não uma transação com valor errado. Só o que o app usa; o resto é ignorado.
// Referência: https://enablebanking.com/docs/api/reference/

export const Aspsp = z.object({
  name: z.string(),
  country: z.string(),
  logo: z.string().nullish(),
  beta: z.boolean().nullish(),
  psu_types: z.array(z.string()).nullish(),
  /** Em segundos. */
  maximum_consent_validity: z.number().nullish(),
});
export type Aspsp = z.infer<typeof Aspsp>;
export const AspspsResponse = z.object({ aspsps: z.array(Aspsp) });

export const StartAuthResponse = z.object({ url: z.string().url(), authorization_id: z.string().nullish() });

const Amount = z.object({ currency: z.string(), amount: z.string() });

export const SessionAccount = z.object({
  uid: z.string(),
  /** Hash da identificação da conta (IBAN…): o mesmo em todas as sessões. */
  identification_hash: z.string().nullish(),
  account_id: z
    .object({ iban: z.string().nullish(), other: z.object({ identification: z.string().nullish() }).nullish() })
    .nullish(),
  name: z.string().nullish(),
  details: z.string().nullish(),
  product: z.string().nullish(),
  currency: z.string().nullish(),
  cash_account_type: z.string().nullish(),
});
export type SessionAccount = z.infer<typeof SessionAccount>;

export const SessionResponse = z.object({
  session_id: z.string(),
  accounts: z.array(SessionAccount),
  aspsp: z.object({ name: z.string(), country: z.string() }),
  access: z.object({ valid_until: z.string().nullish() }).nullish(),
});

/** GET /sessions/{id}: `accounts` aqui é a lista de uids; os dados ficam no que guardamos. */
export const SessionStatus = z.object({
  status: z.string(),
  access: z.object({ valid_until: z.string().nullish() }).nullish(),
});

const Party = z.object({ name: z.string().nullish() }).nullish();

export const EbTransaction = z.object({
  entry_reference: z.string().nullish(),
  transaction_id: z.string().nullish(),
  transaction_amount: Amount,
  credit_debit_indicator: z.enum(["CRDT", "DBIT"]),
  status: z.string(),
  booking_date: z.string().nullish(),
  value_date: z.string().nullish(),
  transaction_date: z.string().nullish(),
  creditor: Party,
  debtor: Party,
  remittance_information: z.array(z.string()).nullish(),
  note: z.string().nullish(),
  bank_transaction_code: z.object({ description: z.string().nullish() }).nullish(),
});
export type EbTransaction = z.infer<typeof EbTransaction>;

export const TransactionsPage = z.object({
  transactions: z.array(EbTransaction),
  continuation_key: z.string().nullish(),
});
