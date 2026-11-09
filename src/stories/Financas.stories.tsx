import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { CategoryIcon, CategoryPill, CategoryTag } from "@/components/finance/category";
import { CategoryPicker } from "@/components/finance/category-picker";
import { Field } from "@/components/ui/label";
import { ConfidenceMeter } from "@/components/finance/confidence-meter";
import { CurrencyTag } from "@/components/finance/currency-tag";
import { MemberAvatar, MemberChip } from "@/components/finance/member";
import { Money } from "@/components/finance/money";
import { CardBills } from "@/components/finance/card-bills";
import { CardGroupRow } from "@/components/finance/card-group-row";
import { Movements } from "@/components/finance/movements";
import { InvestmentList, type InvestmentItem } from "@/components/finance/investments";
import { Allocation, MaturityLadderChart } from "@/components/finance/portfolio-charts";
import { CLASS_COLOR } from "@/lib/investments/summary";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TGroupRow } from "@/components/ui/table";
import { CAT, MEMBERS, PICKER_CATS } from "./fixtures";
import { Row, Section } from "./_helpers";

const meta: Meta<typeof Money> = {
  title: "Finanças/Money",
  component: Money,
  args: { value: "86.42", currency: "EUR", kind: "EXPENSE", size: "md" },
  argTypes: {
    kind: { control: "inline-radio", options: ["EXPENSE", "INCOME", "TRANSFER", "NEUTRAL"] },
    currency: { control: "inline-radio", options: ["EUR", "USD", "BRL"] },
    size: { control: "inline-radio", options: ["sm", "md", "lg", "display"] },
    value: { control: "text" },
  },
};
export default meta;
type S = StoryObj<typeof Money>;

export const Playground: S = {};

export const Regras: S = {
  name: "Como mostrar dinheiro",
  render: () => (
    <div className="max-w-xl divide-y rounded-2xl bg-card px-6 shadow-surface">
      {[
        ["Gasto", "tinta, sinal “−”", <Money key="a" value="86.42" currency="EUR" kind="EXPENSE" />],
        ["Entrada", "verde, sinal “+”", <Money key="b" value="4200" currency="EUR" kind="INCOME" />],
        [
          "Gasto em outra moeda",
          "convertido em cima, original embaixo",
          <Money key="c" value="13.24" currency="EUR" kind="EXPENSE" original={{ value: "15.49", currency: "USD" }} />,
        ],
        [
          "Transferência interna",
          "cinza, sem sinal, fora dos totais",
          <Money key="d" value="500" currency="EUR" kind="TRANSFER" />,
        ],
        [
          "Arredondamento",
          "string com 4 casas → 2 casas, half-up",
          <Money key="e" value="2.6750" currency="BRL" kind="EXPENSE" />,
        ],
        [
          "Destaque (KPI)",
          "número grande",
          <Money key="f" value="2236.48" currency="EUR" kind="INCOME" size="display" />,
        ],
      ].map(([t, n, m]) => (
        <div key={t as string} className="flex items-center gap-4 py-3.5">
          <div className="flex-1">
            <div className="text-[13.5px] font-medium">{t}</div>
            <div className="text-meta text-subtle">{n}</div>
          </div>
          {m}
        </div>
      ))}
    </div>
  ),
};

export const Categoria: S = {
  name: "Categoria, responsável, moeda",
  render: () => (
    <>
      <Section title="CategoryIcon">
        <Row>
          {(["sm", "md", "lg"] as const).map((s) => (
            <CategoryIcon key={s} category={CAT.mercado} size={s} />
          ))}
          <CategoryIcon category={CAT.viagem} />
          <CategoryIcon category={{ name: "Sem ícone", color: "#64748b" }} />
        </Row>
      </Section>
      <Section
        title="CategoryPill"
        note="Brilho azul = sugestão da IA ainda não aceita. Sem categoria = âmbar (pede ação)."
      >
        <Row>
          <CategoryPill category={CAT.mercado} />
          <CategoryPill category={CAT.restaurantes} />
          <CategoryPill category={CAT.compras} suggested interactive />
          <CategoryPill category={null} interactive />
        </Row>
      </Section>
      <Section
        title="CategoryTag"
        note="Estilo pastel: o nome no fundo pálido do matiz da categoria, tinta escura do mesmo matiz. Usado no Resumo e nas linhas de transação (sem ícone em quadrado)."
      >
        <Row>
          {Object.values(CAT)
            .slice(0, 8)
            .map((c) => (
              <CategoryTag key={c.name} category={c} />
            ))}
          <CategoryTag category={CAT.mercado} size="sm" />
        </Row>
      </Section>
      <Section title="MemberAvatar e MemberChip">
        <Row>
          {(["xs", "sm", "md", "lg"] as const).map((s) => (
            <MemberAvatar key={s} member={MEMBERS.alex} size={s} />
          ))}
          <MemberChip member={MEMBERS.sam} />
          <MemberChip member={MEMBERS.casa} />
          <MemberChip member={null} />
        </Row>
      </Section>
      <Section title="CurrencyTag">
        <Row>
          <CurrencyTag currency="EUR" />
          <CurrencyTag currency="USD" />
          <CurrencyTag currency="BRL" />
        </Row>
      </Section>
      <Section title="ConfidenceMeter" note="≥ 85% verde · ≥ 65% âmbar · abaixo vermelho.">
        <Row className="gap-8">
          <ConfidenceMeter value={0.96} />
          <ConfidenceMeter value={0.74} />
          <ConfidenceMeter value={0.42} />
        </Row>
      </Section>
    </>
  ),
};

export const SeletorDeCategoria: S = {
  name: "CategoryPicker (decisão: combobox)",
  render: function Render() {
    const [a, setA] = React.useState<string>("mercado");
    const [b, setB] = React.useState<string>("compras");
    const [accepted, setAccepted] = React.useState(false);
    return (
      <div className="flex flex-wrap gap-12">
        <Section
          title='appearance="field"'
          note="Formulários (painel de detalhe, nova transação). Grupos Gastos/Entradas, busca, criar na hora."
        >
          <div className="w-72">
            <Field label="Categoria">
              <CategoryPicker
                categories={PICKER_CATS}
                value={a}
                onChange={setA}
                onCreate={(n) => alert(`Criar: ${n}`)}
              />
            </Field>
          </div>
        </Section>
        <Section
          title='appearance="pill"'
          note="Dentro de linhas (revisão/tabela): a pílula é o gatilho. Brilho = sugestão da IA até você escolher."
        >
          <CategoryPicker
            appearance="pill"
            kind="EXPENSE"
            categories={PICKER_CATS}
            value={b}
            suggested={!accepted}
            onChange={(v) => {
              setB(v);
              setAccepted(true);
            }}
          />
        </Section>
      </div>
    );
  },
};

export const CartaoNaLista: S = {
  name: "Cartão de crédito na lista",
  render: () => <CartaoNaListaDemo />,
};

function CartaoNaListaDemo() {
  const [opened, setOpened] = React.useState(0);
  return (
    <div className="max-w-2xl space-y-3">
      <Card className="overflow-hidden">
        <Table>
          <TBody>
            <TGroupRow colSpan={4} label="Cartões" />
            <CardGroupRow
              label="Cartão de crédito"
              bank="Nubank"
              count={14}
              amount="-2340.15"
              lens="BRL"
              between={<TD colSpan={2} />}
              onOpen={() => setOpened((n) => n + 1)}
            />
            <TGroupRow colSpan={4} label="Qui, 5 nov" />
          </TBody>
        </Table>
      </Card>
      <p className="text-meta text-subtle">
        As compras do cartão saem dos dias e ficam numa linha que abre todas elas (aberta {opened}×). Cada compra
        continua com a sua categoria; o pagamento da fatura entra como transferência interna.
      </p>
    </div>
  );
}

const BILL = (brl: string) => ({ amountBRL: brl, amountUSD: null, amountEUR: null });

export const FaturaDoCartao: S = {
  name: "Fatura do cartão (Resumo)",
  render: () => (
    <div className="grid max-w-3xl gap-6 md:grid-cols-2">
      <Card className="p-6">
        <p className="mb-4 text-meta text-subtle">Mês passado: fatura paga, a próxima já fechou</p>
        <CardBills
          lens="BRL"
          monthName="outubro"
          nextName="novembro"
          nextIsOpen={false}
          billsKnown
          cards={[
            {
              bank: "Nubank",
              account: "Cartão de crédito",
              bill: { count: 21, _sum: BILL("-725.45") },
              next: { count: 18, _sum: BILL("-612.30") },
              paid: [{ date: "2026-10-02T00:00:00.000Z", _sum: BILL("725.45") }],
            },
          ]}
        />
      </Card>
      <Card className="p-6">
        <p className="mb-4 text-meta text-subtle">Mês atual: ainda sem pagamento, próxima aberta</p>
        <CardBills
          lens="BRL"
          monthName="novembro"
          nextName="dezembro"
          nextIsOpen
          isCurrentMonth
          billsKnown
          cards={[
            {
              bank: "Nubank",
              account: "Cartão de crédito",
              bill: { count: 18, _sum: BILL("-612.30") },
              next: { count: 3, _sum: BILL("-184.90") },
              paid: [],
            },
          ]}
        />
      </Card>
      <Card className="p-6 md:col-span-2">
        <p className="mb-4 text-meta text-subtle">Compras importadas antes do mês da fatura existir</p>
        <CardBills lens="BRL" monthName="novembro" nextName="dezembro" nextIsOpen billsKnown={false} cards={[]} />
      </Card>
    </div>
  ),
};

const BRL = (v: string) => ({ amountBRL: v, amountUSD: null, amountEUR: null });
const GRP = (key: string, name: string | null, out: string | null, inn: string | null, color = "#7c8aa5") => ({
  key,
  category: name ? { name, color, icon: "transfer" } : null,
  out: out ? { count: 2, _sum: BRL(out) } : { count: 0, _sum: null },
  in: inn ? { count: 1, _sum: BRL(inn) } : { count: 0, _sum: null },
});

export const Movimentacoes: S = {
  name: "Movimentações (Resumo)",
  render: () => (
    <div className="grid max-w-3xl gap-6 md:grid-cols-2">
      <Card className="p-6">
        <p className="mb-4 text-meta text-subtle">Contas faltando: saiu mais do que voltou</p>
        <Movements
          lens="BRL"
          groups={[
            GRP("inv", "Aplicações e resgates", "-5000.00", "1200.00", "#3f8f6b"),
            GRP("entre", "Entre minhas contas", "-2300.00", "800.00"),
            GRP("cartao", "Pagamento de cartão", "-725.45", "725.45", "#b06a3b"),
          ]}
        />
      </Card>
      <Card className="p-6">
        <p className="mb-4 text-meta text-subtle">Todas as contas conectadas: fecha</p>
        <Movements
          lens="BRL"
          groups={[GRP("entre", "Entre minhas contas", "-1500.00", "1500.00"), GRP("none", null, "-40.00", "40.00")]}
        />
      </Card>
    </div>
  ),
};

const INV = (
  id: string,
  name: string,
  type: string,
  subtype: string,
  brl: string,
  over: Partial<InvestmentItem> = {},
): InvestmentItem => ({
  id,
  name,
  type,
  subtype,
  bank: "Inter",
  issuer: null,
  code: null,
  currency: "BRL",
  balance: brl,
  balanceBRL: brl,
  balanceEUR: (Number(brl) * 0.16).toFixed(2),
  balanceUSD: (Number(brl) * 0.18).toFixed(2),
  amountOriginal: null,
  rate: null,
  rateType: null,
  fixedAnnualRate: null,
  dueDate: null,
  ...over,
});

export const Investimentos: S = {
  name: "Investimentos (por classe)",
  render: () => (
    <div className="grid max-w-4xl gap-6 md:grid-cols-2">
      <Card className="p-6">
        <p className="mb-4 text-meta text-subtle">Renda fixa: taxa, vencimento e quanto rendeu</p>
        <InvestmentList
          lens="BRL"
          items={[
            INV("a", "CDB Banco Pleno", "FIXED_INCOME", "CDB", "10512.40", {
              issuer: "Banco Pleno",
              amountOriginal: "10000.00",
              rate: "110",
              rateType: "CDI",
              dueDate: "2028-06-05T00:00:00.000Z",
            }),
            INV("b", "LCI Inter", "FIXED_INCOME", "LCI", "3020.11", {
              bank: "Nubank",
              issuer: "Banco Inter",
              amountOriginal: "3000.00",
              rate: "95",
              rateType: "CDI",
              fixedAnnualRate: "0.5",
              dueDate: "2027-01-12T00:00:00.000Z",
            }),
            INV("c", "Tesouro IPCA+ 2035", "FIXED_INCOME", "TREASURY", "4810.00", {
              code: "NTNB 2035",
              amountOriginal: "5000.00",
              rate: "100",
              rateType: "IPCA",
              fixedAnnualRate: "6.42",
              dueDate: "2035-05-15T00:00:00.000Z",
            }),
          ]}
        />
      </Card>
      <Card className="p-6">
        <p className="mb-4 text-meta text-subtle">Ações e FIIs, em euro: sem aplicado, só o saldo</p>
        <InvestmentList
          lens="EUR"
          items={[
            INV("d", "ITAUSA PN", "EQUITY", "STOCK", "2250.00", { code: "ITSA4" }),
            INV("e", "Fundo Imobiliário de Galpões Logísticos do Sudeste", "EQUITY", "REAL_ESTATE_FUND", "880.50", {
              code: "GLOG11",
              issuer: "Gestora XP",
            }),
          ]}
        />
      </Card>
    </div>
  ),
};

export const Carteira: S = {
  name: "Investimentos (alocação e vencimentos)",
  render: () => (
    <div className="grid max-w-5xl gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Alocação</CardTitle>
          <CardDescription>Renda fixa é mais da metade da carteira.</CardDescription>
        </CardHeader>
        <CardContent>
          <Allocation
            currency="BRL"
            items={[
              {
                key: "fixed",
                label: "Renda fixa",
                color: CLASS_COLOR.fixed,
                total: "28763.28",
                share: "65",
                fraction: "0.6549",
                count: 3,
              },
              {
                key: "treasury",
                label: "Tesouro Direto",
                color: CLASS_COLOR.treasury,
                total: "10930.30",
                share: "25",
                fraction: "0.2489",
                count: 2,
              },
              {
                key: "stocks",
                label: "Ações",
                color: CLASS_COLOR.stocks,
                total: "2250.00",
                share: "5",
                fraction: "0.0512",
                count: 1,
              },
              {
                key: "etf",
                label: "ETFs",
                color: CLASS_COLOR.etf,
                total: "1340.00",
                share: "3",
                fraction: "0.0305",
                count: 1,
              },
              {
                key: "realEstate",
                label: "Fundos imobiliários",
                color: CLASS_COLOR.realEstate,
                total: "880.50",
                share: "2",
                fraction: "0.0200",
                count: 1,
              },
            ]}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Quando o dinheiro volta</CardTitle>
          <CardDescription>O maior volume vence em 2027: R$ 18.250,88 em 2 títulos.</CardDescription>
        </CardHeader>
        <CardContent>
          <MaturityLadderChart
            currency="BRL"
            steps={[
              { label: "2026", year: 2026, total: "0.00", count: 0 },
              { label: "2027", year: 2027, total: "18250.88", count: 2 },
              { label: "2028", year: 2028, total: "10512.40", count: 1 },
              { label: "2029", year: 2029, total: "6120.30", count: 1 },
              { label: "2030", year: 2030, total: "0.00", count: 0 },
              { label: "2031", year: 2031, total: "0.00", count: 0 },
              { label: "2032", year: 2032, total: "0.00", count: 0 },
              { label: "2033+", year: 2033, total: "4810.00", count: 1 },
            ]}
          />
        </CardContent>
      </Card>
      <Card className="max-w-[375px]">
        <CardHeader>
          <CardTitle>Celular, poucos anos</CardTitle>
        </CardHeader>
        <CardContent>
          <MaturityLadderChart
            currency="EUR"
            steps={[
              { label: "2026", year: 2026, total: "320.00", count: 1 },
              { label: "2027", year: 2027, total: "2900.10", count: 2 },
              { label: "2028", year: 2028, total: "1500.00", count: 1 },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  ),
};
