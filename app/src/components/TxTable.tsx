import { Fragment } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { dayMonth, isIncome } from '@/lib/format';
import type { TxSort } from '@/lib/imports';
import { HOUSEHOLD, HOUSEHOLD_ID } from '@/lib/people';
import {
  amountTone,
  lineAmounts,
  movedLabel,
  nextSort,
  type Option,
  type SortColumn,
  sortArrow,
} from '@/lib/transactions';
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

// Transações on a computer: the old web's table. By day, with each day's total beside its
// date; clicking Descrição or Valor sorts the whole list by it (a third click goes back).
// Clicking a line opens its detail next to the table.
export function TxTable({
  items,
  selectedId,
  onSelect,
  sort = 'date',
  onSort,
  days = {},
  members = [],
}: {
  items: Transaction[];
  selectedId: string | null;
  onSelect: (t: Transaction) => void;
  sort?: TxSort;
  onSort?: (sort: TxSort) => void;
  days?: Record<string, string>;
  members?: Option[];
}) {
  const byDay = sort === 'date';
  const owner = (t: Transaction) =>
    members.find((m) => m.id === (t.member_id ?? HOUSEHOLD_ID))?.name ?? HOUSEHOLD;
  return (
    <View accessibilityRole="list">
      <View style={styles.head}>
        {byDay ? null : <Text style={[styles.th, styles.colDate]}>DATA</Text>}
        <Header
          label="DESCRIÇÃO"
          column="description"
          sort={sort}
          onSort={onSort}
          style={styles.colDesc}
        />
        <Text style={[styles.th, styles.colCat]}>CATEGORIA</Text>
        <Text style={[styles.th, styles.colWho]}>RESPONSÁVEL</Text>
        <Text style={[styles.th, styles.colAcc]}>CONTA</Text>
        <Header label="VALOR" column="amount" sort={sort} onSort={onSort} style={styles.colVal} />
      </View>
      {items.map((t, i) => {
        const newDay = byDay && (i === 0 || items[i - 1].date !== t.date);
        const on = t.id === selectedId;
        const invest = t.kind === 'investment';
        const moved = t.kind === 'transfer' || t.kind === 'pending';
        const income = !invest && !moved && isIncome(t.amount);
        const amount = lineAmounts(t, moved ? 'plain' : 'signed');
        return (
          <Fragment key={t.id}>
            {newDay ? (
              <View style={styles.dayRow}>
                <Text style={styles.day}>{dayHeading(t.date)}</Text>
                {days[t.date] ? <Text style={styles.day}>{days[t.date]}</Text> : null}
              </View>
            ) : null}
            <Pressable
              onPress={() => onSelect(t)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${t.description}, ${amount.shown}`}
              style={[styles.row, (newDay || i === 0) && styles.rowFirst, on && styles.rowOn]}
            >
              {byDay ? null : (
                <Text style={[styles.td, styles.muted, styles.colDate]}>{dayMonth(t.date)}</Text>
              )}
              <Text style={[styles.td, styles.colDesc]} numberOfLines={1}>
                {t.description}
                {t.installment ? <Text style={styles.installment}> {t.installment}</Text> : null}
              </Text>
              <View style={[styles.colCat, styles.tag]}>
                <View
                  style={[
                    styles.dot,
                    income && styles.dotIncome,
                    invest && styles.dotInvest,
                    moved && styles.dotMoved,
                  ]}
                />
                <Text style={styles.tagText} numberOfLines={1}>
                  {moved ? movedLabel(t, 'Transferência interna') : (t.category_name ?? 'Outros')}
                </Text>
              </View>
              <Text style={[styles.td, styles.muted, styles.colWho]} numberOfLines={1}>
                {owner(t)}
              </Text>
              <Text style={[styles.td, styles.muted, styles.colAcc]} numberOfLines={1}>
                {t.account_name}
              </Text>
              <View style={styles.valueBox}>
                <Text style={[styles.td, styles.value, toneStyle[amountTone(t)]]}>
                  {amount.shown}
                </Text>
                {amount.original ? <Text style={styles.original}>{amount.original}</Text> : null}
              </View>
            </Pressable>
          </Fragment>
        );
      })}
    </View>
  );
}

function Header({
  label,
  column,
  sort,
  onSort,
  style,
}: {
  label: string;
  column: SortColumn;
  sort: TxSort;
  onSort?: (sort: TxSort) => void;
  style: object;
}) {
  const text = <Text style={styles.th}>{`${label}${sortArrow(sort, column)}`}</Text>;
  if (!onSort) return <View style={style}>{text}</View>;
  return (
    <Pressable
      onPress={() => onSort(nextSort(sort, column))}
      accessibilityRole="button"
      accessibilityLabel={`Ordenar por ${label.toLowerCase()}`}
      style={[style, column === 'amount' && styles.thRight]}
    >
      {text}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  installment: { color: colors.muted },
  head: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  th: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 0.6, color: colors.muted },
  thRight: { alignItems: 'flex-end' },
  colDate: { width: 56 },
  colDesc: { flex: 2.2, minWidth: 0 },
  colCat: { flex: 1.2, minWidth: 0 },
  colWho: { flex: 0.9, minWidth: 0 },
  colAcc: { flex: 1, minWidth: 0 },
  colVal: { width: 120, alignItems: 'flex-end' },
  valueBox: { width: 120, alignItems: 'flex-end', gap: 2 },
  value: { textAlign: 'right' },
  original: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted },
  dayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingTop: 16,
    paddingBottom: 6,
  },
  day: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted },
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
  spend: { color: colors.negative },
  income: { color: colors.positive },
  invest: { color: colors.invest },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.dashed },
  dotIncome: { backgroundColor: colors.positive },
  dotInvest: { backgroundColor: colors.invest },
  dotMoved: { backgroundColor: colors.line },
  tagText: { flex: 1, fontFamily: fonts.regular, fontSize: 13, color: colors.ink },
});

const toneStyle = {
  spend: styles.spend,
  income: styles.income,
  invest: styles.invest,
  moved: styles.muted,
};
