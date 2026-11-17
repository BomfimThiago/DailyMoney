import { Pressable, StyleSheet, Text, View } from 'react-native';

import { dayMonth, isIncome } from '@/lib/format';
import { lineAmounts } from '@/lib/transactions';
import type { Transaction } from '@/lib/types';
import { colors, fonts } from '@/theme';

function kindLabel(t: Transaction): string | null {
  switch (t.kind) {
    case 'investment':
      // Its category, like any spending or income; the sign says aplicação or resgate.
      return t.category_name ?? 'Investimento';
    case 'transfer':
      return 'Entre suas contas';
    case 'pending':
      return 'A confirmar';
    default:
      return t.category_name;
  }
}

// "parcela 3/10" for a purchase split on the card.
function installmentLabel(t: Transaction): string | null {
  return t.installment ? `parcela ${t.installment}` : null;
}

function dotStyle(t: Transaction) {
  if (t.kind === 'investment') return styles.dotInvest;
  if (t.kind === 'transfer') return styles.dotTransfer;
  if (t.kind === 'pending') return styles.dotPending;
  return isIncome(t.amount) ? styles.dotIncome : styles.dotSpend;
}

// One line of money: what, where, when. Spending, income and investments carry a sign
// (an aplicação is money going out of the month, a resgate money coming in); transfers
// just moved, so they show the plain value.
export function TxRow({
  t,
  first,
  onPress,
}: {
  t: Transaction;
  first?: boolean;
  onPress?: () => void;
}) {
  const regular = t.kind === 'regular';
  const moved = t.kind === 'transfer' || t.kind === 'pending';
  const amount = lineAmounts(t, moved ? 'plain' : 'signed');
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={[styles.row, first && styles.first]}
    >
      <View style={[styles.dot, dotStyle(t)]} />
      <View style={styles.main}>
        <Text style={styles.title} numberOfLines={1}>
          {t.description}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {[kindLabel(t), t.account_name, dayMonth(t.date), installmentLabel(t)]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>
      <View style={styles.amounts}>
        <Text
          style={[
            styles.amount,
            regular && isIncome(t.amount) && styles.income,
            t.kind === 'investment' && styles.invest,
            moved && styles.muted,
          ]}
        >
          {amount.shown}
        </Text>
        {amount.original ? <Text style={styles.original}>{amount.original}</Text> : null}
      </View>
    </Pressable>
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
  amounts: { alignItems: 'flex-end', gap: 2 },
  original: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted },
  amount: { fontFamily: fonts.regular, fontSize: 15, color: colors.ink },
  income: { color: colors.positive },
  invest: { color: colors.invest },
  muted: { color: colors.muted },
});
