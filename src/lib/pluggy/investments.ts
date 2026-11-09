import type { Currency } from "@prisma/client";
import { Decimal } from "@/lib/money";
import type { MappedInvestment } from "@/lib/bank-sync/types";
import { brazilDay } from "./map";
import type { PluggyInvestment } from "./schemas";

// Investimentos da Pluggy → posições do app, sem IA. Conferido contra os dados reais do
// Meu Pluggy (fixtures/pluggy/*-investments.json, Inter e Nubank, nov/2026):
//  - `balance` é o saldo líquido (IR e taxas descontados), com centavos;
//  - resgatado (TOTAL_WITHDRAWAL) vem com saldo zero e continua na lista;
//  - renda fixa traz o aplicado (`amountOriginal`), vencimento e taxa contratada; ações,
//    FIIs e ETFs, não (só código e saldo);
//  - datas são instantes UTC: vale o dia em Brasília (o vencimento vem às 03:00 UTC);
//  - pode vir sem nome (visto num CDB já resgatado do Nubank): usa o código ou o emissor.

const CURRENCIES = new Set<Currency>(["BRL", "EUR", "USD"]);

/** Número JSON → Decimal pelo texto (sem conta em float). */
function dec(n: number, what: string): Decimal {
  if (!Number.isFinite(n)) throw new Error(`${what} inválido: ${n}`);
  return new Decimal(String(n));
}
const optDec = (n: number | null | undefined, what: string) => (n == null ? null : dec(n, what));
const text = (s: string | null | undefined) => s?.replace(/\s+/g, " ").trim() || null;

export function mapInvestment(inv: PluggyInvestment): MappedInvestment {
  const currency = inv.currencyCode.toUpperCase() as Currency;
  if (!CURRENCIES.has(currency)) throw new Error(`moeda não suportada (${inv.currencyCode})`);
  const name = text(inv.name) ?? text(inv.code) ?? text(inv.issuer) ?? "Investimento sem nome no banco";
  return {
    externalId: inv.id,
    name,
    type: inv.type,
    subtype: text(inv.subtype),
    issuer: text(inv.issuer),
    code: text(inv.code),
    currency,
    balance: dec(inv.balance, "saldo").toDecimalPlaces(2),
    amountOriginal: optDec(inv.amountOriginal, "valor aplicado")?.toDecimalPlaces(2) ?? null,
    rate: optDec(inv.rate, "taxa"),
    rateType: text(inv.rateType)?.toUpperCase() ?? null,
    fixedAnnualRate: optDec(inv.fixedAnnualRate, "taxa prefixada"),
    dueDate: inv.dueDate ? brazilDay(inv.dueDate) : null,
    status: text(inv.status)?.toUpperCase() ?? "ACTIVE",
    valueDate: brazilDay(inv.date),
  };
}

/** Lê todas; a que não dá para ler vira um erro com o nome dela, sem derrubar as outras. */
export function mapInvestments(invs: PluggyInvestment[]): { positions: MappedInvestment[]; errors: string[] } {
  const positions: MappedInvestment[] = [];
  const errors: string[] = [];
  for (const inv of invs) {
    try {
      positions.push(mapInvestment(inv));
    } catch (err) {
      errors.push(`${inv.name || inv.id}: ${err instanceof Error ? err.message : "ilegível"}`);
    }
  }
  return { positions, errors };
}
