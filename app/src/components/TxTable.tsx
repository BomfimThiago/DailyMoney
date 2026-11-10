import { Fragment } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { isIncome, money } from '@/lib/format';
import type { Transaction } from '@/lib/types';
import { colors, fonts } from '@/theme';

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// "Sex, 28 nov"
export function dayHeading(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const weekday = new Date(y, m - 1, d).getDay();
  return `${WEEKDAYS[weekday]}, ${d} ${MONTHS[m - 1]}`;
}

// Transações on a computer: the old web's table, grouped by day. Clicking a line opens
// its detail next to the table.
export function TxTable({
  items,
  selectedId,
  onSelect,
}: {
  items: Transaction[];
  selectedId: string | null;
  onSelect: (t: Transaction) => void;
}) {
  return (
    <View accessibilityRole="list">
      <View style={styles.head}>
        <Text style={[styles.th, styles.colDesc]}>DESCRIÇÃO</Text>
        <Text style={[styles.th, styles.colCat]}>CATEGORIA</Text>
        <Text style={[styles.th, styles.colAcc]}>CONTA</Text>
        <Text style={[styles.th, styles.colVal]}>VALOR</Text>
      </View>
      {items.map((t, i) => {
        const newDay = i === 0 || items[i - 1].date !== t.date;
        const on = t.id === selectedId;
        const income = isIncome(t.amount);
        return (
          <Fragment key={t.id}>
            {newDay ? <Text style={styles.day}>{dayHeading(t.date)}</Text> : null}
            <Pressable
              onPress={() => onSelect(t)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${t.description}, ${money(t.amount, t.currency, true)}`}
              style={[styles.row, newDay && styles.rowFirst, on && styles.rowOn]}
            >
              <Text style={[styles.td, styles.colDesc]} numberOfLines={1}>
                {t.description}
              </Text>
              <View style={[styles.colCat, styles.tag]}>
                <View style={[styles.dot, income && styles.dotIncome]} />
                <Text style={styles.tagText} numberOfLines={1}>
                  {t.category_name ?? 'Outros'}
                </Text>
              </View>
              <Text style={[styles.td, styles.muted, styles.colAcc]} numberOfLines={1}>
                {t.account_name}
              </Text>
              <Text style={[styles.td, styles.colVal, income && styles.income]}>
                {money(t.amount, t.currency, true)}
              </Text>
            </Pressable>
          </Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  th: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 0.6, color: colors.muted },
  colDesc: { flex: 2.2, minWidth: 0 },
  colCat: { flex: 1.2, minWidth: 0 },
  colAcc: { flex: 1, minWidth: 0 },
  colVal: { width: 120, textAlign: 'right' },
  day: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
    paddingHorizontal: 10,
    paddingTop: 16,
    paddingBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 10,
    minHeight: 42,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  rowFirst: { borderTopWidth: 0 },
  rowOn: { backgroundColor: colors.soft, borderRadius: 8 },
  td: { fontFamily: fonts.regular, fontSize: 14, color: colors.ink },
  muted: { color: colors.muted },
  income: { color: colors.positive },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.dashed },
  dotIncome: { backgroundColor: colors.positive },
  tagText: { flex: 1, fontFamily: fonts.regular, fontSize: 13, color: colors.ink },
});
