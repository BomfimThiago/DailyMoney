import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { AlertTriangle, Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import Decimal from "decimal.js";
import { Table, TBody, TD, TGroupRow, TH, THead, TR, type SortDirection } from "@/components/ui/table";
import { CategoryIcon, CategoryPill } from "@/components/finance/category";
import { ConfidenceMeter } from "@/components/finance/confidence-meter";
import { CurrencyTag } from "@/components/finance/currency-tag";
import { MemberChip } from "@/components/finance/member";
import { Money } from "@/components/finance/money";
import { CAT, MEMBERS, TXS } from "./fixtures";
import { TxRow } from "./_shared";
import { Section } from "./_helpers";

const meta: Meta = { title: "Dados/Table" };
export default meta;

export const Estados: StoryObj = {
  name: "Estados de linha",
  render: () => (
    <Card className="max-w-5xl overflow-hidden">
      <Table>
        <THead>
          <TR className="hover:bg-transparent">
            <TH />
            <TH>Descrição</TH>
            <TH>Categoria</TH>
            <TH>Responsável</TH>
            <TH className="text-right">Valor</TH>
          </TR>
        </THead>
        <TBody>
          <TxRow tx={TXS[0]} />
          <TxRow tx={TXS[5]} selected />
          <TxRow tx={TXS[1]} />
          <TxRow tx={TXS[4]} />
          <TxRow tx={TXS[2]} />
        </TBody>
      </Table>
    </Card>
  ),
};

export const Revisao: StoryObj = {
  name: "Tabela de revisão (lote + ações)",
  render: function Render() {
    const rows = [
      {
        raw: "BIZUM ENVIADO A J. MARTINEZ",
        why: "Pagamento a pessoa ou transferência?",
        c: 0.42,
        cat: CAT.outros,
        m: null,
        v: "45",
      },
      {
        raw: "AMZN MKTP ES*2K4L9",
        why: "Duas categorias prováveis",
        c: 0.58,
        cat: CAT.compras,
        m: MEMBERS.alex,
        v: "37.99",
      },
      {
        raw: "TPV GASOLINERA REPSOL",
        why: "Responsável não identificado",
        c: 0.74,
        cat: CAT.transporte,
        m: null,
        v: "62.10",
      },
    ];
    const [sel, setSel] = React.useState<number[]>([]);
    const all = sel.length === rows.length ? true : sel.length ? "indeterminate" : false;
    return (
      <Card className="max-w-6xl overflow-hidden">
        <Table>
          <THead>
            <TR className="hover:bg-transparent">
              <TH className="w-10">
                <Checkbox
                  aria-label="Selecionar todas"
                  checked={all}
                  onCheckedChange={() => setSel(all === true ? [] : rows.map((_, i) => i))}
                />
              </TH>
              <TH>Descrição no extrato · motivo</TH>
              <TH>Confiança</TH>
              <TH>Categoria sugerida</TH>
              <TH>Responsável</TH>
              <TH className="text-right">Valor</TH>
              <TH className="w-24" />
            </TR>
          </THead>
          <TBody>
            {rows.map((r, i) => (
              <TR key={r.raw} state={i === 0 ? "review" : sel.includes(i) ? "selected" : undefined}>
                <TD>
                  <Checkbox
                    aria-label="Selecionar"
                    checked={sel.includes(i)}
                    onCheckedChange={() => setSel((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i]))}
                  />
                </TD>
                <TD>
                  <div className="font-mono text-[12.5px] font-semibold">{r.raw}</div>
                  <div className="mt-1 flex items-center gap-1.5 text-meta text-warning">
                    <AlertTriangle className="size-3.5" />
                    {r.why}
                  </div>
                </TD>
                <TD>
                  <ConfidenceMeter value={r.c} />
                </TD>
                <TD>
                  <CategoryPill category={r.cat} suggested interactive />
                </TD>
                <TD>
                  <MemberChip member={r.m} />
                </TD>
                <TD className="text-right">
                  <Money value={r.v} currency="EUR" kind="EXPENSE" />
                </TD>
                <TD>
                  <div className="flex justify-end gap-1.5">
                    <Button variant="secondary" size="icon-sm" aria-label="Rejeitar">
                      <X />
                    </Button>
                    <Button size="icon-sm" aria-label="Aceitar">
                      <Check />
                    </Button>
                  </div>
                </TD>
              </TR>
            ))}
            <TR state="error">
              <TD />
              <TD colSpan={4}>
                <div className="font-mono text-[12.5px] font-semibold">LINHA 48</div>
                <div className="mt-1 text-meta font-medium text-destructive">
                  Data inválida: “31/02/2026”. Corrija ou exclua a linha.
                </div>
              </TD>
              <TD className="text-right">
                <Money value="12" currency="EUR" kind="EXPENSE" />
              </TD>
              <TD />
            </TR>
          </TBody>
        </Table>
      </Card>
    );
  },
};

type SortKey = "title" | "value";

export const Agrupada: StoryObj = {
  name: "Transações: por dia + ordenar (decisão)",
  render: function Render() {
    const [sort, setSort] = React.useState<{ key: SortKey; dir: SortDirection } | null>(null);
    const on = (key: SortKey) => (next: SortDirection | undefined) => setSort(next ? { key, dir: next } : null);
    const dirOf = (key: SortKey) => (sort?.key === key ? sort.dir : undefined);

    const sorted = React.useMemo(() => {
      if (!sort) return TXS;
      const k = sort.dir === "asc" ? 1 : -1;
      return [...TXS].sort(
        (a, b) =>
          sort.key === "title"
            ? a.title.localeCompare(b.title, "pt-BR") * k
            : new Decimal(a.eur).comparedTo(new Decimal(b.eur)) * k, // nunca float
      );
    }, [sort]);
    const days = [...new Set(TXS.map((t) => t.day))];

    return (
      <Section
        title="Agrupada por dia por padrão; clicar numa coluna ordena e vira lista plana"
        note="Clique em Descrição ou Valor: asc → desc → volta aos dias. Total do dia no cabeçalho do grupo."
      >
        <Card className="max-w-5xl overflow-hidden">
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH className="w-12" />
                <TH sort={dirOf("title")} onSort={on("title")}>
                  Descrição
                </TH>
                <TH>Categoria</TH>
                <TH>Responsável</TH>
                <TH className="text-right" sort={dirOf("value")} onSort={on("value")}>
                  Valor
                </TH>
              </TR>
            </THead>
            <TBody>
              {sort
                ? sorted.map((t) => <TxRow key={t.id} tx={t} />)
                : days.map((d) => (
                    <React.Fragment key={d}>
                      <TGroupRow label={d} colSpan={5} />
                      {TXS.filter((t) => t.day === d).map((t) => (
                        <TxRow key={t.id} tx={t} />
                      ))}
                    </React.Fragment>
                  ))}
            </TBody>
          </Table>
        </Card>
      </Section>
    );
  },
};
