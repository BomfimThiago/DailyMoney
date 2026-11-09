import type { Currency } from "@prisma/client";
import { Decimal } from "@/lib/money";
import { classifyTransaction } from "@/lib/ingest/classify";
import type { NormalizedRow } from "@/lib/tabular/types";
import type { MappedAccount } from "@/lib/bank-sync/types";
import type { PluggyAccount, PluggyTransaction } from "./schemas";

// Transações da Pluggy → linhas da importação, sem IA (como o OFX). Regras conferidas
// contra os dados reais do Meu Pluggy (ver scripts/pluggy-probe.ts):
//  - conta corrente: o valor já vem como o app usa (saída negativa, entrada positiva);
//  - cartão de crédito: ao contrário (compra positiva, pagamento negativo) → inverte;
//  - compra em outra moeda no cartão: `amountInAccountCurrency` traz o valor cobrado na
//    moeda da conta (mesmo sinal de `amount`) — é ele que entra, foi o que saiu da fatura;
//  - `date` é um instante em UTC: vale o dia no horário de Brasília, como no extrato.
//  - pagamento de fatura (no cartão, `PAGAMENTO_FATURA`; na conta, "Pagamento de fatura")
//    é dinheiro mudando de lugar: entra como transferência interna, fora dos totais. Senão
//    a fatura contaria duas vezes (as compras e o pagamento). O usuário pode desmarcar.
//  - no cartão, cada compra traz o mês da fatura (`billForecastDate`) e a parcela.
//  - dinheiro que só muda de lugar entra como movimentação (interna): Pix/transferência
//    para você mesmo ("Same person transfer") e aplicação/resgate de investimento. A
//    Pluggy classifica cada lançamento; rendimento ("Proceeds interests and dividends")
//    é entrada de verdade e continua contando.

const CURRENCIES = new Set<Currency>(["BRL", "EUR", "USD"]);
const BRAZIL_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Instante ISO → dia em Brasília, à meia-noite UTC (como as datas lidas de arquivo). */
export function brazilDay(iso: string): Date {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) throw new Error(`Data inválida: ${iso || "vazia"}`);
  const [y, m, day] = BRAZIL_DAY.format(d).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

/**
 * A API devolve valores como número JSON. Vira texto na hora (a forma mais curta que
 * representa o número, ex. "12.34") e daí Decimal; nenhuma conta é feita em float.
 * Arredonda para centavos: o banco não tem fração menor que isso.
 */
function money(n: number): Decimal {
  if (!Number.isFinite(n)) throw new Error(`Valor inválido: ${n}`);
  return new Decimal(String(n)).toDecimalPlaces(2);
}

const MONTH_RE = /^\d{4}-\d{2}$/;

/** Pagamento de fatura do cartão, visto no cartão ou na conta corrente. */
export function isCardBillPayment(tx: PluggyTransaction, isCard: boolean): boolean {
  if (tx.category === "Credit card payment" || tx.operationType === "PAGAMENTO_FATURA") return true;
  // Na conta, só o texto exato do banco ("Pagamento de fatura", Nubank): "fatura de luz" é gasto.
  return !isCard && tx.amount < 0 && /^pagamento d[ae] fatura( do cart[aã]o)?$/i.test(tx.description.trim());
}

const OWN_MONEY_CATEGORIES = new Set([
  "Same person transfer",
  "Transfer - Internal",
  "Investments",
  "Fixed income",
  "Variable income",
  "Investment funds",
]);
// Medido nos dados reais da Nubank (fixtures/pluggy, nov/2026): o tipo de operação
// RESGATE_APLIC_FINANCEIRA só aparece em aplicação, resgate, "Compra de Renda Variável" (que
// a Pluggy põe em "Shopping") e "Valor recebido de Investimentos" (centavos de rendimento e
// resgates grandes misturados). Tudo isso é movimentação; os centavos de rendimento ficam de
// fora das entradas, um preço pequeno perto de não contar R$ 5 mil de resgate como renda.
const OWN_MONEY_OPERATIONS = new Set([
  "RESGATE_APLIC_FINANCEIRA",
  "APLICACAO_FINANCEIRA",
  "TRANSFERENCIA_MESMA_TITULARIDADE",
]);

// Global Account do Inter (a conta em dólar, fora do Open Finance): o envio de reais para
// ela chega como "Transfer - Cash" e a volta como "Investments" (fixtures/pluggy, Inter,
// abr–nov/2026). As duas pontas são dinheiro seu mudando de conta. Só o texto exato do
// banco; o "IOF - Global Account" é imposto pago e continua gasto.
const INTER_GLOBAL_ACCOUNT = /^(dep[óo]sito|resgate) - global account$/i;

// Liquidação de compra ou venda de ações na B3 (Inter): a Pluggy põe na mesma categoria dos
// proventos ("Débito B3 - * Prov * Regularização Compra Itub", −R$ 456,40, fixtures/pluggy,
// set/2026). É dinheiro indo para (ou voltando de) investimento, não gasto nem renda. Os
// proventos de verdade da mesma categoria (aluguel de ações, reembolso de JCP e dividendo,
// rendimento de FII) não falam em compra nem venda e continuam entrada.
const PROCEEDS = "Proceeds interests and dividends";
const B3_TRADE = /\bB3\b.*\b(compra|venda)\b/i;

/** Dinheiro mudando de lugar entre contas suas ou para/de investimento (não é gasto nem entrada). */
export function isOwnMoneyMovement(tx: PluggyTransaction): boolean {
  return Boolean(
    (tx.category && OWN_MONEY_CATEGORIES.has(tx.category)) ||
    (tx.operationType && OWN_MONEY_OPERATIONS.has(tx.operationType)) ||
    INTER_GLOBAL_ACCOUNT.test(tx.description.trim()) ||
    (tx.category === PROCEEDS && B3_TRADE.test(tx.description)),
  );
}

/** Mês da fatura e parcela de uma compra no cartão. */
function cardDetails(tx: PluggyTransaction): { cardBill: string | null; installment: string | null } {
  const m = tx.creditCardMetadata;
  const bill = m?.billForecastDate?.slice(0, 7) ?? null;
  const n = m?.installmentNumber;
  const total = m?.totalInstallments;
  return {
    cardBill: bill && MONTH_RE.test(bill) ? bill : null,
    installment: n && total && total > 1 ? `${n}/${total}` : null,
  };
}

/** Nome da conta na importação: "Cartão de crédito", "Conta corrente"… */
export function accountLabel(account: PluggyAccount): string {
  if (account.type === "CREDIT") return "Cartão de crédito";
  if (account.subtype === "SAVINGS_ACCOUNT") return "Poupança";
  if (account.subtype === "CHECKING_ACCOUNT") return "Conta corrente";
  return account.name?.trim() || "Conta";
}

export function mapAccountTransactions(
  account: PluggyAccount,
  txs: PluggyTransaction[],
  opts: { from: Date },
): MappedAccount {
  const accountCurrency = account.currencyCode.toUpperCase() as Currency;
  if (!CURRENCIES.has(accountCurrency)) {
    throw new Error(`Moeda da conta não suportada: ${account.currencyCode}`);
  }
  const isCard = account.type === "CREDIT";
  const rows: NormalizedRow[] = [];
  const errors: MappedAccount["errors"] = [];
  let earliest: Date | null = null;

  txs.forEach((tx, rowIndex) => {
    const raw = `PLUGGY ${tx.id}`;
    try {
      const date = brazilDay(tx.date);
      if (!earliest || date < earliest) earliest = date;
      if (date < opts.from) return;

      const txCurrency = tx.currencyCode.toUpperCase() as Currency;
      let currency: Currency = accountCurrency;
      let amount: Decimal;
      if (txCurrency === accountCurrency) {
        amount = money(tx.amount);
      } else if (tx.amountInAccountCurrency != null) {
        amount = money(tx.amountInAccountCurrency);
      } else if (CURRENCIES.has(txCurrency)) {
        currency = txCurrency;
        amount = money(tx.amount);
      } else {
        throw new Error(`Moeda não suportada (${tx.currencyCode}) e sem o valor na moeda da conta`);
      }
      if (isCard) amount = amount.negated();

      const description = tx.description.replace(/\s+/g, " ").trim();
      if (!description) throw new Error("Transação sem descrição");
      const { type, isInternalTransfer } = classifyTransaction(amount);
      const card = isCard ? cardDetails(tx) : { cardBill: null, installment: null };
      rows.push({
        date,
        description,
        merchantRaw: (tx.descriptionRaw ?? tx.description).replace(/\s+/g, " ").trim(),
        baseCurrency: currency,
        baseAmount: amount.toFixed(4),
        feeAmount: "0.0000",
        type,
        state: tx.status === "PENDING" ? "PENDING" : "COMPLETED",
        isInternalTransfer: isInternalTransfer || isCardBillPayment(tx, isCard) || isOwnMoneyMovement(tx),
        ...card,
        // identidade da linha: o id da transação na Pluggy (estável de pendente a confirmada)
        sourceRowRaw: raw,
      });
    } catch (err) {
      errors.push({ rowIndex, message: err instanceof Error ? err.message : "Transação ilegível", raw });
    }
  });
  return { rows, errors, earliest };
}
