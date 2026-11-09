import * as React from "react";
import type { Currency } from "@prisma/client";
import { Decimal } from "@/lib/money";
import { Money } from "./money";

type Sums = { amountBRL: string | null; amountUSD: string | null; amountEUR: string | null } | null;

export interface CardBillsItem {
  bank: string | null;
  account: string | null;
  bill: { count: number; _sum: Sums };
  next: { count: number; _sum: Sums };
  /** Pagamentos recebidos no cartão no mês: dia (yyyy-mm-dd…) e valor. */
  paid: { date: string; _sum: NonNullable<Sums> }[];
}

const FIELD = { BRL: "amountBRL", USD: "amountUSD", EUR: "amountEUR" } as const;
const sumOf = (s: Sums, lens: Currency) => new Decimal(s?.[FIELD[lens]] ?? "0");
/** "2026-11-02T00:00:00.000Z" → "2/11" (dia do lançamento, sem fuso). */
const shortDay = (iso: string) => `${Number(iso.slice(8, 10))}/${iso.slice(5, 7)}`;

/**
 * O lado "caixa" do cartão, ao lado das compras por data: a fatura deste mês (o que sai
 * da conta agora, e se já foi paga) e a próxima, que vai somando o que se compra. As
 * compras continuam contando no mês em que foram feitas, cada uma na sua categoria.
 */
export function CardBills({
  cards,
  lens,
  monthName,
  nextName,
  nextIsOpen,
  isCurrentMonth = false,
  billsKnown,
}: {
  cards: CardBillsItem[];
  lens: Currency;
  /** "novembro" */
  monthName: string;
  /** "dezembro" */
  nextName: string;
  /** A próxima fatura ainda está recebendo compras (é de um mês futuro). */
  nextIsOpen: boolean;
  /** O mês mostrado é o atual: sem pagamento ainda, a fatura está "a pagar". */
  isCurrentMonth?: boolean;
  /** false: as compras ainda não têm o mês da fatura (a próxima sincronização preenche). */
  billsKnown: boolean;
}) {
  if (!billsKnown) {
    return (
      <p className="text-[15px] text-subtle">
        As faturas aparecem depois da próxima sincronização do banco: as compras que já estavam aqui não trazem o mês da
        fatura.
      </p>
    );
  }
  return (
    <div className="divide-y">
      {cards.map((c) => {
        const bill = sumOf(c.bill._sum, lens);
        const next = sumOf(c.next._sum, lens);
        const paid = c.paid.reduce((s, p) => s.plus(sumOf(p._sum, lens)), new Decimal(0));
        const lastPaid = c.paid.at(-1);
        return (
          <section
            key={`${c.bank}|${c.account}`}
            aria-label={`${c.account ?? "Cartão"} ${c.bank ?? ""}`}
            className="py-4 first:pt-0 last:pb-0"
          >
            {cards.length > 1 ? (
              <p className="mb-2 text-meta font-semibold text-foreground">
                {c.bank} · {c.account}
              </p>
            ) : null}
            <dl className="space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <dt className="text-[15px] font-medium">Fatura de {monthName}</dt>
                  <dd className="text-meta text-subtle">
                    {lastPaid ? (
                      <>
                        paga em {shortDay(lastPaid.date)}: <Money value={paid} currency={lens} size="sm" />
                      </>
                    ) : isCurrentMonth ? (
                      "a pagar"
                    ) : (
                      `sem pagamento registrado em ${monthName}`
                    )}
                  </dd>
                </div>
                <dd>
                  <Money value={bill} currency={lens} kind={bill.isZero() ? "NEUTRAL" : "EXPENSE"} />
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <dt className="text-[15px] font-medium">
                    Fatura de {nextName}
                    {nextIsOpen ? <span className="font-normal text-subtle"> · aberta</span> : null}
                  </dt>
                  <dd className="text-meta text-subtle">
                    {c.next.count} {c.next.count === 1 ? "compra" : "compras"}
                    {nextIsOpen ? " até agora" : ""}
                  </dd>
                </div>
                <dd>
                  <Money value={next} currency={lens} kind={next.isZero() ? "NEUTRAL" : "EXPENSE"} />
                </dd>
              </div>
            </dl>
          </section>
        );
      })}
    </div>
  );
}
