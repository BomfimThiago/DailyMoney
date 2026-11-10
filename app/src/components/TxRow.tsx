import { StyleSheet, Text, View } from 'react-native';

import { dayMonth, isIncome, money } from '@/lib/format';
import type { Transaction } from '@/lib/types';
import { colors, fonts } from '@/theme';

function kindLabel(t: Transaction): string | null {
  switch (t.kind) {
    case 'investment':
      return isIncome(t.amount) ? 'Resgate' : 'Aplicação';
    case 'transfer':
      return 'Entre suas contas';
    case 'pending':
      return 'A confirmar';
    default:
      return t.category_name;
  }
}

function dotStyle(t: Transaction) {
  if (t.kind === 'investment') return styles.dotInvest;
  if (t.kind === 'transfer') return styles.dotTransfer;
  if (t.kind === 'pending') return styles.dotPending;
  return isIncome(t.amount) ? styles.dotIncome : styles.dotSpend;
}

// One line of money: what, where, when. Only spending and income carry a sign; the rest
// just moved, so they show the plain value.
export function TxRow({ t, first }: { t: Transaction; first?: boolean }) {
  const regular = t.kind === 'regular';
  const amount = regular
    ? money(t.amount, t.currency, true)
    : money(t.amount.replace('-', ''), t.currency);
  return (
    <View style={[styles.row, first && styles.first]}>
      <View style={[styles.dot, dotStyle(t)]} />
      <View style={styles.main}>
        <Text style={styles.title} numberOfLines={1}>
          {t.description}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {[kindLabel(t), t.account_name, dayMonth(t.date)].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <Text
        style={[
          styles.amount,
          regular && isIncome(t.amount) && styles.income,
          t.kind === 'investment' && styles.invest,
          (t.kind === 'transfer' || t.kind === 'pending') && styles.muted,
        ]}
      >
        {amount}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  first: { borderTopWidth: 0 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotSpend: { backgroundColor: colors.dashed },
  dotIncome: { backgroundColor: colors.positive },
  dotInvest: { backgroundColor: colors.invest },
  dotTransfer: { borderWidth: 1.5, borderColor: colors.muted },
  dotPending: { backgroundColor: colors.pending },
  main: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontFamily: fonts.regular, fontSize: 15, color: colors.ink },
  sub: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted },
  amount: { fontFamily: fonts.regular, fontSize: 15, color: colors.ink },
  income: { color: colors.positive },
  invest: { color: colors.invest },
  muted: { color: colors.muted },
});
