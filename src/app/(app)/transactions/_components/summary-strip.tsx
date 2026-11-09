"use client";

import * as React from "react";
import { Decimal } from "@/lib/money";
import type { Currency, TransactionPage, TransactionTotals } from "@/hooks";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Money } from "@/components/finance/money";
import { totalKind } from "./shared";

function sumOf(totals: TransactionTotals[], type: "EXPENSE" | "INCOME", lens: Currency): Decimal {
  const row = totals.find((t) => t.type === type);
  const field = lens === "BRL" ? "amountBRL" : lens === "USD" ? "amountUSD" : "amountEUR";
  return new Decimal(row?._sum[field] ?? "0");
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 px-5 py-3.5">
      <span className="text-[12.5px] font-medium text-muted-foreground">{label}</span>
      <div className="flex items-baseline gap-1.5">{children}</div>
    </div>
  );
}

/**
 * Faixa de totais acima da tabela: Gastos / Entradas / Saldo (dos totais da API,
 * já sem transferências) e Pendentes (contagem + soma na moeda da lente). Tudo do
 * período inteiro, calculado no servidor — não só das linhas já carregadas.
 */
export function SummaryStrip({
  totals,
  pending,
  lens,
}: {
  totals: TransactionTotals[];
  pending: TransactionPage["pending"];
  lens: Currency;
}) {
  const expense = sumOf(totals, "EXPENSE", lens);
  const income = sumOf(totals, "INCOME", lens);
  const net = income.plus(expense); // gastos já vêm negativos
  const pendingField = lens === "BRL" ? "amountBRL" : lens === "USD" ? "amountUSD" : "amountEUR";
  const pendingSum = new Decimal(pending._sum[pendingField] ?? "0");

  return (
    <Card className="grid grid-cols-2 divide-border md:grid-cols-4 md:divide-x">
      <Cell label="Gastos">
        <Money value={expense} currency={lens} kind={totalKind(expense)} size="lg" align="left" />
      </Cell>
      <Cell label="Entradas">
        <Money value={income} currency={lens} kind={totalKind(income)} size="lg" align="left" />
      </Cell>
      <Cell label="Saldo">
        <Money value={net} currency={lens} kind={totalKind(net)} size="lg" align="left" />
      </Cell>
      <Cell label="Pendentes">
        <span className="text-[16px] font-bold tabular-nums">{pending.count}</span>
        {pending.count > 0 ? (
          <>
            <span className="text-subtle">·</span>
            <Money value={pendingSum} currency={lens} kind={totalKind(pendingSum)} size="sm" align="left" />
          </>
        ) : null}
      </Cell>
    </Card>
  );
}

export function SummaryStripSkeleton() {
  return (
    <Card className="grid grid-cols-2 md:grid-cols-4" aria-busy>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="space-y-2 px-5 py-3.5">
          <Skeleton className="h-3.5 w-16" />
          <Skeleton className="h-5 w-28" />
        </div>
      ))}
    </Card>
  );
}
