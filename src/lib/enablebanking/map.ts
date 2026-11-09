import { createHash } from "node:crypto";
import type { Currency } from "@prisma/client";
import { Decimal } from "@/lib/money";
import { classifyTransaction } from "@/lib/ingest/classify";
import type { NormalizedRow } from "@/lib/tabular/types";
import type { MappedAccount } from "@/lib/bank-sync/types";
import type { EbTransaction, SessionAccount } from "./schemas";

// Transações da Enable Banking → linhas da importação, sem IA (como o OFX e a Pluggy).
// Formato da API (ISO 20022, igual em todos os bancos europeus):
//  - `transaction_amount.amount` vem como TEXTO e sem sinal; a direção está em
//    `credit_debit_indicator`: DBIT = saiu da conta (vira negativo), CRDT = entrou.
//    Vale também para cartão: é sempre do ponto de vista do dono da conta.
//  - Só entram as lançadas (`status` BOOK). Pendente ainda muda de valor e de referência
//    no banco; ela entra na sincronização seguinte, já lançada.
//  - Datas são dias (yyyy-mm-dd), sem fuso: `booking_date`, ou o valor/operação na falta.
//  - Identidade da linha: `entry_reference` (a referência do banco). O `transaction_id`
//    não serve, a API avisa que pode mudar entre leituras. Sem referência, uma impressão
//    digital de dia, valor e descrição (iguais no mesmo dia ganham 1ª, 2ª… na importação).

const CURRENCIES = new Set<Currency>(["BRL", "EUR", "USD"]);
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const AMOUNT_RE = /^-?\d+(\.\d+)?$/;

const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

/** Nome da conta na importação: "Conta corrente", "Cartão"… (com a moeda quando precisa). */
export function ebAccountLabel(a: Pick<SessionAccount, "cash_account_type" | "name" | "product">): string {
  switch (a.cash_account_type) {
    case "CACC":
      return "Conta corrente";
    case "CARD":
      return "Cartão";
    case "SVGS":
      return "Poupança";
    default:
      return clean(a.name) || clean(a.product) || "Conta";
  }
}

/** Identidade fixa da conta: o hash que a API dá (igual em toda sessão), ou o do IBAN. */
export function ebAccountKey(a: SessionAccount): string {
  if (a.identification_hash) return a.identification_hash;
  const iban = a.account_id?.iban ?? a.account_id?.other?.identification;
  if (iban) return createHash("sha256").update(iban.replace(/\s+/g, "").toUpperCase()).digest("hex");
  // Sem identificação: o uid da sessão. Funciona, mas uma nova autorização vira outra conta.
  return `uid:${a.uid}`;
}

function txDay(tx: EbTransaction): Date {
  const d = tx.booking_date ?? tx.value_date ?? tx.transaction_date ?? "";
  if (!DAY_RE.test(d)) throw new Error(`Data inválida: ${d || "vazia"}`);
  const date = new Date(`${d}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error(`Data inválida: ${d}`);
  return date;
}

function describe(tx: EbTransaction): { description: string; merchant: string } {
  const party = clean(tx.credit_debit_indicator === "DBIT" ? tx.creditor?.name : tx.debtor?.name);
  const remittance = clean((tx.remittance_information ?? []).join(" "));
  const description =
    party && remittance
      ? remittance.toLowerCase().includes(party.toLowerCase())
        ? remittance
        : `${party} · ${remittance}`
      : party || remittance || clean(tx.note) || clean(tx.bank_transaction_code?.description);
  if (!description) throw new Error("Transação sem descrição");
  return { description, merchant: party || description };
}

export function mapEbTransactions(
  account: { currency?: string | null },
  txs: EbTransaction[],
  opts: { from: Date },
): MappedAccount {
  const rows: NormalizedRow[] = [];
  const errors: MappedAccount["errors"] = [];
  let earliest: Date | null = null;

  txs.forEach((tx, rowIndex) => {
    if (tx.status !== "BOOK") return;
    let raw = tx.entry_reference ? `ENABLEBANKING ${tx.entry_reference}` : `ENABLEBANKING tx ${rowIndex + 1}`;
    try {
      const date = txDay(tx);
      if (!earliest || date < earliest) earliest = date;
      if (date < opts.from) return;

      const value = tx.transaction_amount.amount.trim();
      if (!AMOUNT_RE.test(value)) throw new Error(`Valor inválido: ${value || "vazio"}`);
      const abs = new Decimal(value).abs();
      const amount = tx.credit_debit_indicator === "DBIT" ? abs.negated() : abs;
      const currency = (tx.transaction_amount.currency || account.currency || "").toUpperCase() as Currency;
      if (!CURRENCIES.has(currency))
        throw new Error(`Moeda não suportada: ${tx.transaction_amount.currency || "vazia"}`);

      const { description, merchant } = describe(tx);
      if (!tx.entry_reference) {
        raw = `ENABLEBANKING ${date.toISOString().slice(0, 10)}|${tx.credit_debit_indicator}|${abs.toFixed(2)}|${currency}|${description}`;
      }
      const { type, isInternalTransfer } = classifyTransaction(amount);
      rows.push({
        date,
        description,
        merchantRaw: merchant,
        baseCurrency: currency,
        baseAmount: amount.toFixed(4),
        feeAmount: "0.0000",
        type,
        state: "COMPLETED",
        isInternalTransfer,
        sourceRowRaw: raw,
      });
    } catch (err) {
      errors.push({ rowIndex, message: err instanceof Error ? err.message : "Transação ilegível", raw });
    }
  });
  return { rows, errors, earliest };
}
