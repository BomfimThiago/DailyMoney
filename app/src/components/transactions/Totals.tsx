import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Chip } from '@/components/ui';
import {
  GROUP_BY,
  type GroupRow,
  groupRows,
  GROUPS_SHOWN,
  GROUPS_SHOWN_PHONE,
  totalsFigures,
} from '@/lib/transactions';
import type { CurrencyTotals } from '@/lib/types';
import type { TransactionsPage } from '@/lib/useTransactionsPage';
import { colors, fonts } from '@/theme';

// What the list shows, added up: entradas, saídas and the balance, then the same lines by
// category, Responsável or account. Every page of the list counts, not just the loaded one.
export function Totals({ page, wide }: { page: TransactionsPage; wide: boolean }) {
  const t = page.totals.data?.currencies[0];
  // No lines: the list says so already; while loading the first time, nothing to add up.
  if (!t || t.count === 0) return null;
  return (
    // While the new filter's figures come, the old ones stay, faded, instead of a blink.
    <View
      style={[s.box, wide && s.boxWide, page.totals.isPlaceholderData && s.stale]}
      testID={page.totals.isPlaceholderData ? 'totals-updating' : 'totals'}
    >
      <Figures t={t} label={totalsLabel(page)} wide={wide} />
      <Groups t={t} page={page} wide={wide} />
    </View>
  );
}

function totalsLabel(page: TransactionsPage): string {
  if (page.filtered) return 'TOTAL DO QUE ESTÁ FILTRADO';
  return page.period === 'month' ? 'TOTAL DO MÊS' : 'TOTAL DO PERÍODO';
}

function Figures({ t, label, wide }: { t: CurrencyTotals; label: string; wide: boolean }) {
  const f = totalsFigures(t);
  return (
    <View style={s.figuresBox}>
      <View style={s.figuresHead}>
        <Text style={s.label}>{label}</Text>
        <Text style={s.count}>{f.count}</Text>
      </View>
      <View style={[s.figures, !wide && s.figuresPhone]}>
        <Figure label="Entradas" value={f.income} income={f.hasIncome} wide={wide} />
        <Figure label="Saídas" value={f.spending} spend={f.hasSpending} wide={wide} />
        <Figure label="Saldo" value={f.balance} wide={wide} />
      </View>
    </View>
  );
}

function Figure({
  label,
  value,
  income,
  spend,
  wide,
}: {
  label: string;
  value: string;
  income?: boolean;
  spend?: boolean;
  wide: boolean;
}) {
  // On a phone three big numbers don't fit side by side: one per line, label on the left.
  return (
    <View style={wide ? s.figure : s.figurePhone}>
      <Text style={s.figureLabel}>{label}</Text>
      <Text
        style={[s.figureValue, !wide && s.figureValuePhone, income && s.income, spend && s.spend]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

function Groups({ t, page, wide }: { t: CurrencyTotals; page: TransactionsPage; wide: boolean }) {
  const [all, setAll] = useState(false);
  const { rows, hidden } = groupRows(
    t,
    page.groupBy,
    all,
    wide ? GROUPS_SHOWN : GROUPS_SHOWN_PHONE,
  );
  return (
    <View style={s.groups}>
      <View style={s.groupsHead}>
        <Text style={s.label}>POR</Text>
        <View style={s.chips} accessibilityRole="radiogroup">
          {GROUP_BY.map((g) => (
            <Chip
              key={g.value}
              label={g.label}
              selected={page.groupBy === g.value}
              onPress={() => page.setGroupBy(g.value)}
            />
          ))}
        </View>
      </View>
      <View style={[s.rows, wide && s.rowsWide]}>
        {rows.map((r) => (
          <Row key={r.key} r={r} wide={wide} />
        ))}
      </View>
      {hidden > 0 || all ? (
        <Pressable onPress={() => setAll(!all)} accessibilityRole="button" style={s.more}>
          <Text style={s.moreText}>{all ? 'Mostrar menos' : `Ver todos (${hidden} a mais)`}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Row({ r, wide }: { r: GroupRow; wide: boolean }) {
  return (
    <View style={[s.row, wide && s.rowWide]}>
      <View style={s.rowLine}>
        <Text style={s.rowName} numberOfLines={1}>
          {r.name}
        </Text>
        <Text style={[s.rowValue, r.incomeOnly && s.income]}>
          {r.spending ?? r.income ?? r.zero}
        </Text>
      </View>
      <View style={s.track}>
        <View style={[s.fill, r.incomeOnly && s.fillIncome, { width: r.width }]} />
      </View>
      <Text style={s.rowSub} numberOfLines={1}>
        {r.count}
        {r.spending && r.income ? (
          <Text style={s.income}>{`  ·  ${r.income} de entradas`}</Text>
        ) : null}
      </Text>
      {r.invested ? (
        <Text style={s.rowSub} numberOfLines={2}>
          {r.invested}
        </Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  box: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    marginTop: 16,
  },
  boxWide: { marginTop: 0, marginBottom: 16 },
  stale: { opacity: 0.45 },
  figuresBox: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 14, gap: 12 },
  figuresHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontFamily: fonts.medium, fontSize: 11, letterSpacing: 0.7, color: colors.muted },
  count: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted },
  figures: { flexDirection: 'row', gap: 32 },
  figuresPhone: { flexDirection: 'column', gap: 6 },
  figure: { gap: 2, minWidth: 160 },
  figurePhone: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  figureLabel: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
  figureValue: { fontFamily: fonts.regular, fontSize: 24, color: colors.ink },
  figureValuePhone: { fontSize: 18 },
  income: { color: colors.positive },
  spend: { color: colors.negative },
  note: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted },
  groups: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 6,
    gap: 12,
  },
  groupsHead: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  chips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  rows: { gap: 14 },
  rowsWide: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 32, rowGap: 14 },
  row: { gap: 5 },
  // Three groups side by side on a computer, so six fit in two lines.
  rowWide: { flexBasis: 200, flexGrow: 1, maxWidth: '31%' },
  rowLine: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  rowName: { flex: 1, fontFamily: fonts.regular, fontSize: 14, color: colors.ink },
  rowValue: { fontFamily: fonts.regular, fontSize: 14, color: colors.ink },
  rowSub: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.soft, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2, backgroundColor: colors.ink },
  fillIncome: { backgroundColor: colors.positive },
  more: { paddingVertical: 10, alignSelf: 'flex-start' },
  moreText: { fontFamily: fonts.medium, fontSize: 13, color: colors.ink },
});
