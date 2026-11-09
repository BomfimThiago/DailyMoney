import type { Meta, StoryObj } from "@storybook/react";
import { BarPairChart, StackedBar } from "@/components/ui/bar-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BreakdownList } from "@/components/finance/breakdown-list";
import * as React from "react";
import { CategoryTag } from "@/components/finance/category";
import { Money } from "@/components/finance/money";
import { MonthComparison } from "@/components/finance/month-comparison";
import { KeyValues } from "@/components/ui/key-values";
import { KpiTabs } from "@/components/ui/kpi-tabs";
import { LineChart } from "@/components/ui/line-chart";
import { MemberAvatar } from "@/components/finance/member";
import { PaceChart } from "@/components/finance/pace-chart";
import { FlowChart } from "@/components/finance/flow-chart";
import { SpendingCalendar } from "@/components/finance/spending-calendar";
import { monthFlow, spendingCalendar } from "@/lib/transactions/aggregate";
import { periodDates } from "@/lib/period";
import { TransactionListItem } from "@/components/finance/transaction-list-item";
import { Decimal, formatAmount } from "@/lib/money";
import { CAT, MEMBERS } from "./fixtures";
import { Section } from "./_helpers";

const meta: Meta = { title: "Exibição/Gráficos e listas" };
export default meta;

const MONTHS = ["set", "out", "nov", "dez", "jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago"];
const SERIES = [
  ["5900", "4600"],
  ["6100", "4900"],
  ["5900", "5200"],
  ["7800", "6400"],
  ["6000", "4400"],
  ["6000", "4100"],
  ["6200", "4700"],
  ["6200", "4300"],
  ["6300", "5000"],
  ["6300", "4600"],
  ["6400", "5300"],
  ["6420", "4183.52"],
];

export const BarrasEmPares: StoryObj = {
  name: "BarPairChart",
  render: () => (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>Entradas × gastos</CardTitle>
      </CardHeader>
      <CardContent>
        <BarPairChart
          legend={{ a: "Entradas", b: "Gastos" }}
          data={SERIES.map(([a, b], i) => ({
            label: MONTHS[i],
            a,
            b,
            hint: `entrou ${formatAmount(a, "EUR")} · gastou ${formatAmount(b, "EUR")}`,
          }))}
          formatTick={(v) => formatAmount(v, "EUR").replace(/,00$/, "")}
        />
      </CardContent>
    </Card>
  ),
};

const CATS = [
  ["mercado", "612.38", "0.3200"],
  ["moradia", "450.00", "0.2351"],
  ["restaurantes", "438.90", "0.2293"],
  ["transporte", "296.40", "0.1549"],
  ["assinaturas", "116.10", "0.0607"],
] as const;

export const Participacao: StoryObj = {
  name: "BreakdownList e StackedBar",
  render: () => (
    <div className="grid max-w-5xl grid-cols-2 gap-5">
      <Section
        title="Com accordion + limite"
        note="Clique numa categoria: abre as transações ali mesmo. limit=3 mostra “Mostrar todas”."
      >
        <Card>
          <CardContent>
            <BreakdownList
              currency="EUR"
              limit={3}
              items={CATS.map(([k, total, share]) => ({
                key: k,
                label: CAT[k].name,
                color: CAT[k].color,
                total,
                share,
                count: 4,
                labelNode: <CategoryTag category={CAT[k]} />,
              }))}
              renderDetail={(it) => (
                <p className="text-meta text-subtle">
                  {it.count} transações de {it.label}…
                </p>
              )}
            />
          </CardContent>
        </Card>
      </Section>
      <Section title="Sem barras (responsável)">
        <Card>
          <CardContent className="space-y-4">
            <StackedBar
              items={[
                { key: "a", share: "0.55", color: MEMBERS.alex.color, label: "Alex" },
                { key: "s", share: "0.36", color: MEMBERS.sam.color, label: "Sam" },
                { key: "c", share: "0.09", color: MEMBERS.casa.color, label: "Casa" },
              ]}
            />
            <BreakdownList
              currency="EUR"
              showBars={false}
              items={[
                ["alex", "2310.20", "0.552"],
                ["sam", "1512.82", "0.362"],
                ["casa", "360.50", "0.086"],
              ].map(([k, total, share]) => ({
                key: k,
                label: MEMBERS[k].name,
                color: MEMBERS[k].color,
                total,
                share,
                count: 1,
                leading: <MemberAvatar member={MEMBERS[k]} size="sm" />,
              }))}
            />
          </CardContent>
        </Card>
      </Section>
    </div>
  ),
};

export const LinhaDeTransacao: StoryObj = {
  name: "TransactionListItem",
  render: () => (
    <Card className="max-w-2xl divide-y overflow-hidden py-1">
      <TransactionListItem
        lens="EUR"
        tx={{
          id: "1",
          date: "2026-08-20",
          description: "Mercadona",
          type: "EXPENSE",
          state: "COMPLETED",
          isInternalTransfer: false,
          baseCurrency: "EUR",
          baseAmount: "-86.42",
          amountEUR: "-86.42",
          amountUSD: "-101.10",
          amountBRL: "-554.80",
          bank: "Revolut",
          category: CAT.mercado as never,
          member: MEMBERS.sam,
        }}
      />
      <TransactionListItem
        lens="EUR"
        tx={{
          id: "2",
          date: "2026-08-19",
          description: "Netflix",
          type: "EXPENSE",
          state: "PENDING",
          isInternalTransfer: false,
          baseCurrency: "USD",
          baseAmount: "-15.49",
          amountEUR: "-13.24",
          amountUSD: "-15.49",
          amountBRL: "-85.00",
          bank: "Wise",
          category: CAT.assinaturas as never,
          member: MEMBERS.alex,
        }}
      />
      <TransactionListItem
        lens="EUR"
        tx={{
          id: "3",
          date: "2026-08-19",
          description: "Salário",
          type: "INCOME",
          state: "COMPLETED",
          isInternalTransfer: false,
          baseCurrency: "EUR",
          baseAmount: "4200",
          amountEUR: "4200",
          amountUSD: "4913.16",
          amountBRL: "26962.32",
          bank: "Revolut",
          category: CAT.salario as never,
          member: MEMBERS.alex,
        }}
      />
      <TransactionListItem
        lens="EUR"
        tx={{
          id: "4",
          date: "2026-08-18",
          description: "Wise → Revolut",
          type: "TRANSFER",
          state: "COMPLETED",
          isInternalTransfer: true,
          baseCurrency: "EUR",
          baseAmount: "-500",
          amountEUR: "-500",
          amountUSD: "-584.90",
          amountBRL: "-3209.80",
          bank: "Revolut",
          category: null,
          member: MEMBERS.alex,
        }}
      />
    </Card>
  ),
};

// Série de 12 meses (string decimal, como vem dos hooks). Sobra = entradas − gastos.
const NET = SERIES.map(([a, b]) => ({ a, b, net: new Decimal(a).minus(b).toFixed(2) }));

function KpiTabsDemo() {
  const [v, setV] = React.useState<"net" | "income" | "expense">("net");
  const pick = (k: typeof v) =>
    NET.map((m, i) => ({ label: MONTHS[i], value: k === "net" ? m.net : k === "income" ? m.a : m.b }));
  return (
    <Card className="max-w-5xl">
      <CardContent className="flex flex-col gap-6 pt-6">
        <KpiTabs
          aria-label="Série do gráfico"
          value={v}
          onValueChange={setV}
          tabs={[
            {
              value: "net",
              label: "Sobrou no mês",
              lead: true,
              figure: <Money value="2236.48" currency="EUR" kind="INCOME" size="display" align="left" />,
              note: "34,8% do que entrou",
            },
            {
              value: "income",
              label: "Entradas",
              figure: <Money value="6420" currency="EUR" kind="INCOME" size="figure" align="left" />,
              note: "+0,3% vs julho",
            },
            {
              value: "expense",
              label: "Gastos",
              figure: <Money value="4183.52" currency="EUR" size="figure" align="left" />,
              note: (
                <span>
                  <span className="font-medium text-success">−21,1%</span> vs julho
                </span>
              ),
            },
          ]}
        />
        <LineChart
          aria-label="Série escolhida por mês"
          height={180}
          data={pick(v)}
          formatTick={(t) => (t === 0 ? "0" : `€ ${t / 1000} mil`)}
        />
      </CardContent>
    </Card>
  );
}

export const AbasDeKpi: StoryObj = {
  name: "KpiTabs + LineChart (Resumo)",
  render: () => <KpiTabsDemo />,
};

export const Comparacao: StoryObj = {
  name: "MonthComparison e KeyValues",
  render: () => (
    <Card className="max-w-5xl">
      <CardContent className="grid grid-cols-1 items-start gap-x-12 gap-y-6 pt-6 lg:grid-cols-2">
        <MonthComparison
          currency="EUR"
          previousLabel="julho"
          rows={[
            { key: "net", label: "Sobrou", current: "2236.48", previous: "1100.00", better: "up" },
            { key: "income", label: "Entradas", current: "6420.00", previous: "6400.00", better: "up" },
            { key: "expense", label: "Gastos", current: "4183.52", previous: "5300.00", better: "down" },
          ]}
        />
        <KeyValues
          title="Nos últimos 12 meses"
          items={[
            { key: "avg", label: "Gasto médio por mês", value: <Money value="4806.13" currency="EUR" /> },
            { key: "pr", label: "Mês mais caro", value: "Dezembro 2025" },
            { key: "pos", label: "Meses com sobra", value: "12 de 12" },
          ]}
        />
      </CardContent>
    </Card>
  ),
};

/** Acumulado de uma lista de gastos por dia (valores inteiros: soma exata). */
const acumulado = (perDay: number[]) => {
  let run = 0;
  return perDay.map((v) => String((run += v)));
};
const OUTUBRO = acumulado([
  120, 80, 0, 340, 60, 0, 0, 95, 210, 40, 0, 1800, 75, 60, 0, 30, 220, 90, 0, 45, 130, 0, 60, 310, 85, 0, 40, 150, 70,
  20, 95,
]);
const NOVEMBRO = acumulado([60, 0, 140, 1800, 90, 35, 210, ...Array(23).fill(0)]);

export const RitmoDoMes: StoryObj = {
  name: "Ritmo do mês (Resumo)",
  render: () => (
    <div className="grid max-w-5xl gap-6 lg:grid-cols-2">
      <Card className="p-6">
        <p className="mb-4 text-meta text-subtle">Mês corrente: até o dia 7, por cima de outubro inteiro</p>
        <PaceChart
          current={NOVEMBRO}
          upTo={7}
          previous={OUTUBRO}
          days={30}
          currency="BRL"
          monthShort="nov"
          currentName="novembro"
          previousName="outubro"
        />
      </Card>
      <Card className="p-6">
        <p className="mb-4 text-meta text-subtle">Mês fechado (outubro) contra setembro, que gastou mais</p>
        <PaceChart
          current={OUTUBRO}
          upTo={31}
          previous={acumulado(Array(30).fill(160))}
          days={31}
          currency="BRL"
          monthShort="out"
          currentName="outubro"
          previousName="setembro"
        />
      </Card>
      <Card className="p-6">
        <p className="mb-4 text-meta text-subtle">
          Mês financeiro (27/out a 26/nov): o eixo mostra as datas, não a posição
        </p>
        <PaceChart
          current={NOVEMBRO.concat(NOVEMBRO.at(-1)!)}
          upTo={7}
          previous={OUTUBRO.slice(0, 30)}
          days={31}
          currency="BRL"
          monthShort="nov"
          dates={periodDates("2026-11", 27)}
          currentName="novembro"
          previousName="outubro"
        />
      </Card>
    </div>
  ),
};

// Fluxo do mês: transações de exemplo passadas pela mesma conta do Resumo (monthFlow).
const flowTx = (cat: keyof typeof CAT, brl: string, internal = false) => ({
  amountBRL: brl,
  amountUSD: "0",
  amountEUR: "0",
  type: brl.startsWith("-") ? "EXPENSE" : "INCOME",
  isInternalTransfer: internal,
  cat,
});
const byCat = (t: { cat: keyof typeof CAT }) => ({ key: t.cat, label: CAT[t.cat].name, color: CAT[t.cat].color });
const SOBRA = monthFlow(
  [
    flowTx("salario", "9200.00"),
    flowTx("freelance", "1850.00"),
    flowTx("reembolso", "240.00"),
    flowTx("moradia", "-3100.00"),
    flowTx("mercado", "-1420.35"),
    flowTx("restaurantes", "-690.10"),
    flowTx("transporte", "-410.00"),
    flowTx("contas", "-388.90"),
    flowTx("assinaturas", "-119.70"),
    flowTx("saude", "-96.00"),
    flowTx("lazer", "-60.00"),
    flowTx("outros", "-5000.00", true), // aplicação: movimentação, fica fora
  ],
  "BRL",
  byCat,
)!;
const RESERVAS = monthFlow(
  [
    flowTx("salario", "6100.00"),
    flowTx("viagem", "-4300.00"),
    flowTx("moradia", "-3100.00"),
    flowTx("mercado", "-980.00"),
    flowTx("impostos", "-412.00"),
  ],
  "BRL",
  byCat,
)!;

export const FluxoDoMes: StoryObj = {
  name: "Fluxo do mês (Resumo)",
  render: () => (
    <div className="flex max-w-5xl flex-col gap-6">
      <Card className="p-6">
        <p className="mb-4 text-meta text-subtle">
          Mês com sobra: entradas à esquerda, gastos e o que sobrou à direita (as 5 maiores e o resto junto)
        </p>
        <FlowChart flow={SOBRA} currency="BRL" />
      </Card>
      <Card className="p-6">
        <p className="mb-4 text-meta text-subtle">Gasto acima da entrada: a diferença entra como “Das reservas”</p>
        <FlowChart flow={RESERVAS} currency="BRL" />
      </Card>
      <Card className="max-w-[375px] p-4">
        <p className="mb-4 text-meta text-subtle">Celular: sem a coluna das entradas</p>
        <FlowChart flow={SOBRA} currency="BRL" />
      </Card>
    </div>
  ),
};

// Calendário de gastos: novembro de 2026 começa num domingo; outubro, numa quinta.
const DIAS_NOV = ["1150.00", "42.10", "0.00", "86.30", "18.90", "230.00", "61.40", "0.00", "12.00"].concat(
  Array(21).fill("0.00"),
);
const DIAS_OUT = [
  "1150.00",
  "64.20",
  "0.00",
  "35.00",
  "212.40",
  "18.00",
  "0.00",
  "77.90",
  "0.00",
  "120.00",
  "43.10",
  "9.90",
  "0.00",
  "300.00",
  "56.00",
  "0.00",
  "22.50",
  "88.00",
  "14.00",
  "0.00",
  "640.00",
  "31.00",
  "0.00",
  "47.80",
  "19.90",
  "0.00",
  "0.00",
  "105.00",
  "12.40",
  "63.00",
  "28.00",
];

/** `start`: o primeiro dia ("AAAA-MM-DD"); o calendário tira dele a semana e os meses. */
function CalendarDemo({ daily, upTo, start }: { daily: string[]; upTo: number; start: string }) {
  const [sel, setSel] = React.useState<number | null>(upTo === daily.length ? null : 4);
  const c = spendingCalendar(daily, upTo, start);
  return (
    <SpendingCalendar
      days={c.days}
      today={upTo < daily.length ? upTo : undefined}
      currency="EUR"
      selected={sel}
      onSelect={setSel}
    />
  );
}

export const CalendarioDeGastos: StoryObj = {
  name: "Calendário de gastos (Resumo)",
  render: () => (
    <div className="grid max-w-5xl items-start gap-6 lg:grid-cols-2">
      <Card className="p-6">
        <p className="mb-4 text-meta text-subtle">Mês fechado (outubro): o aluguel no dia 1 não apaga os outros dias</p>
        <CalendarDemo daily={DIAS_OUT} upTo={31} start="2026-10-01" />
      </Card>
      <Card className="p-6">
        <p className="mb-4 text-meta text-subtle">Mês corrente: até o dia 9; o dia 4 escolhido</p>
        <CalendarDemo daily={DIAS_NOV} upTo={9} start="2026-11-01" />
      </Card>
      <Card className="p-6">
        <p className="mb-4 text-meta text-subtle">
          Mês financeiro de 27/out a 26/nov (Configurações): o dia 1 diz o mês que começa
        </p>
        <CalendarDemo daily={DIAS_OUT} upTo={31} start="2026-10-27" />
      </Card>
      <Card className="max-w-[375px] p-4">
        <p className="mb-4 text-meta text-subtle">Celular: só a cor</p>
        <CalendarDemo daily={DIAS_OUT} upTo={31} start="2026-10-01" />
      </Card>
    </div>
  ),
};
