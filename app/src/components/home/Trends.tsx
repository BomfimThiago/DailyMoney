import { type ReactNode, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  ChangesCard,
  HabitsCard,
  MonthsCard,
  RecurringCard,
  WeekdaysCard,
} from '@/components/AnalysisCards';
import { Loadable } from '@/components/states';
import { Chip } from '@/components/ui';
import { PERIODS, type Period, shownAnalysis } from '@/lib/analysis';
import { useDisplayCurrency } from '@/lib/displayCurrency';
import { useAnalysis } from '@/lib/queries';
import type { CurrencyAnalysis } from '@/lib/types';
import { colors, fonts } from '@/theme';

const EMPTY = 'Ainda não há gastos nos meses anteriores para comparar.';

// The part of Início that looks back over the last months (it used to be the Análises
// page): spending per month, what changed, weekdays, habits and the charges that repeat.
// It follows the month and the currency chosen at the top of Início.
export function Trends({ month, twoColumns }: { month: string; twoColumns: boolean }) {
  const [period, setPeriod] = useState<Period>(6);
  const { currency } = useDisplayCurrency();
  const query = useAnalysis(month, period, true);
  const a = shownAnalysis(query.data?.currencies ?? [], currency);
  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <Text style={styles.title}>Últimos meses</Text>
        <View style={styles.chips} accessibilityRole="radiogroup">
          {PERIODS.map((p) => (
            <Chip
              key={p}
              label={`${p} meses`}
              selected={p === period}
              onPress={() => setPeriod(p)}
            />
          ))}
        </View>
      </View>
      <Loadable
        isError={query.isError}
        loading={!query.data}
        value={a}
        empty={EMPTY}
        textStyle={styles.muted}
      >
        {(shown) => <Cards a={shown} month={month} twoColumns={twoColumns} />}
      </Loadable>
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
        right={<RecurringCard a={a} />}
      />
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
  section: { gap: 14, marginTop: 12 },
  head: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: { fontFamily: fonts.medium, fontSize: 16, color: colors.ink },
  chips: { flexDirection: 'row', gap: 6 },
  muted: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: colors.muted },
  cards: { gap: 16 },
  pair: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
  stack: { flexDirection: 'column', alignItems: 'stretch' },
  half: { flex: 1, minWidth: 0 },
});
