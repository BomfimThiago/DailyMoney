import { Text, View } from 'react-native';

import { money, monthLabel, shiftMonth } from '@/lib/format';
import { comparisonRows, type Tone } from '@/lib/monthFlow';
import type { CurrencyDashboard, CurrencySummary } from '@/lib/types';
import { colors } from '@/theme';

import { dash as styles } from './styles';

const toneColor: Record<Tone, string> = {
  good: colors.positive,
  bad: colors.danger,
  same: colors.muted,
};

const monthName = (month: string) => monthLabel(month).split(' ')[0];

// Entradas, Gastos and Sobra against the month before: its value and the difference, in
// green when it got better and red when it got worse. This month's own values are the
// figures at the top of Início, so they are not repeated here.
export function Comparison({
  month,
  shown,
  dash,
}: {
  month: string;
  shown: CurrencySummary;
  dash: CurrencyDashboard;
}) {
  const before = monthName(shiftMonth(month, -1));
  const rows = comparisonRows(shown, {
    income: dash.previous_income,
    spending: dash.previous_spending,
  });
  const cur = shown.currency;
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{`COMPARADO COM ${before.toUpperCase()}`}</Text>
      <View style={styles.cmpRow}>
        <Text style={[styles.cmpHead, styles.cmpLabel]}> </Text>
        <Text style={styles.cmpHead}>{before}</Text>
        <Text style={styles.cmpHead}>Diferença</Text>
      </View>
      {rows.map((r) => (
        <View key={r.key} style={[styles.cmpRow, styles.cmpLine]}>
          <Text style={[styles.cmpName, styles.cmpLabel]}>{r.label}</Text>
          <Text style={[styles.cmpValue, styles.cmpPrevious]} numberOfLines={1}>
            {r.previous === null ? '—' : money(r.previous, cur)}
          </Text>
          <Text
            style={[styles.cmpValue, { color: toneColor[r.tone] }]}
            numberOfLines={1}
            accessibilityLabel={`${r.label}: diferença ${r.diff === null ? 'sem mês anterior' : money(r.diff, cur, true)}`}
          >
            {r.diff === null ? '—' : money(r.diff, cur, true)}
          </Text>
        </View>
      ))}
    </View>
  );
}
