import * as React from "react";
import type { Currency } from "@prisma/client";
import { positionGain, rateLabel, type PositionInput } from "@/lib/investments/summary";
import { Money } from "./money";

export interface InvestmentItem extends PositionInput {
  bank: string;
  name: string;
  issuer: string | null;
  code: string | null;
  rate: string | null;
  rateType: string | null;
  fixedAnnualRate: string | null;
  /** ISO */
  dueDate: string | null;
}

const FIELD = { BRL: "balanceBRL", USD: "balanceUSD", EUR: "balanceEUR" } as const;
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
/** "2028-06-05T00:00:00.000Z" → "jun/2028" (dia do vencimento, sem fuso). */
const monthYear = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]}/${iso.slice(0, 4)}`;

/**
 * Investimentos de uma classe (renda fixa, Tesouro, ações…): o saldo líquido de hoje e,
 * quando o banco informa quanto foi aplicado, quanto rendeu. Na linha de baixo, o que
 * identifica o título: banco, emissor, taxa contratada e vencimento.
 */
export function InvestmentList({ items, lens }: { items: InvestmentItem[]; lens: Currency }) {
  return (
    <ul className="divide-y">
      {items.map((p) => {
        const gain = positionGain(p, lens);
        const meta = [
          p.code && p.code !== p.name ? p.code : null,
          p.bank,
          // o emissor só quando acrescenta: nem repete o nome nem o próprio banco ("Banco Inter" no Inter)
          p.issuer &&
          !p.name.toLowerCase().includes(p.issuer.toLowerCase()) &&
          !p.issuer.toLowerCase().includes(p.bank.toLowerCase())
            ? p.issuer
            : null,
          rateLabel(p),
          p.dueDate ? `vence ${monthYear(p.dueDate)}` : null,
        ].filter(Boolean);
        return (
          <li key={p.id} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-[15px] font-medium">{p.name}</span>
              <span className="text-meta text-subtle">{meta.join(" · ")}</span>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-0.5">
              <Money
                value={p[FIELD[lens]]}
                currency={lens}
                original={p.currency !== lens ? { value: p.balance, currency: p.currency } : undefined}
              />
              {gain !== null ? (
                <span className="flex items-baseline gap-1 text-meta text-subtle">
                  rendeu <Money value={gain} currency={lens} change={gain.startsWith("-") ? "bad" : "good"} size="sm" />
                </span>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
