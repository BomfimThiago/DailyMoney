import { ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { CardBillLink } from '@/components/cards/CardBills';
import { CurrencyChips } from '@/components/CurrencyChips';
import { Breakdown } from '@/components/home/Breakdown';
import { Comparison } from '@/components/home/Comparison';
import { Flow } from '@/components/home/Flow';
import { Pace } from '@/components/home/Pace';
import { type Home, NoAccounts, PendingLink, ReviewLink } from '@/components/home/shared';
import { SpendingCalendar } from '@/components/home/SpendingCalendar';
import { dash as styles } from '@/components/home/styles';
import { MonthNav } from '@/components/nav';
import { Loadable } from '@/components/states';
import {
  contentWidth as contentWidthFor,
  paceChange,
  paceDay,
  paceSentence,
  TWO_COLUMNS,
} from '@/lib/dashboard';
import { money, plain } from '@/lib/format';
import { hasNoAccounts } from '@/lib/home';
import { useDashboard } from '@/lib/queries';
import type { CurrencyDashboard, CurrencySummary, MonthSummary } from '@/lib/types';
import { colors } from '@/theme';

// Início on a computer: the old web's dashboard, in the new white style (variant B).
export function HomeDashboard({ home }: { home: Home }) {
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.column}>
        <View style={styles.head}>
          <MonthNav month={home.month} onChange={home.setMonth} />
          <CurrencyChips style={styles.chips} />
        </View>
        <Loadable
          isError={home.isError}
          loading={!home.summary}
          value={home.summary}
          empty=""
          textStyle={styles.muted}
        >
          {(summary) =>
            hasNoAccounts(summary) ? (
              <NoAccounts
                name={home.name}
                style={styles.emptyBox}
                buttonStyle={styles.emptyButton}
              />
            ) : (
              <MonthView home={home} summary={summary} />
            )
          }
        </Loadable>
      </View>
    </ScrollView>
  );
}

function MonthView({ home, summary }: { home: Home; summary: MonthSummary }) {
  const query = useDashboard(home.month, true);
  const shown = home.shown;
  if (!shown) return null;
  const dash = query.data?.currencies.find((c) => c.currency === shown.currency) ?? null;
  const start = query.data?.start ?? null;
  return (
    <>
      <Figures month={home.month} start={start} shown={shown} dash={dash} />
      <ReviewLink count={summary.to_review} />
      <PendingLink count={summary.pending_transfers} />
      <CardBillLink />
      <Loadable
        isError={query.isError}
        loading={!dash}
        value={dash}
        empty=""
        error="Não consegui carregar os gráficos. Tente de novo."
        textStyle={[styles.muted, styles.loading]}
      >
        {(d) => <Charts month={home.month} start={start ?? ''} shown={shown} dash={d} />}
      </Loadable>
    </>
  );
}

function Charts({
  month,
  start,
  shown,
  dash,
}: {
  month: string;
  start: string;
  shown: CurrencySummary;
  dash: CurrencyDashboard;
}) {
  const width = contentWidthFor(useWindowDimensions().width);
  const twoColumns = width >= TWO_COLUMNS;
  return (
    <>
      <Comparison month={month} shown={shown} dash={dash} withCurrent />
      <Pace month={month} start={start} dash={dash} width={width} />
      <View style={[styles.pair, !twoColumns && styles.stack]}>
        <Breakdown dash={dash} />
        <SpendingCalendar start={start} dash={dash} />
      </View>
      <Flow dash={dash} width={width} />
    </>
  );
}

function Figures({
  month,
  start,
  shown,
  dash,
}: {
  month: string;
  start: string | null;
  shown: CurrencySummary;
  dash: CurrencyDashboard | null;
}) {
  const sentence =
    dash && start
      ? paceSentence(
          paceChange(dash.daily, dash.previous_daily, paceDay(start, dash.daily.length)),
          month,
        )
      : null;
  return (
    <View style={styles.figures}>
      <Figure label="Entradas" value={plain(shown.income)} color={colors.positive} />
      <Figure label="Gastos" value={plain(shown.spending)} sub={sentence} divider />
      <Figure label="Sobrou no mês" value={money(shown.left, shown.currency)} divider wide />
    </View>
  );
}

function Figure({
  label,
  value,
  color,
  sub,
  divider,
  wide,
}: {
  label: string;
  value: string;
  color?: string;
  sub?: string | null;
  divider?: boolean;
  wide?: boolean;
}) {
  return (
    <View style={[styles.figure, divider && styles.divider, wide && styles.figureWide]}>
      <Text style={styles.figureLabel}>{label.toUpperCase()}</Text>
      <Text style={[styles.figureValue, color ? { color } : null]} numberOfLines={1}>
        {value}
      </Text>
      {sub ? <Text style={styles.figureSub}>{sub}</Text> : null}
    </View>
  );
}
