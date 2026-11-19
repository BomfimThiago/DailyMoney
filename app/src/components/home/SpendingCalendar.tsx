import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { calendarLegend, calendarWeeks, dayLevel, dayOfPeriod } from '@/lib/dashboard';
import { dayParams } from '@/lib/drill';
import { addDays, money } from '@/lib/format';
import type { Currency, CurrencyDashboard } from '@/lib/types';
import { inkShade } from '@/theme';

import { dash as styles } from './styles';

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

// Each day shaded by how much was spent; the most expensive day is the darkest. A day with
// spending opens Transações on that day's spending.
export function SpendingCalendar({
  month,
  start,
  dash,
  half = true,
}: {
  month: string;
  start: string;
  dash: CurrencyDashboard;
  half?: boolean;
}) {
  const values = dash.daily.map(Number);
  const peak = Math.max(...values, 0);
  return (
    <View style={[styles.card, half && styles.half]}>
      <Text style={styles.cardTitle}>CALENDÁRIO DE GASTOS</Text>
      <View style={styles.week}>
        {WEEKDAYS.map((d, i) => (
          <Text key={i} style={styles.weekday}>
            {d}
          </Text>
        ))}
      </View>
      {calendarWeeks(start, dash.daily.length).map((week, wi) => (
        <View key={wi} style={styles.week}>
          {week.map((d, di) =>
            d === null ? (
              <View key={di} style={styles.dayBlank} />
            ) : (
              <Day
                key={di}
                day={dayOfPeriod(start, d)}
                onPress={
                  (values[d - 1] ?? 0) > 0
                    ? () =>
                        router.navigate({
                          pathname: '/transacoes',
                          params: dayParams(month, addDays(start, d - 1)),
                        })
                    : undefined
                }
                value={values[d - 1] ?? 0}
                peak={peak}
                currency={dash.currency}
              />
            ),
          )}
        </View>
      ))}
      <Text style={styles.legend}>{calendarLegend(start, dash.daily, dash.currency)}</Text>
    </View>
  );
}

function Day({
  day,
  onPress,
  value,
  peak,
  currency,
}: {
  day: number;
  onPress?: () => void;
  value: number;
  peak: number;
  currency: Currency;
}) {
  const level = dayLevel(value, peak);
  const shaded = level > 0 && { backgroundColor: inkShade(level), borderColor: 'transparent' };
  const label = (
    <Text
      style={[styles.dayText, level > 0 && styles.dayTextSpent, level > 0.45 && styles.dayTextOn]}
    >
      {day}
    </Text>
  );
  if (value <= 0 || !onPress) {
    return (
      <View style={styles.day} accessibilityLabel={`${day}: sem gastos`}>
        {label}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={`${day}: ${money(String(value), currency)}. Ver gastos do dia`}
      style={(state) => [styles.day, shaded, isHovered(state) && styles.dayHover]}
    >
      {label}
    </Pressable>
  );
}

function isHovered(state: object): boolean {
  return (state as { hovered?: boolean }).hovered === true;
}
