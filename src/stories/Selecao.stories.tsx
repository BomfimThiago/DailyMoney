import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { Copy, MoreHorizontal, Pencil, SplitSquareHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FilterChip } from "@/components/ui/filter-chip";
import { MonthSwitcher } from "@/components/ui/month-switcher";
import { Segmented } from "@/components/ui/segmented";
import {
  SelectMenu,
  SelectMenuContent,
  SelectMenuItem,
  SelectMenuTrigger,
  SelectMenuValue,
} from "@/components/ui/select-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MemberAvatar } from "@/components/finance/member";
import { MEMBERS } from "./fixtures";
import { CategoryOptions } from "./_shared";
import { Row, Section } from "./_helpers";

const meta: Meta = { title: "Seleção" };
export default meta;

export const ComboboxDeCategoria: StoryObj = {
  name: "Combobox (com busca)",
  render: function Render() {
    const [v, setV] = React.useState<string>("mercado");
    return (
      <Section
        title="Combobox"
        note="Lista longa com busca e grupos. Digite 'sal' ou 'tra'. Opção de criar quando não encontra."
      >
        <div className="w-72">
          <Combobox
            options={CategoryOptions}
            value={v}
            onValueChange={setV}
            searchPlaceholder="Buscar categoria…"
            onCreate={(l) => alert(`Criar categoria: ${l}`)}
          />
        </div>
      </Section>
    );
  },
};

export const SelectMenuStory: StoryObj = {
  name: "SelectMenu (sem busca)",
  render: () => (
    <Section title="SelectMenu" note="Listas curtas com avatar/ícone. Ex.: responsável.">
      <div className="w-56">
        <SelectMenu defaultValue="sam">
          <SelectMenuTrigger>
            <SelectMenuValue placeholder="Responsável" />
          </SelectMenuTrigger>
          <SelectMenuContent>
            {Object.entries(MEMBERS).map(([k, m]) => (
              <SelectMenuItem key={k} value={k}>
                <MemberAvatar member={m} size="xs" />
                {m.name}
              </SelectMenuItem>
            ))}
          </SelectMenuContent>
        </SelectMenu>
      </div>
    </Section>
  ),
};

export const MenuDeAcoes: StoryObj = {
  name: "Dropdown menu (ações)",
  render: () => (
    <Section title="DropdownMenu" note="Para AÇÕES (editar, duplicar, excluir), não para escolher valor.">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size="icon-sm" aria-label="Mais ações">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>Transação</DropdownMenuLabel>
          <DropdownMenuItem>
            <Pencil />
            Editar
          </DropdownMenuItem>
          <DropdownMenuItem>
            <SplitSquareHorizontal />
            Dividir entre responsáveis
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Copy />
            Duplicar
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem destructive>
            <Trash2 />
            Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </Section>
  ),
};

export const SegmentadoETabs: StoryObj = {
  name: "Segmentado e Abas",
  render: function Render() {
    const [cur, setCur] = React.useState<"EUR" | "USD" | "BRL">("EUR");
    const [kind, setKind] = React.useState<"exp" | "inc">("exp");
    return (
      <>
        <Section title="Segmented" note="Escolha exclusiva sempre visível. Lente de moeda e Gastos/Entradas.">
          <Row>
            <Segmented
              aria-label="Moeda"
              value={cur}
              onValueChange={setCur}
              options={[
                { value: "EUR", label: "€ EUR" },
                { value: "USD", label: "US$ USD" },
                { value: "BRL", label: "R$ BRL" },
              ]}
            />
            <Segmented
              size="sm"
              value={kind}
              onValueChange={setKind}
              options={[
                { value: "exp", label: "Gastos" },
                { value: "inc", label: "Entradas" },
              ]}
            />
          </Row>
        </Section>
        <Section title="Tabs" note="Troca de conteúdo dentro de um card. Contador opcional.">
          <Tabs defaultValue="review" className="max-w-2xl">
            <TabsList>
              <TabsTrigger value="review" count={9}>
                Precisam de revisão
              </TabsTrigger>
              <TabsTrigger value="ready" count={51}>
                Prontas
              </TabsTrigger>
              <TabsTrigger value="dup" count={3}>
                Duplicadas
              </TabsTrigger>
            </TabsList>
            <TabsContent value="review" className="py-4 text-[13.5px] text-muted-foreground">
              9 linhas com dúvida…
            </TabsContent>
            <TabsContent value="ready" className="py-4 text-[13.5px] text-muted-foreground">
              51 linhas prontas…
            </TabsContent>
            <TabsContent value="dup" className="py-4 text-[13.5px] text-muted-foreground">
              3 já importadas…
            </TabsContent>
          </Tabs>
        </Section>
      </>
    );
  },
};

export const FiltrosEPeriodo: StoryObj = {
  name: "Filtros e período",
  render: function Render() {
    const [month, setMonth] = React.useState(new Date(2026, 7, 1));
    const [member, setMember] = React.useState<string | undefined>("Sam, Alex");
    return (
      <>
        <Section title="MonthSwitcher" note="Não avança além do mês atual.">
          <MonthSwitcher value={month} onChange={setMonth} max={new Date(2026, 10, 1)} />
        </Section>
        <Section
          title="MonthSwitcher com mês financeiro"
          note="Quando o mês começa no dia do salário (Configurações), os dias que ele cobre aparecem embaixo."
        >
          <MonthSwitcher value={new Date(2026, 10, 1)} onChange={() => {}} caption="27 out – 26 nov" />
        </Section>
        <Section title="FilterChip" note="Com “+” = adicionar filtro. Com valor = filtro ativo, com limpar.">
          <Row>
            <FilterChip label="Período" value="Ago 2026" />
            <FilterChip label="Responsável" value={member} onClear={() => setMember(undefined)} />
            <FilterChip label="Categoria" />
            <FilterChip label="Conta" />
          </Row>
        </Section>
      </>
    );
  },
};
