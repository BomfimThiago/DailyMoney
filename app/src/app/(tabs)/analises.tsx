import { Redirect } from 'expo-router';
import { type ReactNode, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import {
  ChangesCard,
  HabitsCard,
  MonthsCard,
  PeaksCard,
  RecurringCard,
  WeekdaysCard,
} from '@/components/AnalysisCards';
import { MonthNav } from '@/components/nav';
import { Chip } from '@/components/ui';
import { firstWithSpending, PERIODS, type Period } from '@/lib/analysis';
import { useAuth } from '@/lib/auth';
import { contentWidth, PAGE_MAX, PAGE_PAD, TWO_COLUMNS, WIDE_MIN } from '@/lib/dashboard';
import { currentMonth } from '@/lib/format';
import { useAnalysis } from '@/lib/queries';
import type { Currency } from '@/lib/types';
import { colors, fonts } from '@/theme';

// Análises (validated mock): how this month compares, what changed, habits, weekdays, peaks,
// and the charges that repeat. One currency at a time, like Início.
export default function AnalysisScreen() {
  const { state } = useAuth();
  const { width } = useWindowDimensions();
  const [month, setMonth] = useState(currentMonth);
  const [period, setPeriod] = useState<Period>(6);
  const [currency, setCurrency] = useState<Currency | null>(null);
  const query = useAnalysis(month, period, state.status === 'signedIn');

  if (state.status === 'loading') return <View style={styles.page} />;
  if (state.status === 'signedOut') return <Redirect href="/login" />;

  const data = query.data ?? null;
  const a =
    data?.currencies.find((c) => c.currency === currency) ??
    firstWithSpending(data?.currencies ?? []);
  const isWide = width >= WIDE_MIN;
  const twoColumns = isWide && contentWidth(width) >= TWO_COLUMNS;
  const hasSpending = !!a && a.months.some((m) => Number(m.amount) > 0);

  const currencyChips =
    data && data.currencies.length > 1 ? (
      <View style={styles.chips} accessibilityRole="radiogroup">
        {data.currencies.map((c) => (
          <Chip
            key={c.currency}
            label={c.currency}
            selected={c.currency === a?.currency}
            onPress={() => setCurrency(c.currency)}
          />
        ))}
      </View>
    ) : null;

  const periodChips = (
    <View style={styles.chips} accessibilityRole="radiogroup">
      {PERIODS.map((p) => (
        <Chip key={p} label={`${p} meses`} selected={p === period} onPress={() => setPeriod(p)} />
      ))}
    </View>
  );

  let body;
  if (query.isError) {
    body = <Text style={styles.empty}>Não consegui carregar. Tente de novo.</Text>;
  } else if (!data) {
    body = <ActivityIndicator color={colors.muted} style={styles.loading} />;
  } else if (!a || !hasSpending) {
    body = (
      <Text style={styles.empty}>
        Nenhum gasto nos extratos enviados para este período. Envie um extrato para ver as análises.
      </Text>
    );
  } else {
    const pair = (left: ReactNode, right: ReactNode) => (
      <View style={[styles.pair, !twoColumns && styles.stack]}>
        <View style={twoColumns && styles.half}>{left}</View>
        <View style={twoColumns && styles.half}>{right}</View>
      </View>
    );
    body = (
      <View style={styles.cards}>
        <MonthsCard a={a} month={month} />
        {pair(<ChangesCard a={a} />, <WeekdaysCard a={a} />)}
        {pair(<HabitsCard a={a} month={month} />, <PeaksCard a={a} />)}
        <RecurringCard a={a} />
      </View>
    );
  }

  if (isWide) {
    return (
      <ScrollView style={styles.page} contentContainerStyle={wide.content}>
        <View style={wide.column}>
          <View style={wide.head}>
            <Text style={styles.title}>Análises</Text>
            <View style={wide.headRight}>
              {currencyChips}
              {periodChips}
              <MonthNav month={month} onChange={setMonth} compact />
            </View>
          </View>
          {body}
        </View>
      </ScrollView>
    );
  }

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.column}>
          <View style={styles.head}>
            <Text style={styles.title}>Análises</Text>
            <MonthNav month={month} onChange={setMonth} compact />
          </View>
          <View style={styles.filters}>
            {periodChips}
            {currencyChips}
          </View>
          {body}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.page },
  content: { paddingHorizontal: 16, paddingTop: 24, paddingBottom: 40, alignItems: 'center' },
  column: { width: '100%', maxWidth: 520 },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  title: { fontFamily: fonts.semibold, fontSize: 20, color: colors.ink },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 16,
  },
  chips: { flexDirection: 'row', gap: 6 },
  loading: { marginVertical: 32 },
  empty: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: colors.muted },
  cards: { gap: 16 },
  pair: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
  stack: { flexDirection: 'column', alignItems: 'stretch' },
  half: { flex: 1, minWidth: 0 },
});

const wide = StyleSheet.create({
  content: { paddingHorizontal: PAGE_PAD, paddingTop: 28, paddingBottom: 48 },
  column: { width: '100%', maxWidth: PAGE_MAX - PAGE_PAD * 2, gap: 16 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  headRight: { flexDirection: 'row', alignItems: 'center', gap: 16 },
});
