"use client";

import * as React from "react";
import Link from "next/link";
import { Landmark, TrendingUp } from "lucide-react";
import { useInvestments, type Currency } from "@/hooks";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { InvestmentList } from "@/components/finance/investments";
import { Allocation, MaturityLadderChart } from "@/components/finance/portfolio-charts";
import { Money } from "@/components/finance/money";
import { EmptyState, ErrorState } from "@/components/states";
import { byBank, maturing, maturityLadder, summarizePortfolio, type InvestmentClass } from "@/lib/investments/summary";
import { Decimal, formatAmount } from "@/lib/money";

const LENSES: { value: Currency; label: string }[] = [
  { value: "BRL", label: "BRL" },
  { value: "EUR", label: "EUR" },
  { value: "USD", label: "USD" },
];
// "64% em renda fixa", mas "44% em Tesouro Direto" e "em ETFs".
const KEEP_CASE: InvestmentClass[] = ["treasury", "etf"];
/** "2026-11-05T00:00:00.000Z" → "5/11" (dia do saldo, sem fuso). */
const shortDay = (iso: string) => `${Number(iso.slice(8, 10))}/${iso.slice(5, 7)}`;
const n = (c: number, one: string, many: string) => `${c} ${c === 1 ? one : many}`;

export default function InvestmentsPage() {
  const q = useInvestments();
  const [lens, setLens] = React.useState<Currency>("BRL");
  const d = q.data;
  const s = d ? summarizePortfolio(d.positions, lens) : null;
  const top = s?.classes[0];
  const banks = d ? byBank(d.positions, lens) : [];
  const soon = d ? maturing(d.positions, lens, new Date(), 12) : null;

  const ladder = d ? maturityLadder(d.positions, lens, new Date()) : null;
  const cls = (c: { key: InvestmentClass; label: string }) =>
    KEEP_CASE.includes(c.key) ? c.label : c.label.toLowerCase();

  // Alocação: as duas maiores classes e quanto somam (pelas frações, sem somar arredondados).
  const second = s?.classes[1];
  const allocationFinding =
    s && top
      ? second
        ? `${top.label} e ${cls(second)} somam ${new Decimal(top.fraction).plus(second.fraction).times(100).toFixed(0)}% da carteira.`
        : `Tudo em ${cls(top)}.`
      : null;
  // Vencimentos: o ano em que mais dinheiro volta.
  const peak = ladder?.steps.reduce((a, b) => (new Decimal(b.total).gt(a.total) ? b : a));
  const ladderFinding = peak
    ? `O maior volume volta ${peak.label.endsWith("+") ? `de ${peak.year} em diante` : `em ${peak.label}`}: ${formatAmount(peak.total, lens)} em ${n(peak.count, "título", "títulos")}.`
    : null;

  const finding =
    s && top
      ? `${formatAmount(s.total, lens)} em ${n(s.count, "investimento", "investimentos")}; ${top.share}% em ${
          KEEP_CASE.includes(top.key) ? top.label : top.label.toLowerCase()
        }.`
      : "O saldo dos investimentos dos bancos conectados.";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Investimentos"
        description={finding}
        actions={
          <>
            <Segmented aria-label="Moeda de exibição" value={lens} onValueChange={setLens} options={LENSES} />
            <Button variant="secondary" asChild>
              <Link href="/upload">
                <Landmark />
                Bancos conectados
              </Link>
            </Button>
          </>
        }
      />

      {q.isPending ? (
        <div className="grid gap-4 md:grid-cols-3" aria-busy>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32 rounded-card" />
          ))}
          <Skeleton className="h-72 rounded-card md:col-span-3" />
        </div>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} title="Não deu para carregar os investimentos" />
      ) : !s || !s.count ? (
        <EmptyState
          icon={<TrendingUp />}
          title="Nenhum investimento ainda"
          hint="Os investimentos aparecem aqui quando um banco conectado pela Pluggy (Inter, Nubank…) informa as posições. Sincronize o banco para trazê-los."
          action={
            <Button asChild>
              <Link href="/upload">Ir para bancos conectados</Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <StatCard
              label="Total hoje"
              value={<Money value={s.total} currency={lens} size="display" align="left" />}
              footnote={banks.map((b) => `${b.bank} ${formatAmount(b.total, lens)}`).join(" · ")}
            />
            {s.tracked ? (
              <StatCard
                label="Rendeu"
                value={
                  <Money
                    value={s.tracked.gain}
                    currency={lens}
                    size="display"
                    align="left"
                    change={s.tracked.gain.startsWith("-") ? "bad" : "good"}
                  />
                }
                delta={
                  s.tracked.gainPct
                    ? {
                        label: `${s.tracked.gainPct.startsWith("-") ? "" : "+"}${s.tracked.gainPct.replace(".", ",")}%`,
                        tone: s.tracked.gainPct.startsWith("-") ? "danger" : "success",
                      }
                    : undefined
                }
                footnote={`Sobre ${formatAmount(s.tracked.invested, lens)} aplicados em renda fixa e Tesouro. Ações e FIIs não informam o aplicado.`}
              />
            ) : null}
            {soon ? (
              <StatCard
                label="Vence em 12 meses"
                value={<Money value={soon.total} currency={lens} size="display" align="left" />}
                footnote={
                  soon.count
                    ? `${n(soon.count, "título vence", "títulos vencem")} no próximo ano: o dinheiro volta para a conta.`
                    : "Nenhum título vence no próximo ano."
                }
              />
            ) : null}
          </div>

          {/* Alocação ao lado da escada de vencimentos (a mesma altura: a linha estica os dois). */}
          <div className={ladder ? "grid gap-6 lg:grid-cols-2" : "grid gap-6"}>
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle>Alocação</CardTitle>
                <CardDescription>{allocationFinding}</CardDescription>
              </CardHeader>
              <CardContent>
                <Allocation
                  currency={lens}
                  items={s.classes.map((c) => ({
                    key: c.key,
                    label: c.label,
                    color: c.color,
                    total: c.total,
                    share: c.share,
                    fraction: c.fraction,
                    count: c.positions.length,
                  }))}
                />
              </CardContent>
            </Card>
            {ladder ? (
              <Card className="flex min-w-0 flex-col">
                <CardHeader>
                  <CardTitle>Quando o dinheiro volta</CardTitle>
                  <CardDescription>{ladderFinding}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-4">
                  <MaturityLadderChart steps={ladder.steps} currency={lens} className="flex-1" />
                  <p className="text-meta text-subtle">
                    Pelo valor de hoje, no ano do vencimento de cada título.
                    {ladder.undated.count
                      ? ` ${formatAmount(ladder.undated.total, lens)} em ${n(ladder.undated.count, "investimento", "investimentos")} sem data de vencimento (ações, fundos, liquidez diária) ficam fora.`
                      : ""}
                  </p>
                </CardContent>
              </Card>
            ) : null}
          </div>

          {/* Duas colunas que se equilibram (cada cartão segue o de cima), não linhas: as classes têm
              números bem diferentes de investimentos, e cartões lado a lado terminariam desalinhados. */}
          <div className="gap-6 lg:columns-2 [&>*]:mb-6 [&>*]:break-inside-avoid">
            {s.classes.map((c) => (
              // min-w-0: um nome longo encurta com "…" em vez de alargar a tela no celular
              <Card key={c.key} className="min-w-0">
                <CardHeader action={<Money value={c.total} currency={lens} size="lg" />}>
                  <CardTitle>{c.label}</CardTitle>
                  <CardDescription>
                    {c.share}% da carteira · {n(c.positions.length, "investimento", "investimentos")}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <InvestmentList items={c.positions} lens={lens} />
                </CardContent>
              </Card>
            ))}
          </div>

          <p className="text-meta text-subtle">
            Saldo líquido (já sem IR e taxas) informado pelos bancos
            {d?.valueDate ? ` em ${shortDay(d.valueDate)}` : ""}, atualizado a cada sincronização.
            {d && d.closed
              ? ` ${n(d.closed, "investimento resgatado fica", "investimentos resgatados ficam")} de fora.`
              : ""}
          </p>
        </>
      )}
    </div>
  );
}
