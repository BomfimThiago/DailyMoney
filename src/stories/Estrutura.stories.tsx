import type { Meta, StoryObj } from "@storybook/react";
import { Upload } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Segmented } from "@/components/ui/segmented";
import { MonthSwitcher } from "@/components/ui/month-switcher";
import { Money } from "@/components/finance/money";
import { Section } from "./_helpers";

const meta: Meta = { title: "Estrutura" };
export default meta;

export const CabecalhoDePagina: StoryObj = {
  name: "PageHeader",
  render: () => (
    <PageHeader
      eyebrow="Agosto · 2026"
      title="Resumo"
      description="Valores em euro, convertidos pela taxa do dia de cada compra"
      actions={
        <>
          <MonthSwitcher value={new Date(2026, 7, 1)} onChange={() => {}} />
          <Segmented
            value="EUR"
            onValueChange={() => {}}
            options={[
              { value: "EUR", label: "€ EUR" },
              { value: "USD", label: "US$ USD" },
              { value: "BRL", label: "R$ BRL" },
            ]}
          />
          <Button>
            <Upload />
            Importar extrato
          </Button>
        </>
      }
    />
  ),
};

export const Cards: StoryObj = {
  render: () => (
    <div className="grid max-w-4xl grid-cols-2 gap-5">
      <Card>
        <CardHeader
          action={
            <Button variant="link" size="sm">
              Todas
            </Button>
          }
        >
          <CardTitle>Gastos por categoria</CardTitle>
          <CardDescription>Agosto · transferências internas excluídas</CardDescription>
        </CardHeader>
        <CardContent className="text-[13.5px] text-muted-foreground">Conteúdo do card…</CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Com rodapé</CardTitle>
        </CardHeader>
        <CardContent className="text-[13.5px] text-muted-foreground">Formulário curto…</CardContent>
        <CardFooter className="justify-end">
          <Button variant="secondary">Cancelar</Button>
          <Button>Salvar</Button>
        </CardFooter>
      </Card>
    </div>
  ),
};

export const AccordionStory: StoryObj = {
  name: "Accordion",
  render: () => (
    <div className="grid max-w-5xl grid-cols-2 gap-10">
      <Section title='variant="plain"' note="Divisórias finas. Filtros no celular, configurações, FAQ.">
        <Accordion type="multiple" defaultValue={["cat"]}>
          <AccordionItem value="period">
            <AccordionTrigger aside={<span className="text-meta text-subtle">Ago 2026</span>}>Período</AccordionTrigger>
            <AccordionContent>Seletor de mês…</AccordionContent>
          </AccordionItem>
          <AccordionItem value="cat">
            <AccordionTrigger aside={<span className="text-meta text-subtle">2 selecionadas</span>}>
              Categoria
            </AccordionTrigger>
            <AccordionContent>Lista de categorias com checkbox…</AccordionContent>
          </AccordionItem>
          <AccordionItem value="member">
            <AccordionTrigger>Responsável</AccordionTrigger>
            <AccordionContent>Alex, Sam, Casa…</AccordionContent>
          </AccordionItem>
        </Accordion>
      </Section>
      <Section title='variant="card"' note="Cada item é um card. Detalhes de importação, grupos de categorias.">
        <Accordion variant="card" type="single" collapsible defaultValue="a">
          <AccordionItem value="a">
            <AccordionTrigger aside={<Money value="3912.40" currency="EUR" kind="EXPENSE" />}>
              Revolut · agosto
            </AccordionTrigger>
            <AccordionContent>63 linhas · 51 prontas · 9 para revisar · 3 duplicadas</AccordionContent>
          </AccordionItem>
          <AccordionItem value="b">
            <AccordionTrigger aside={<Money value="412.30" currency="USD" kind="EXPENSE" />}>
              Wise USD · agosto
            </AccordionTrigger>
            <AccordionContent>48 transações confirmadas</AccordionContent>
          </AccordionItem>
        </Accordion>
      </Section>
    </div>
  ),
};
