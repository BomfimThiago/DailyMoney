"use client";

import * as React from "react";
import Link from "next/link";
import { addMonths, format, parse, startOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronRight, FileUp, Upload } from "lucide-react";
import {
  useCardBills,
  useCurrentMonth,
  useLatestDataMonth,
  useMonthOverview,
  useMonthPace,
  useMonthStartDay,
  useMovements,
  useUploads,
  type Currency,
} from "@/hooks";
import { Alert } from "@/components/ui/alert";
import { StackedBar } from "@/components/ui/bar-chart";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KeyValues } from "@/components/ui/key-values";
import { KpiTabs } from "@/components/ui/kpi-tabs";
import { LineChart } from "@/components/ui/line-chart";
import { MonthSwitcher } from "@/components/ui/month-switcher";
import { PageHeader } from "@/components/ui/page-header";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { BreakdownList } from "@/components/finance/breakdown-list";
import { CardBills } from "@/components/finance/card-bills";
import { CategoryTag } from "@/components/finance/category";
import { CurrencyTag } from "@/components/finance/currency-tag";
import { FlowChart } from "@/components/finance/flow-chart";
import { MemberAvatar } from "@/components/finance/member";
import { Money } from "@/components/finance/money";
import { MonthComparison } from "@/components/finance/month-comparison";
import { Movements } from "@/components/finance/movements";
import { PaceChart } from "@/components/finance/pace-chart";
import { SpendingCalendar } from "@/components/finance/spending-calendar";
import { TransactionListItem } from "@/components/finance/transaction-list-item";
import { EmptyState, ErrorState } from "@/components/states";
import { Decimal, formatAmount } from "@/lib/money";
import { dayOfMonth, periodCaption, shortDate } from "@/lib/period";

const LENSES: { value: Currency; label: string }[] = [
  { value: "EUR", label: "EUR" },
  { value: "USD", label: "USD" },
  { value: "BRL", label: "BRL" },
];
const OTHER: Record<Currency, Currency[]> = { EUR: ["BRL", "USD"], USD: ["BRL", "EUR"], BRL: ["EUR", "USD"] };

type Series = "net" | "income" | "expense";
type Breakdown = "category" | "member" | "bank";
const SYMBOL: Record<Currency, string> = { EUR: "€", USD: "US$", BRL: "R$" };

const monthLabel = (ym: string, pattern = "MMM") =>
  format(parse(ym, "yyyy-MM", new Date()), pattern, { locale: ptBR }).replace(".", "");

/** "-45.2" → "45,2" (módulo, vírgula decimal). */
const abs = (v: string) => (v.startsWith("-") ? v.slice(1) : v).replace(".", ",");
const isZero = (v: string | null) => v !== null && /^-?0(\.0+)?$/.test(v);

export default function DashboardPage() {
  const latest = useLatestDataMonth();
  const current = useCurrentMonth();
  const startDay = useMonthStartDay();
  const [picked, setPicked] = React.useState<Date | null>(null);
  const [lens, setLens] = React.useState<Currency>("EUR");
  const [series, setSeries] = React.useState<Series>("net");
  const [breakdown, setBreakdown] = React.useState<Breakdown>("category");
  const month = picked ?? latest ?? current;
  // Dia escolhido no calendário, preso ao mês: trocar de mês solta a escolha.
  const [chosen, setChosen] = React.useState<{ month: string; day: number } | null>(null);
  const monthKey = format(month, "yyyy-MM");
  const chosenDay = chosen?.month === monthKey ? chosen.day : null;
  const overview = useMonthOverview(month, lens);
  const bills = useCardBills(month);
  const movements = useMovements(month);
  const pace = useMonthPace(month, lens);
  const uploads = useUploads();
  const showBills = bills.isError || bills.isLoading || (bills.data?.cards.length ?? 0) > 0;
  const showMovements = movements.isError || movements.isLoading || (movements.data?.groups.length ?? 0) > 0;
  const pending = uploads.data?.filter((u) => u.status === "STAGED") ?? [];
  const d = overview.data;
  const monthName = format(month, "MMMM 'de' yyyy", { locale: ptBR });
  const prevName = format(subMonths(month, 1), "MMMM", { locale: ptBR });
  const title = monthName.charAt(0).toUpperCase() + monthName.slice(1);

  // Mesmo número nas outras duas moedas; o sinal vem do valor (ex.: saldo negativo).
  const otherLine = (pick: (t: NonNullable<typeof d>["current"]) => string) =>
    d
      ? OTHER[lens]
          .map((c) => {
            const t = d.byLens[c];
            if (!t) return null;
            const v = pick(t);
            return formatAmount(v, c, v.startsWith("-") ? "-" : "none");
          })
          .filter(Boolean)
          .join(" · ")
      : null;

  // O achado do mês, na linha sob o título: como os gastos se moveram e quanto sobrou.
  const finding = d
    ? [
        d.expenseChange === null
          ? null
          : isZero(d.expenseChange)
            ? `Gastos iguais a ${prevName}`
            : `Gastos ${abs(d.expenseChange)}% ${d.expenseChange.startsWith("-") ? "abaixo" : "acima"} de ${prevName}`,
        d.savingsRate === null ? "sem entradas no mês" : `sobrou ${abs(d.savingsRate)}% do que entrou`,
      ]
        .filter(Boolean)
        .map((t, i) => (i === 0 ? t!.charAt(0).toUpperCase() + t!.slice(1) : t))
        .join("; ")
    : null;

  const change = (v: string | null, better: "up" | "down") =>
    v === null ? (
      <span>— sem {prevName} para comparar</span>
    ) : (
      <span>
        <span
          className={
            isZero(v)
              ? "text-subtle"
              : v.startsWith("-") === (better === "down")
                ? "font-medium text-success"
                : "font-medium text-destructive"
          }
        >
          {v.startsWith("-") ? "−" : isZero(v) ? "" : "+"}
          {abs(v)}%
        </span>{" "}
        vs {prevName}
      </span>
    );

  const SERIES_NAME: Record<Series, string> = { net: "Sobra", income: "Entradas", expense: "Gastos" };

  // Eixo y dos gráficos: "R$ 2,5 mil".
  const tick = (v: number) => {
    const n = Math.abs(v);
    const s = n >= 1000 ? `${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : String(n);
    return v === 0 ? "0" : `${v < 0 ? "−" : ""}${SYMBOL[lens]} ${s}`;
  };

  // Ritmo: até hoje contra o mesmo dia do mês passado; num mês fechado, quando saiu a metade.
  const p = pace.data;
  // Um dia do mês pela posição: "o dia 12", ou "3 nov" quando o mês financeiro atravessa dois meses.
  const crosses = p ? p.dates[0].slice(0, 7) !== p.dates[p.dates.length - 1].slice(0, 7) : false;
  const dayRef = (pos: number) =>
    !p ? "" : crosses ? shortDate(p.dates[pos - 1]) : `o dia ${dayOfMonth(p.dates[pos - 1])}`;
  const paceFinding = !p
    ? null
    : p.isCurrentMonth
      ? `Até ${dayRef(p.pace.day)}: ${formatAmount(p.pace.spent, lens)} em gastos${
          p.pace.pct === null
            ? `; ${prevName} não tinha gastos até esse dia.`
            : isZero(p.pace.pct)
              ? `, o mesmo que em ${prevName} no mesmo dia.`
              : `, ${abs(p.pace.pct)}% ${p.pace.pct.startsWith("-") ? "a menos" : "a mais"} que em ${prevName} no mesmo dia.`
        }`
      : p.halfway
        ? `Metade dos gastos de ${monthName.split(" ")[0]} saiu até ${dayRef(p.halfway)}.`
        : `Sem gastos em ${monthName.split(" ")[0]}.`;

  // Calendário: dias sem gasto e o dia mais caro (até hoje, no mês corrente).
  const cal = p?.calendar;
  const calendarFinding = !cal
    ? null
    : !cal.peak
      ? `Nenhum gasto em ${monthName.split(" ")[0]}.`
      : `${cal.zeroDays === 1 ? "1 dia" : `${cal.zeroDays} dias`} sem gastos${
          p.isCurrentMonth ? ` até ${dayRef(cal.upTo)}` : ""
        }; o mais caro foi ${dayRef(cal.peak.day)} (${formatAmount(cal.peak.total, lens)}).`;
  const dayTxs =
    p && chosenDay !== null
      ? p.transactions.filter(
          (t) =>
            !t.isInternalTransfer &&
            t.type === "EXPENSE" &&
            t.date.slice(0, 10) === p.calendar.days[chosenDay - 1]?.date,
        )
      : [];

  // Fluxo: quanto do que entrou virou gasto, a maior fatia e o que sobrou (ou veio das reservas).
  const f = d?.flow;
  const pctOf = (share: string) => new Decimal(share).times(100).toFixed(0);
  const biggest = f?.targets.find((t) => t.kind === "expense");
  const savedNode = f?.targets.find((t) => t.kind === "saved");
  const deficitNode = f?.sources.find((s) => s.kind === "deficit");
  const flowFinding = !f
    ? null
    : deficitNode
      ? new Decimal(f.income).isZero()
        ? `Sem entradas em ${monthName.split(" ")[0]}: os ${formatAmount(f.expense, lens)} de gastos saíram das reservas.`
        : `Os gastos passaram as entradas em ${formatAmount(deficitNode.value, lens)}: essa diferença saiu das reservas.`
      : `Dos ${formatAmount(f.income, lens)} que entraram, ${pctOf(new Decimal(1).minus(savedNode?.share ?? "0").toString())}% viraram gastos${
          biggest ? ` (${pctOf(biggest.share)}% em ${biggest.label})` : ""
        } e sobraram ${pctOf(savedNode?.share ?? "0")}%.`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        className="lg:px-6"
        title="Resumo"
        description={finding ? `${finding}.` : title}
        actions={
          <>
            <MonthSwitcher
              value={month}
              onChange={setPicked}
              max={current}
              caption={periodCaption(monthKey, startDay)}
            />
            <Segmented aria-label="Moeda de exibição" value={lens} onValueChange={setLens} options={LENSES} />
            <Button asChild>
              <Link href="/upload">
                <Upload />
                Importar extrato
              </Link>
            </Button>
          </>
        }
      />

      {pending.length > 0 ? (
        <Alert
          tone="warning"
          title={
            pending.length === 1
              ? "1 importação aguardando revisão."
              : `${pending.length} importações aguardando revisão.`
          }
          action={
            <Button variant="secondary" size="sm" asChild>
              <Link href={pending.length === 1 ? `/review/${pending[0].id}` : "/upload"}>Revisar agora</Link>
            </Button>
          }
        >
          Essas transações ainda não entram nos números abaixo.
        </Alert>
      ) : null}

      {overview.isError ? (
        <ErrorState error={overview.error} onRetry={overview.refetch} />
      ) : overview.isLoading || !d ? (
        <DashboardSkeleton />
      ) : d.series.every((m) => m.income === "0.00" && m.expense === "0.00") ? (
        <EmptyState
          icon={<FileUp />}
          title="Sem dados ainda"
          hint="Importe um extrato para ver o resumo do mês."
          action={
            <Button size="sm" asChild>
              <Link href="/upload">Importar extrato</Link>
            </Button>
          }
        />
      ) : (
        <>
          {d.truncated ? (
            <Alert tone="warning" title="Este mês tem transações demais para o Resumo detalhar.">
              Os totais e o gráfico estão completos, mas as divisões por categoria, pessoa e conta usam só as 1000 mais
              recentes. A lista completa está em Transações.
            </Alert>
          ) : null}
          {/* O mês: quanto sobrou (a resposta), entradas e gastos como abas do gráfico de 12 meses. */}
          <Card>
            <CardContent className="flex flex-col gap-6 pt-6">
              <KpiTabs
                aria-label="Série do gráfico"
                value={series}
                onValueChange={setSeries}
                tabs={[
                  {
                    value: "net",
                    label: "Sobrou no mês",
                    lead: true,
                    figure: <Money value={d.current.net} currency={lens} kind="INCOME" size="display" align="left" />,
                    note: (
                      <>
                        {d.savingsRate ? `${abs(d.savingsRate)}% do que entrou` : "sem entradas no mês"}
                        <span className="block">{otherLine((t) => t.net)}</span>
                      </>
                    ),
                  },
                  {
                    value: "income",
                    label: "Entradas",
                    figure: <Money value={d.current.income} currency={lens} kind="INCOME" size="figure" align="left" />,
                    note: (
                      <>
                        {change(d.incomeChange, "up")}
                        <span className="block">{otherLine((t) => t.income)}</span>
                      </>
                    ),
                  },
                  {
                    value: "expense",
                    label: "Gastos",
                    figure: <Money value={d.current.expense} currency={lens} size="figure" align="left" />,
                    note: (
                      <>
                        {change(d.expenseChange, "down")}
                        <span className="block">{otherLine((t) => t.expense)}</span>
                      </>
                    ),
                  },
                ]}
              />

              <LineChart
                aria-label={`${SERIES_NAME[series]} por mês nos últimos ${d.chartSeries.length} meses, até ${monthName}`}
                height={180}
                data={d.chartSeries.map((m) => ({
                  label: monthLabel(m.month),
                  value: m[series],
                  hint: (
                    <span className="tabular-nums">
                      <span className="capitalize">{monthLabel(m.month, "MMMM yyyy")}</span>:{" "}
                      {SERIES_NAME[series].toLowerCase()}{" "}
                      {formatAmount(m[series], lens, m[series].startsWith("-") ? "-" : "none")}
                    </span>
                  ),
                }))}
                formatTick={tick}
              />

              <div className="grid grid-cols-1 items-start gap-x-12 gap-y-6 lg:grid-cols-2">
                <MonthComparison
                  currency={lens}
                  previousLabel={prevName}
                  rows={[
                    { key: "net", label: "Sobrou", current: d.current.net, previous: d.prev?.net, better: "up" },
                    {
                      key: "income",
                      label: "Entradas",
                      current: d.current.income,
                      previous: d.prev?.income,
                      better: "up",
                    },
                    {
                      key: "expense",
                      label: "Gastos",
                      current: d.current.expense,
                      previous: d.prev?.expense,
                      better: "down",
                    },
                  ]}
                />
                {d.stats ? (
                  <KeyValues
                    title="Nos últimos 12 meses"
                    items={[
                      {
                        key: "avg",
                        label: "Gasto médio por mês",
                        value: <Money value={d.stats.avgExpense} currency={lens} />,
                      },
                      {
                        key: "priciest",
                        label: "Mês mais caro",
                        value: <span className="capitalize">{monthLabel(d.stats.priciest.month, "MMMM yyyy")}</span>,
                      },
                      {
                        key: "months",
                        label: "Meses com sobra",
                        value: `${d.stats.positiveMonths} de ${d.stats.months}`,
                      },
                      {
                        key: "positive",
                        label: "Sobra no período",
                        value: <Money value={d.stats.totalNet} currency={lens} kind="INCOME" />,
                      },
                    ]}
                  />
                ) : null}
              </div>
              <p className="-mt-2 text-[13px] text-subtle">
                Valores em {lens} pela taxa do dia de cada compra · transferências internas ficam fora das contas
              </p>
            </CardContent>
          </Card>

          {/* Ritmo do mês: o gasto acumulado dia a dia, por cima do mês anterior. */}
          <Card>
            <CardHeader>
              <CardTitle>Ritmo do mês</CardTitle>
              <CardDescription>
                {paceFinding ?? "Gasto acumulado dia a dia, comparado com o mês anterior."}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              {pace.isError ? (
                <ErrorState error={pace.error} onRetry={pace.refetch} />
              ) : !p ? (
                <Skeleton className="h-[230px] rounded-lg" />
              ) : p.truncated ? (
                <p className="text-[14px] text-muted-foreground">
                  Este mês tem transações demais para somar dia a dia aqui. O total está nos números acima.
                </p>
              ) : (
                <PaceChart
                  current={p.current}
                  upTo={p.pace.day}
                  previous={p.previous}
                  days={p.days}
                  currency={lens}
                  monthShort={format(month, "MMM", { locale: ptBR }).replace(".", "")}
                  dates={p.dates}
                  currentName={format(month, "MMMM", { locale: ptBR })}
                  previousName={prevName}
                  formatTick={tick}
                />
              )}
            </CardContent>
          </Card>

          {/* Fluxo do mês: de onde veio o dinheiro e para onde foi. */}
          <Card>
            <CardHeader>
              <CardTitle>Fluxo do mês</CardTitle>
              <CardDescription>{flowFinding ?? "De onde veio o dinheiro do mês e para onde foi."}</CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              {d.truncated ? (
                <p className="text-[14px] text-muted-foreground">
                  Este mês tem transações demais para desenhar o fluxo. O total está nos números acima.
                </p>
              ) : !f ? (
                <p className="py-4 text-[15px] text-subtle">Nenhuma entrada nem gasto em {monthName}.</p>
              ) : (
                <>
                  <FlowChart flow={f} currency={lens} />
                  <p className="mt-3 text-[13px] text-subtle">
                    Porcentagens sobre {deficitNode ? "os gastos" : "as entradas"} do mês · movimentações entre suas
                    contas ficam de fora
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          {/* Os gastos do mês divididos por categoria, responsável ou conta: um cartão, três abas. */}
          <Card>
            <Tabs value={breakdown} onValueChange={(v) => setBreakdown(v as Breakdown)}>
              <CardHeader
                action={
                  <Button variant="link" size="sm" asChild>
                    <Link href="/transactions">
                      Ver transações <ChevronRight />
                    </Link>
                  </Button>
                }
              >
                <CardTitle>Divisão dos gastos</CardTitle>
                <CardDescription>
                  {breakdown === "category"
                    ? `${d.byCategory.length === 1 ? "1 categoria" : `${d.byCategory.length} categorias`} em ${monthName}`
                    : breakdown === "member"
                      ? `Quem gastou o quê em ${monthName}`
                      : `Quanto saiu de cada conta em ${monthName}`}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 pt-3">
                <TabsList aria-label="Dividir os gastos por">
                  <TabsTrigger value="category" count={d.byCategory.length}>
                    Categoria
                  </TabsTrigger>
                  <TabsTrigger value="member" count={d.byMember.length}>
                    Responsável
                  </TabsTrigger>
                  <TabsTrigger value="bank" count={d.byBank.length}>
                    Conta
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="category">
                  {d.byCategory.length === 0 ? (
                    <p className="py-6 text-[15px] text-subtle">Nenhum gasto em {monthName}.</p>
                  ) : (
                    <BreakdownList
                      currency={lens}
                      limit={6}
                      items={d.byCategory.map((g) => ({
                        ...g,
                        labelNode: <CategoryTag category={{ name: g.label, color: g.color!, icon: g.icon }} />,
                      }))}
                      renderDetail={(item) => (
                        <div className="-mx-6 divide-y rounded-lg bg-muted">
                          {d.transactions
                            .filter(
                              (t) =>
                                !t.isInternalTransfer && t.type === "EXPENSE" && (t.categoryId ?? "none") === item.key,
                            )
                            .slice(0, 6)
                            .map((t) => (
                              <TransactionListItem key={t.id} tx={t} lens={lens} className="min-h-0 py-2" />
                            ))}
                          {item.count > 6 ? (
                            <Link
                              href="/transactions"
                              className="block px-6 py-2 text-[14px] font-medium text-foreground hover:underline"
                            >
                              + {item.count - 6} transações
                            </Link>
                          ) : null}
                        </div>
                      )}
                    />
                  )}
                </TabsContent>
                <TabsContent value="member" className="flex flex-col gap-4">
                  {d.byMember.length === 0 ? (
                    <p className="text-[15px] text-subtle">Nenhum gasto no mês.</p>
                  ) : (
                    <>
                      <StackedBar
                        items={d.byMember.map((m) => ({
                          key: m.key,
                          share: m.share,
                          color: m.color,
                          label: m.label,
                        }))}
                      />
                      <BreakdownList
                        currency={lens}
                        showBars={false}
                        items={d.byMember.map((m) => ({
                          ...m,
                          leading: <MemberAvatar member={{ name: m.label, color: m.color! }} size="sm" />,
                        }))}
                      />
                    </>
                  )}
                </TabsContent>
                <TabsContent value="bank">
                  {d.byBank.length === 0 ? (
                    <p className="text-[15px] text-subtle">Nenhum gasto no mês.</p>
                  ) : (
                    <BreakdownList
                      currency={lens}
                      items={d.byBank.map((b) => ({
                        ...b,
                        suffix: <CurrencyTag currency={b.key.split("|")[1] as Currency} />,
                        leading: undefined,
                      }))}
                    />
                  )}
                </TabsContent>
              </CardContent>
            </Tabs>
          </Card>

          {/* Calendário: quanto saiu em cada dia; escolher um dia abre as compras dele. */}
          <Card>
            <CardHeader>
              <CardTitle>Calendário de gastos</CardTitle>
              <CardDescription>{calendarFinding ?? "Quanto saiu em cada dia do mês."}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 pt-4">
              {pace.isError ? (
                <ErrorState error={pace.error} onRetry={pace.refetch} />
              ) : !p ? (
                <Skeleton className="h-[300px] rounded-lg" />
              ) : p.truncated ? (
                <p className="text-[14px] text-muted-foreground">
                  Este mês tem transações demais para somar dia a dia aqui. O total está nos números acima.
                </p>
              ) : (
                <>
                  <SpendingCalendar
                    days={p.calendar.days}
                    today={p.isCurrentMonth ? p.calendar.upTo : undefined}
                    currency={lens}
                    selected={chosenDay}
                    onSelect={(day) => setChosen(day === null ? null : { month: monthKey, day })}
                  />
                  {chosenDay !== null ? (
                    <div className="-mx-6 border-t">
                      <p className="flex justify-between px-6 pb-1 pt-3 text-[14px] font-medium">
                        <span>
                          {shortDate(p.calendar.days[chosenDay - 1].date)} ·{" "}
                          {dayTxs.length === 1 ? "1 gasto" : `${dayTxs.length} gastos`}
                        </span>
                        <Money value={p.calendar.days[chosenDay - 1].total} currency={lens} />
                      </p>
                      {dayTxs.length === 0 ? (
                        <p className="px-6 py-3 text-[14px] text-subtle">Nenhum gasto neste dia.</p>
                      ) : (
                        <div className="divide-y">
                          {dayTxs.map((t) => (
                            <TransactionListItem key={t.id} tx={t} lens={lens} className="min-h-0 py-2" />
                          ))}
                        </div>
                      )}
                    </div>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>

          {/* O lado "caixa" do cartão e o que só mudou de lugar, lado a lado (os dois são opcionais). */}
          <div className={showBills && showMovements ? "grid items-start gap-6 lg:grid-cols-2" : "grid gap-6"}>
            {/* O lado "caixa" do cartão: a fatura que sai da conta neste mês e a próxima. */}
            {showBills ? (
              <Card>
                <CardHeader>
                  <CardTitle>Cartão de crédito</CardTitle>
                  <CardDescription>
                    As compras contam no mês em que foram feitas; aqui, o que sai da conta para pagar a fatura.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {bills.isLoading ? (
                    <div className="space-y-3" aria-busy aria-label="Carregando faturas">
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                  ) : bills.isError ? (
                    <ErrorState
                      error={bills.error}
                      title="Não deu para carregar as faturas"
                      onRetry={() => bills.refetch()}
                    />
                  ) : (
                    <CardBills
                      cards={bills.data!.cards}
                      lens={lens}
                      monthName={format(month, "MMMM", { locale: ptBR })}
                      nextName={format(addMonths(month, 1), "MMMM", { locale: ptBR })}
                      // A fatura de um mês fecha no começo dele: só a de um mês futuro ainda recebe compras.
                      nextIsOpen={addMonths(startOfMonth(month), 1) > startOfMonth(new Date())}
                      isCurrentMonth={startOfMonth(month).getTime() === startOfMonth(new Date()).getTime()}
                      billsKnown={bills.data!.billsKnown}
                    />
                  )}
                </CardContent>
              </Card>
            ) : null}
            {/* O que só mudou de lugar (fora dos totais) e quanto disso foi para fora das contas conectadas. */}
            {showMovements ? (
              <Card>
                <CardHeader>
                  <CardTitle>Movimentações</CardTitle>
                  <CardDescription>
                    Dinheiro que só mudou de lugar em {monthName}: não entra nos gastos nem nas entradas.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {movements.isLoading ? (
                    <div className="space-y-3" aria-busy aria-label="Carregando movimentações">
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                  ) : movements.isError ? (
                    <ErrorState
                      error={movements.error}
                      title="Não deu para carregar as movimentações"
                      onRetry={() => movements.refetch()}
                    />
                  ) : (
                    <Movements groups={movements.data!.groups} lens={lens} />
                  )}
                </CardContent>
              </Card>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

/** Esqueleto no formato final: rótulos à vista, valores como barras do tamanho real. */
function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy>
      <Card className="flex flex-col gap-6 p-6">
        <Skeleton className="h-7 w-48" />
        <div className="grid grid-cols-2 gap-4 lg:flex lg:gap-12">
          <Skeleton className="col-span-2 h-14 w-56" />
          <Skeleton className="h-14 w-40" />
          <Skeleton className="h-14 w-40" />
        </div>
        <Skeleton className="h-[210px] w-full" />
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-4 p-6">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-7 w-full" />
          ))}
        </Card>
        <Card className="space-y-4 p-6">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </Card>
      </div>
    </div>
  );
}
