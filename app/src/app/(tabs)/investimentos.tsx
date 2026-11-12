import { useState } from 'react';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';

import {
  Bars,
  Figure,
  Movements,
  Products,
  ReadFromStatements,
  Stat,
} from '@/components/investments/parts';
import { CurrencyChips } from '@/components/CurrencyChips';
import { styles, wide } from '@/components/investments/styles';
import { MonthNav, Segment } from '@/components/nav';
import { Loadable, SignedIn } from '@/components/states';
import { SectionTitle } from '@/components/ui';
import { contentWidth, TWO_COLUMNS, WIDE_MIN } from '@/lib/dashboard';
import { currentMonth, money, monthLabel, shortMonth } from '@/lib/format';
import { type InvestmentView, investmentView, monthMoves, monthTotals } from '@/lib/investments';
import { useInvestments } from '@/lib/queries';
import type { Currency, InvestmentOverview } from '@/lib/types';

type Tab = 'produtos' | 'movimentos';

const EMPTY = 'Nenhuma aplicação ou resgate nos extratos enviados até agora.';

// Investimentos, variant A (by product) with variant B's movements as a second view. On a
// computer both views sit side by side, under the month's figures.
export default function InvestmentsScreen() {
  return (
    <SignedIn>
      <Investments />
    </SignedIn>
  );
}

function Investments() {
  const { width } = useWindowDimensions();
  const [month, setMonth] = useState(currentMonth);
  const [currency, setCurrency] = useState<Currency | null>(null);
  const query = useInvestments(month, true);
  const view = query.data ? investmentView(query.data, currency) : null;
  const page = {
    month,
    setMonth,
    view,
    totals: query.data?.totals ?? [],
    setCurrency,
    load: { isError: query.isError, loading: !query.data, value: view, empty: EMPTY },
  };
  return width >= WIDE_MIN ? (
    <WideInvestments {...page} twoColumns={contentWidth(width) >= TWO_COLUMNS} />
  ) : (
    <PhoneInvestments {...page} />
  );
}

type PageProps = {
  month: string;
  setMonth: (m: string) => void;
  view: InvestmentView | null;
  totals: InvestmentOverview['totals'];
  setCurrency: (c: Currency) => void;
  load: { isError: boolean; loading: boolean; value: InvestmentView | null; empty: string };
};

function WideInvestments({
  month,
  setMonth,
  view,
  totals,
  setCurrency,
  load,
  twoColumns,
}: PageProps & { twoColumns: boolean }) {
  return (
    <ScrollView style={styles.page} contentContainerStyle={wide.content}>
      <View style={wide.column}>
        <View style={wide.head}>
          <Text style={wide.title}>Investimentos</Text>
          <View style={wide.headRight}>
            {view ? (
              <CurrencyChips
                currencies={totals}
                current={view.currency}
                onChange={setCurrency}
                style={wide.chips}
              />
            ) : null}
            <MonthNav month={month} onChange={setMonth} compact />
          </View>
        </View>
        <Loadable {...load}>
          {(v) => <WideBody v={v} month={month} twoColumns={twoColumns} />}
        </Loadable>
      </View>
    </ScrollView>
  );
}

function WideBody({
  v,
  month,
  twoColumns,
}: {
  v: InvestmentView;
  month: string;
  twoColumns: boolean;
}) {
  return (
    <>
      <WideFigures v={v} month={month} />
      <View style={[wide.pair, !twoColumns && wide.stack]}>
        <View style={[wide.card, twoColumns && wide.half]}>
          <Text style={wide.cardTitle}>SEUS PRODUTOS</Text>
          <Products products={v.products} />
          <ReadFromStatements />
        </View>

        <View style={[wide.card, twoColumns && wide.half]}>
          <Text style={wide.cardTitle}>INVESTIDO POR MÊS</Text>
          <Bars history={v.history} month={month} />
          <Text style={[wide.cardTitle, wide.cardTitleGap]}>{monthLabel(month).toUpperCase()}</Text>
          <Movements movements={v.movements} />
        </View>
      </View>
    </>
  );
}

function WideFigures({ v, month }: { v: InvestmentView; month: string }) {
  const short = shortMonth(month).toUpperCase();
  const m = monthTotals(v);
  return (
    <View style={wide.figures}>
      <Figure
        label="APLICADO NO TOTAL"
        value={money(v.total.net, v.currency)}
        sub="desde o primeiro extrato"
        first
      />
      <Figure label={`APLICADO EM ${short}`} value={money(m.put_in, v.currency)} />
      <Figure label={`RESGATADO EM ${short}`} value={money(m.taken_out, v.currency)} />
      <Figure
        label={`INVESTIDO EM ${short}`}
        value={money(m.net, v.currency)}
        sub="aplicado menos resgatado"
        tone
      />
    </View>
  );
}

function PhoneInvestments({ month, setMonth, totals, setCurrency, load }: PageProps) {
  const [tab, setTab] = useState<Tab>('produtos');
  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.column}>
          <View style={styles.head}>
            <Text style={styles.title}>Investimentos</Text>
            <MonthNav month={month} onChange={setMonth} compact />
          </View>
          <Loadable {...load}>
            {(v) => (
              <>
                <CurrencyChips
                  currencies={totals}
                  current={v.currency}
                  onChange={setCurrency}
                  style={styles.chips}
                />
                <Segment
                  options={[
                    { value: 'produtos', label: 'Produtos' },
                    { value: 'movimentos', label: 'Movimentos' },
                  ]}
                  value={tab}
                  onChange={setTab}
                />
                {tab === 'produtos' ? (
                  <ProductsTab v={v} month={month} />
                ) : (
                  <MovementsTab v={v} month={month} />
                )}
              </>
            )}
          </Loadable>
        </View>
      </ScrollView>
    </View>
  );
}

function ProductsTab({ v, month }: { v: InvestmentView; month: string }) {
  const monthName = monthLabel(month).split(' ')[0].toLowerCase();
  const moves = monthMoves(v);
  return (
    <>
      <View style={styles.hero}>
        <Text style={styles.heroLabel}>Aplicado no total, desde o primeiro extrato</Text>
        <Text style={styles.heroValue}>{money(v.total.net, v.currency)}</Text>
        {moves ? (
          <Text style={styles.heroSub}>
            Em {monthName}: <Text style={styles.invest}>{moves.net}</Text> {moves.detail}
          </Text>
        ) : (
          <Text style={styles.heroSub}>Nenhum movimento em {monthName}.</Text>
        )}
      </View>
      <SectionTitle>Seus produtos</SectionTitle>
      <Products products={v.products} />
      <ReadFromStatements />
    </>
  );
}

function MovementsTab({ v, month }: { v: InvestmentView; month: string }) {
  const m = v.thisMonth;
  return (
    <>
      <Text style={styles.chartLabel}>Investido por mês (aplicado menos resgatado)</Text>
      <Bars history={v.history} month={month} />
      {m ? (
        <View style={styles.trio}>
          <Stat label="Aplicado" value={money(m.put_in, v.currency)} />
          <Stat label="Resgatado" value={money(m.taken_out, v.currency)} />
          <Stat label="Investido" value={money(m.net, v.currency)} tone />
        </View>
      ) : null}
      <SectionTitle>{monthLabel(month)}</SectionTitle>
      <Movements movements={v.movements} />
    </>
  );
}
