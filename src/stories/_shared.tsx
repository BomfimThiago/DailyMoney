import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { TD, TR } from "@/components/ui/table";
import { CategoryIcon, CategoryPill } from "@/components/finance/category";
import { CurrencyTag } from "@/components/finance/currency-tag";
import { MemberChip } from "@/components/finance/member";
import { Money } from "@/components/finance/money";
import { CAT, EXPENSE_KEYS, INCOME_KEYS, type SampleTx } from "./fixtures";

// Peças reutilizadas entre stories (não são stories).
export const CategoryOptions = [
  ...EXPENSE_KEYS.map((k) => ({
    value: k,
    label: CAT[k].name,
    group: "Gastos",
    leading: <CategoryIcon category={CAT[k]} size="sm" />,
  })),
  ...INCOME_KEYS.map((k) => ({
    value: k,
    label: CAT[k].name,
    group: "Entradas",
    leading: <CategoryIcon category={CAT[k]} size="sm" />,
  })),
];

export function TxRow({ tx, selected }: { tx: SampleTx; selected?: boolean }) {
  return (
    <TR state={selected ? "selected" : undefined}>
      <TD className="w-12">
        {tx.cat ? (
          <CategoryIcon category={tx.cat} />
        ) : (
          <CategoryIcon category={{ name: "Transferência", color: "#4655A0", icon: "transfer" }} />
        )}
      </TD>
      <TD>
        <div className="flex items-center gap-2 font-semibold">
          {tx.title}
          {tx.pending ? <Badge variant="warning">pendente</Badge> : null}
          {tx.kind === "TRANSFER" ? <Badge variant="info">interna</Badge> : null}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-meta text-subtle">
          <span className="font-mono text-[11px]">{tx.raw}</span>·{tx.bank}
          <CurrencyTag currency={tx.currency} />
        </div>
      </TD>
      <TD>
        {tx.kind === "TRANSFER" ? (
          <span className="text-meta text-subtle">fora dos totais</span>
        ) : (
          <CategoryPill category={tx.cat} />
        )}
      </TD>
      <TD>
        <MemberChip member={tx.member} />
      </TD>
      <TD className="text-right">
        <Money value={tx.eur} currency="EUR" kind={tx.kind} original={tx.original} />
      </TD>
    </TR>
  );
}
