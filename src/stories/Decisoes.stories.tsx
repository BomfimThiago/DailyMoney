import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Card } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Field } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  SelectMenu,
  SelectMenuContent,
  SelectMenuGroup,
  SelectMenuItem,
  SelectMenuLabel,
  SelectMenuTrigger,
  SelectMenuValue,
} from "@/components/ui/select-menu";
import { Table, TBody, TGroupRow, TH, THead, TR } from "@/components/ui/table";
import { CategoryIcon } from "@/components/finance/category";
import { Money } from "@/components/finance/money";
import { CAT, EXPENSE_KEYS, INCOME_KEYS, TXS } from "./fixtures";
import { CategoryOptions } from "./_shared";
import { TxRow } from "./_shared";
import { Option } from "./_helpers";

const meta: Meta = {
  title: "Decisões",
  parameters: {
    docs: {
      description: {
        component: "Decisões tomadas (escolhida ✓). As opções descartadas ficam esmaecidas como registro.",
      },
    },
  },
};
export default meta;

function TxTable({ density, grouped }: { density: "comfortable" | "compact"; grouped: boolean }) {
  const rows = TXS.slice(0, 6);
  const days = [...new Set(rows.map((t) => t.day))];
  return (
    <Card className="overflow-hidden">
      <Table density={density}>
        {!grouped ? (
          <THead>
            <TR className="hover:bg-transparent">
              <TH />
              <TH>Descrição</TH>
              <TH>Categoria</TH>
              <TH>Resp.</TH>
              <TH className="text-right">Valor</TH>
            </TR>
          </THead>
        ) : null}
        <TBody>
          {grouped
            ? days.map((d) => (
                <React.Fragment key={d}>
                  <TGroupRow label={d} colSpan={5} />
                  {rows
                    .filter((t) => t.day === d)
                    .map((t) => (
                      <TxRow key={t.id} tx={t} />
                    ))}
                </React.Fragment>
              ))
            : rows.map((t) => <TxRow key={t.id} tx={t} />)}
        </TBody>
      </Table>
    </Card>
  );
}

export const TabelaDensidade: StoryObj = {
  name: "1 · Tabela: densidade",
  render: () => (
    <div className="flex gap-8">
      <Option
        chosen
        label="Opção A"
        title="Confortável (56px)"
        pros={["Leitura fácil, ícones respiram", "Bom para revisar com calma"]}
        cons={["Menos linhas por tela (~12)"]}
      >
        <TxTable density="comfortable" grouped={false} />
      </Option>
      <Option
        label="Opção B"
        title="Compacta (40px)"
        pros={["~18 linhas por tela", "Bom para conferir muitos lançamentos"]}
        cons={["Valor original embaixo aperta a linha"]}
      >
        <TxTable density="compact" grouped={false} />
      </Option>
    </div>
  ),
};

export const TabelaAgrupamento: StoryObj = {
  name: "2 · Tabela: agrupar por dia?",
  render: () => (
    <div className="flex gap-8">
      <Option
        chosen
        label="Opção A"
        title="Agrupada por dia + ordenar"
        pros={[
          "Lê como extrato",
          "Total do dia no cabeçalho",
          "Clicar numa coluna ordena e vira lista plana; clicar de novo volta aos dias",
        ]}
      >
        <TxTable density="comfortable" grouped />
      </Option>
      <Option
        label="Opção B"
        title="Lista plana com colunas"
        pros={["Ordenável por qualquer coluna", "Cabeçalho fixo"]}
        cons={["Datas se repetem em toda linha"]}
      >
        <TxTable density="comfortable" grouped={false} />
      </Option>
    </div>
  ),
};

export const EscolherCategoria: StoryObj = {
  name: "3 · Escolher categoria",
  render: function Render() {
    const [a, setA] = React.useState("mercado");
    const [c, setC] = React.useState("mercado");
    return (
      <div className="flex gap-8">
        <Option
          label="Opção A"
          title="Select nativo"
          pros={["Zero JS, ótimo no celular (abre o seletor do sistema)"]}
          cons={["Sem cor/ícone", "19 itens sem busca"]}
        >
          <Field label="Categoria">
            <Select value={a} onChange={(e) => setA(e.target.value)}>
              <optgroup label="Gastos">
                {EXPENSE_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {CAT[k].name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Entradas">
                {INCOME_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {CAT[k].name}
                  </option>
                ))}
              </optgroup>
            </Select>
          </Field>
        </Option>
        <Option
          label="Opção B"
          title="SelectMenu com ícone"
          pros={["Ícone e cor da categoria", "Teclado: digitar a inicial pula"]}
          cons={["Sem busca: rolar 19 itens"]}
        >
          <Field label="Categoria">
            <SelectMenu defaultValue="mercado">
              <SelectMenuTrigger>
                <SelectMenuValue />
              </SelectMenuTrigger>
              <SelectMenuContent>
                <SelectMenuGroup>
                  <SelectMenuLabel>Gastos</SelectMenuLabel>
                  {EXPENSE_KEYS.map((k) => (
                    <SelectMenuItem key={k} value={k}>
                      <CategoryIcon category={CAT[k]} size="sm" />
                      {CAT[k].name}
                    </SelectMenuItem>
                  ))}
                </SelectMenuGroup>
                <SelectMenuGroup>
                  <SelectMenuLabel>Entradas</SelectMenuLabel>
                  {INCOME_KEYS.map((k) => (
                    <SelectMenuItem key={k} value={k}>
                      <CategoryIcon category={CAT[k]} size="sm" />
                      {CAT[k].name}
                    </SelectMenuItem>
                  ))}
                </SelectMenuGroup>
              </SelectMenuContent>
            </SelectMenu>
          </Field>
        </Option>
        <Option
          chosen
          label="Opção C"
          title="Combobox com busca"
          pros={["Busca: 'mer' → Mercado", "Ícone, grupos e criar nova na hora"]}
          cons={["Um clique a mais para abrir a busca no celular"]}
        >
          <Field label="Categoria">
            <Combobox
              options={CategoryOptions}
              value={c}
              onValueChange={setC}
              searchPlaceholder="Buscar categoria…"
              onCreate={() => {}}
            />
          </Field>
        </Option>
      </div>
    );
  },
};

export const OndeUsarAccordion: StoryObj = {
  name: "4 · Onde usar accordion",
  render: () => (
    <div className="flex gap-8">
      <Option
        chosen
        label="Lugar 1"
        title="Filtros no celular"
        pros={["Muitos filtros em pouco espaço", "Resumo do filtro visível fechado"]}
      >
        <Accordion type="multiple" defaultValue={["cat"]}>
          <AccordionItem value="p">
            <AccordionTrigger aside={<span className="text-meta text-subtle">Ago 2026</span>}>Período</AccordionTrigger>
            <AccordionContent>…</AccordionContent>
          </AccordionItem>
          <AccordionItem value="cat">
            <AccordionTrigger aside={<span className="text-meta text-subtle">2</span>}>Categoria</AccordionTrigger>
            <AccordionContent>Mercado, Restaurantes…</AccordionContent>
          </AccordionItem>
          <AccordionItem value="m">
            <AccordionTrigger>Responsável</AccordionTrigger>
            <AccordionContent>…</AccordionContent>
          </AccordionItem>
        </Accordion>
      </Option>
      <Option
        chosen
        label="Lugar 2"
        title="Detalhes de cada importação"
        pros={["Lista curta, abre o detalhe sem trocar de página"]}
      >
        <Accordion variant="card" type="single" collapsible defaultValue="a">
          <AccordionItem value="a">
            <AccordionTrigger aside={<Money value="3912.40" currency="EUR" kind="EXPENSE" />}>
              Revolut · agosto
            </AccordionTrigger>
            <AccordionContent>63 linhas · 51 prontas · 9 revisar · 3 duplicadas</AccordionContent>
          </AccordionItem>
          <AccordionItem value="b">
            <AccordionTrigger aside={<Money value="412.30" currency="USD" kind="EXPENSE" />}>
              Wise USD · agosto
            </AccordionTrigger>
            <AccordionContent>48 confirmadas</AccordionContent>
          </AccordionItem>
        </Accordion>
      </Option>
      <Option
        chosen
        label="Lugar 3"
        title="Resumo: gastos por categoria → transações"
        pros={["Clica na categoria e vê as transações dela ali mesmo"]}
        cons={["Pode ficar longo; talvez melhor abrir Transações filtrada"]}
      >
        <Accordion type="single" collapsible defaultValue="m">
          <AccordionItem value="m">
            <AccordionTrigger aside={<Money value="612.38" currency="EUR" kind="EXPENSE" />}>
              <CategoryIcon category={CAT.mercado} size="sm" />
              Mercado
            </AccordionTrigger>
            <AccordionContent>Mercadona −€ 86,42 · Pão de Açúcar −€ 64,32 · …</AccordionContent>
          </AccordionItem>
          <AccordionItem value="r">
            <AccordionTrigger aside={<Money value="438.90" currency="EUR" kind="EXPENSE" />}>
              <CategoryIcon category={CAT.restaurantes} size="sm" />
              Restaurantes
            </AccordionTrigger>
            <AccordionContent>…</AccordionContent>
          </AccordionItem>
        </Accordion>
      </Option>
    </div>
  ),
};
