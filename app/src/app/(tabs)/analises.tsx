import { type ReactNode, useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import {
  ChangesCard,
  HabitsCard,
  MonthsCard,
  PeaksCard,
  RecurringCard,
  WeekdaysCard,
} from '@/components/AnalysisCards';
import { CurrencyChips } from '@/components/CurrencyChips';
import { MonthNav } from '@/components/nav';
import { Loadable, SignedIn } from '@/components/states';
import { Chip } from '@/components/ui';
import { PERIODS, type Period, shownAnalysis } from '@/lib/analysis';
import { contentWidth, PAGE_MAX, PAGE_PAD, TWO_COLUMNS, WIDE_MIN } from '@/lib/dashboard';
import { currentMonth } from '@/lib/format';
import { useAnalysis } from '@/lib/queries';
import type { Currency, CurrencyAnalysis } from '@/lib/types';
import { colors, fonts } from '@/theme';

const EMPTY =
  'Nenhum gasto nos extratos enviados para este período. Envie um extrato para ver as análises.';

// Análises (validated mock): how this month compares, what changed, habits, weekdays, peaks,
// and the charges that repeat. One currency at a time, like Início.
export default function AnalysisScreen() {
  return (
    <SignedIn>
      <Analyses />
    </SignedIn>
  );
}

function Analyses() {
  const { width } = useWindowDimensions();
  const [month, setMonth] = useState(currentMonth);
  const [period, setPeriod] = useState<Period>(6);
  const [currency, setCurrency] = useState<Currency | null>(null);
  const query = useAnalysis(month, period, true);
  const currencies = query.data?.currencies ?? [];
  const a = shownAnalysis(currencies, currency);
  const isWide = width >= WIDE_MIN;
  const chips = (
    <CurrencyChips
      currencies={currencies}
      current={a?.currency}
      onChange={setCurrency}
      style={styles.chips}
    />
  );
  const periods = <PeriodChips period={period} onChange={setPeriod} />;
  const body = (
    <Loadable isError={query.isError} loading={!query.data} value={a} empty={EMPTY}>
      {(shown) => (
        <Cards a={shown} month={month} twoColumns={isWide && contentWidth(width) >= TWO_COLUMNS} />
      )}
    </Loadable>
  );
  const monthNav = <MonthNav month={month} onChange={setMonth} compact />;
  return isWide ? (
    <ScrollView style={styles.page} contentContainerStyle={wide.content}>
      <View style={wide.column}>
        <View style={wide.head}>
          <Text style={styles.title}>Análises</Text>
          <View style={wide.headRight}>
            {chips}
            {periods}
            {monthNav}
          </View>
        </View>
        {body}
      </View>
    </ScrollView>
  ) : (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.column}>
          <View style={styles.head}>
            <Text style={styles.title}>Análises</Text>
            {monthNav}
          </View>
          <View style={styles.filters}>
            {periods}
            {chips}
          </View>
          {body}
        </View>
      </ScrollView>
    </View>
  );
}

function PeriodChips({ period, onChange }: { period: Period; onChange: (p: Period) => void }) {
  return (
    <View style={styles.chips} accessibilityRole="radiogroup">
      {PERIODS.map((p) => (
        <Chip key={p} label={`${p} meses`} selected={p === period} onPress={() => onChange(p)} />
      ))}
    </View>
  );
}

function Cards({
  a,
  month,
  twoColumns,
}: {
  a: CurrencyAnalysis;
  month: string;
  twoColumns: boolean;
}) {
  return (
    <View style={styles.cards}>
      <MonthsCard a={a} month={month} />
      <Pair twoColumns={twoColumns} left={<ChangesCard a={a} />} right={<WeekdaysCard a={a} />} />
      <Pair
        twoColumns={twoColumns}
        left={<HabitsCard a={a} month={month} />}
        right={<PeaksCard a={a} />}
      />
      <RecurringCard a={a} />
    </View>
  );
}

// Two cards side by side on a wide computer, one under the other elsewhere.
function Pair({
  twoColumns,
  left,
  right,
}: {
  twoColumns: boolean;
  left: ReactNode;
  right: ReactNode;
}) {
  return (
    <View style={[styles.pair, !twoColumns && styles.stack]}>
      <View style={twoColumns && styles.half}>{left}</View>
      <View style={twoColumns && styles.half}>{right}</View>
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
