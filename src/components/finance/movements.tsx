import * as React from "react";
import type { Currency } from "@prisma/client";
import { Decimal } from "@/lib/money";
import { summarizeMovements, type MovementGroupInput } from "@/lib/transactions/aggregate";
import { CategoryTag } from "./category";
import { Money } from "./money";

export interface MovementsItem extends MovementGroupInput {
  category: { name: string; color: string; icon: string | null } | null;
}

/**
 * O dinheiro que só mudou de lugar no mês (entre contas, aplicação e resgate, pagamento de
 * cartão), fora dos gastos e das entradas. Por categoria: quanto saiu, quanto entrou e o
 * saldo. No fim, o que não voltou: com todas as contas conectadas, fica perto de zero; o
 * resto foi para investimentos ou para contas que ainda não estão no app.
 */
export function Movements({ groups, lens }: { groups: MovementsItem[]; lens: Currency }) {
  const s = summarizeMovements(groups, lens);
  const byKey = new Map(groups.map((g) => [g.key, g]));
  const net = new Decimal(s.net);
  const gap = net.abs();
  // Até 1% do que circulou conta como "fechou" (tarifa, câmbio, arredondamento).
  const closes = gap.lte(new Decimal(s.out).plus(s.in).times("0.01"));

  return (
    <div className="flex flex-col gap-4">
      <ul className="divide-y">
        {s.rows.map((r) => {
          const c = byKey.get(r.key)?.category;
          const outZero = new Decimal(r.out).isZero();
          const inZero = new Decimal(r.in).isZero();
          return (
            <li key={r.key} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
              <div className="flex min-w-0 flex-col gap-1">
                {c ? (
                  <CategoryTag category={c} />
                ) : (
                  <span className="text-[15px] font-medium">Transferências sem categoria</span>
                )}
                <span className="flex flex-wrap items-baseline gap-x-1 text-meta text-subtle">
                  {outZero ? null : (
                    <>
                      saiu <Money value={r.out} currency={lens} kind="TRANSFER" size="sm" />
                    </>
                  )}
                  {outZero || inZero ? null : <span aria-hidden>·</span>}
                  {inZero ? null : (
                    <>
                      entrou <Money value={r.in} currency={lens} kind="TRANSFER" size="sm" />
                    </>
                  )}
                </span>
              </div>
              <Money value={r.net} currency={lens} change="muted" />
            </li>
          );
        })}
      </ul>
      <div className="flex items-start justify-between gap-4 border-t pt-4">
        <p className="min-w-0 text-[15px]">
          <span className="font-medium">
            {closes ? "Fechou" : net.isNegative() ? "Saiu e não voltou" : "Entrou de fora"}
          </span>
          <span className="block text-meta text-subtle">
            {closes
              ? "O que saiu de uma conta entrou em outra."
              : net.isNegative()
                ? "Foi para investimentos ou para contas que ainda não estão conectadas."
                : "Veio de investimentos ou de contas que ainda não estão conectadas."}
          </span>
        </p>
        <Money value={s.net} currency={lens} change="muted" />
      </div>
    </div>
  );
}
