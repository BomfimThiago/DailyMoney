import { Text, View } from 'react-native';

import { calendarLegend, calendarWeeks, dayLevel } from '@/lib/dashboard';
import { money } from '@/lib/format';
import type { Currency, CurrencyDashboard } from '@/lib/types';
import { inkShade } from '@/theme';

import { dash as styles } from './styles';

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

// Each day shaded by how much was spent; the most expensive day is the darkest.
export function SpendingCalendar({ month, dash }: { month: string; dash: CurrencyDashboard }) {
  const values = dash.daily.map(Number);
  const peak = Math.max(...values, 0);
  return (
    <View style={[styles.card, styles.half]}>
      <Text style={styles.cardTitle}>CALENDÁRIO DE GASTOS</Text>
      <View style={styles.week}>
        {WEEKDAYS.map((d, i) => (
          <Text key={i} style={styles.weekday}>
            {d}
          </Text>
        ))}
      </View>
      {calendarWeeks(month).map((week, wi) => (
        <View key={wi} style={styles.week}>
          {week.map((d, di) =>
            d === null ? (
              <View key={di} style={styles.dayBlank} />
            ) : (
              <Day
                key={di}
                day={d}
                value={values[d - 1] ?? 0}
                peak={peak}
                currency={dash.currency}
              />
            ),
          )}
        </View>
      ))}
      <Text style={styles.legend}>{calendarLegend(month, dash.daily, dash.currency)}</Text>
    </View>
  );
}

function Day({
  day,
  value,
  peak,
  currency,
}: {
  day: number;
  value: number;
  peak: number;
  currency: Currency;
}) {
  const level = dayLevel(value, peak);
  const shaded = level > 0 && { backgroundColor: inkShade(level), borderColor: 'transparent' };
  return (
    <View
      style={[styles.day, shaded]}
      accessibilityLabel={
        value > 0 ? `${day}: ${money(String(value), currency)}` : `${day}: sem gastos`
      }
    >
      <Text
        style={[styles.dayText, level > 0 && styles.dayTextSpent, level > 0.45 && styles.dayTextOn]}
      >
        {day}
      </Text>
    </View>
  );
}
