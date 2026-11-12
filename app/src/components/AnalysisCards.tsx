import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  barHeight,
  changeRows,
  dayLabel,
  habitDetail,
  habitTrend,
  monthSentence,
  recurringDetail,
  recurringSentence,
  topWeekday,
  WEEKDAYS,
  weekdaySentence,
} from '@/lib/analysis';
import { money, plain, shortMonth } from '@/lib/format';
import type { Currency, CurrencyAnalysis } from '@/lib/types';
import { colors, fonts } from '@/theme';

// The cards of Análises (validated mock: trend, what changed, habits, weekday, peaks),
// plus the charges that repeat every month. Shared by the phone and computer layouts.

function Card({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      {sub ? <Text style={styles.sub}>{sub}</Text> : null}
      {children}
    </View>
  );
}

const BARS_H = 120;

export function MonthsCard({ a, month }: { a: CurrencyAnalysis; month: string }) {
  const values = a.months.map((m) => Number(m.amount));
  const average = a.average === null ? null : Number(a.average);
  const top = Math.max(...values, average ?? 0, 1) * 1.12;
  const last = a.months.length - 1;
  return (
    <Card title="GASTOS POR MÊS" sub={monthSentence(a, month)}>
      <View style={styles.chart}>
        <View style={styles.bars}>
          {a.months.map((m, i) => (
            <MonthBar key={m.month} m={m} top={top} on={i === last} currency={a.currency} />
          ))}
        </View>
        {average ? (
          <View style={[styles.avgLine, { bottom: (average / top) * BARS_H }]}>
            <Text style={styles.avgText}>média {plain(String(average))}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.barLabels}>
        {a.months.map((m, i) => (
          <Text key={m.month} style={[styles.barLabel, i === last && styles.barLabelOn]}>
            {shortMonth(m.month)}
          </Text>
        ))}
      </View>
    </Card>
  );
}

function MonthBar({
  m,
  top,
  on,
  currency,
}: {
  m: CurrencyAnalysis['months'][number];
  top: number;
  on: boolean;
  currency: Currency;
}) {
  const value = Number(m.amount);
  return (
    <View style={styles.barCol}>
      {on && value > 0 ? (
        <Text style={styles.barValue} numberOfLines={1}>
          {plain(m.amount)}
        </Text>
      ) : null}
      <View
        style={[styles.bar, { height: barHeight(value, top, BARS_H) }, on && styles.barOn]}
        accessibilityLabel={`${shortMonth(m.month)}: ${money(m.amount, currency)}`}
      />
    </View>
  );
}

// The list of a card, or a short sentence when it has nothing to show.
function Rows<T>({
  items,
  empty,
  children,
}: {
  items: T[];
  empty: string;
  children: (item: T, i: number) => ReactNode;
}) {
  if (items.length === 0) return <Text style={styles.empty}>{empty}</Text>;
  return items.map(children);
}

export function ChangesCard({ a }: { a: CurrencyAnalysis }) {
  const first = a.changes[0];
  return (
    <Card title="O QUE MAIS MUDOU" sub="Cada categoria neste mês, comparada com a média dela.">
      <Rows
        items={changeRows(a.changes)}
        empty="Precisa de pelo menos um mês anterior para comparar."
      >
        {(r) => <ChangeRow key={r.name} r={r} />}
      </Rows>
      {first ? (
        <Text style={styles.foot}>
          {first.name}: {money(first.amount, a.currency)} contra {money(first.average, a.currency)}{' '}
          de costume.
        </Text>
      ) : null}
    </Card>
  );
}

function ChangeRow({ r }: { r: ReturnType<typeof changeRows>[number] }) {
  return (
    <View style={styles.change}>
      <Text style={styles.changeName} numberOfLines={1}>
        {r.name}
      </Text>
      <View style={styles.track}>
        <View style={styles.mid} />
        <View
          style={[
            styles.changeBar,
            r.up ? styles.up : styles.down,
            { width: `${r.width}%` },
            r.up ? { left: '50%' } : { right: '50%' },
          ]}
        />
      </View>
      <Text style={[styles.changePct, r.up ? styles.upText : styles.downText]}>{r.label}</Text>
    </View>
  );
}

export function HabitsCard({ a, month }: { a: CurrencyAnalysis; month: string }) {
  return (
    <Card title="HÁBITOS" sub="Compras que se repetem três vezes ou mais no mês.">
      <Rows items={a.habits} empty="Nenhuma compra se repetiu tanto neste mês.">
        {(h, i) => (
          <View key={h.name} style={[styles.row, i === 0 && styles.rowFirst]}>
            <View style={styles.rowMain}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {h.name}
              </Text>
              <Text style={styles.rowSub}>{habitDetail(h, a.currency)}</Text>
            </View>
            <View style={styles.count}>
              <Text style={styles.countValue}>{h.count}×</Text>
              <Text style={[styles.rowSub, h.count > h.previous_count && styles.upText]}>
                {habitTrend(h.count, h.previous_count, month)}
              </Text>
            </View>
            <Text style={styles.rowAmount}>{money(h.total, a.currency)}</Text>
          </View>
        )}
      </Rows>
    </Card>
  );
}

const WEEK_H = 96;

export function WeekdaysCard({ a }: { a: CurrencyAnalysis }) {
  const values = a.weekdays.map(Number);
  const max = Math.max(...values, 1);
  const top = topWeekday(a.weekdays);
  return (
    <Card title="POR DIA DA SEMANA" sub={weekdaySentence(a)}>
      <View style={styles.week}>
        {values.map((v, i) => (
          <WeekdayBar key={WEEKDAYS[i]} label={WEEKDAYS[i]} value={v} max={max} on={i === top} />
        ))}
      </View>
      <Text style={styles.foot}>Média por dia no período, de acordo com os extratos enviados.</Text>
    </Card>
  );
}

function WeekdayBar({
  label,
  value,
  max,
  on,
}: {
  label: string;
  value: number;
  max: number;
  on: boolean;
}) {
  return (
    <View style={styles.weekCol}>
      <Text style={[styles.weekValue, on && styles.weekValueOn]} numberOfLines={1}>
        {value > 0 ? plain(String(value)) : ''}
      </Text>
      <View
        style={[styles.weekBar, { height: barHeight(value, max, WEEK_H) }, on && styles.barOn]}
      />
      <Text style={[styles.barLabel, on && styles.barLabelOn]}>{label}</Text>
    </View>
  );
}

export function PeaksCard({ a }: { a: CurrencyAnalysis }) {
  return (
    <Card title="PICOS DO MÊS" sub="Os dias mais caros, sem contar moradia.">
      <Rows items={a.peaks} empty="Nenhum gasto neste mês.">
        {(p, i) => (
          <View key={p.date} style={[styles.row, i === 0 && styles.rowFirst]}>
            <View style={styles.rank}>
              <Text style={styles.rankText}>{i + 1}</Text>
            </View>
            <View style={styles.rowMain}>
              <Text style={styles.rowTitle}>{dayLabel(p.date)}</Text>
              <Text style={styles.rowSub} numberOfLines={1}>
                {p.merchants.join(' e ')}
              </Text>
            </View>
            <Text style={styles.rowAmount}>{money(p.amount, a.currency)}</Text>
          </View>
        )}
      </Rows>
    </Card>
  );
}

export function RecurringCard({ a }: { a: CurrencyAnalysis }) {
  return (
    <Card title="COBRANÇAS QUE SE REPETEM" sub={recurringSentence(a)}>
      <Rows
        items={a.recurring}
        empty="Nenhuma assinatura ou cobrança mensal encontrada nos últimos meses."
      >
        {(r, i) => (
          <View key={r.name} style={[styles.row, i === 0 && styles.rowFirst]}>
            <View style={styles.rowMain}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {r.name}
              </Text>
              <Text style={styles.rowSub}>{recurringDetail(r)}</Text>
            </View>
            <Text style={styles.rowAmount}>{money(r.amount, a.currency)}</Text>
          </View>
        )}
      </Rows>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 18, gap: 6 },
  title: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 0.7, color: colors.muted },
  sub: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: colors.muted },
  empty: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: colors.muted },
  foot: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted, marginTop: 6 },
  chart: { height: BARS_H + 22, marginTop: 8, justifyContent: 'flex-end' },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: BARS_H + 22 },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  bar: { width: '100%', maxWidth: 56, borderRadius: 5, backgroundColor: colors.barSoft },
  barOn: { backgroundColor: colors.ink },
  barValue: { fontFamily: fonts.medium, fontSize: 11, color: colors.ink },
  avgLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.muted,
  },
  avgText: {
    position: 'absolute',
    top: -16,
    left: 0,
    fontFamily: fonts.regular,
    fontSize: 10,
    color: colors.muted,
    backgroundColor: colors.page,
    paddingRight: 4,
  },
  barLabels: { flexDirection: 'row', gap: 8, marginTop: 6 },
  barLabel: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.muted,
  },
  barLabelOn: { fontFamily: fonts.semibold, color: colors.ink },
  change: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  changeName: { width: 104, fontFamily: fonts.regular, fontSize: 14, color: colors.ink },
  track: { flex: 1, height: 8, justifyContent: 'center' },
  mid: {
    position: 'absolute',
    left: '50%',
    top: -4,
    bottom: -4,
    width: 1,
    backgroundColor: colors.line,
  },
  changeBar: { position: 'absolute', height: 8, borderRadius: 3 },
  up: { backgroundColor: colors.accent },
  down: { backgroundColor: colors.positive },
  changePct: { width: 48, textAlign: 'right', fontFamily: fonts.medium, fontSize: 13 },
  upText: { color: colors.accent },
  downText: { color: colors.positive },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  rowFirst: { borderTopWidth: 0 },
  rowMain: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { fontFamily: fonts.regular, fontSize: 14, color: colors.ink },
  rowSub: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted },
  rowAmount: { fontFamily: fonts.regular, fontSize: 14, color: colors.ink, textAlign: 'right' },
  count: { alignItems: 'flex-end', minWidth: 72 },
  countValue: { fontFamily: fonts.medium, fontSize: 15, color: colors.ink },
  rank: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.ink },
  week: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginTop: 8 },
  weekCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  weekBar: { width: '100%', maxWidth: 34, borderRadius: 5, backgroundColor: colors.barSoft },
  weekValue: { fontFamily: fonts.regular, fontSize: 10, color: colors.muted },
  weekValueOn: { fontFamily: fonts.semibold, color: colors.ink },
});
