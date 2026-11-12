import { Text, View } from 'react-native';

import { TxRow } from '@/components/TxRow';
import { isZero, money, shortMonth } from '@/lib/format';
import { barHeights, productMonth } from '@/lib/investments';
import type { InvestmentOverview, Transaction } from '@/lib/types';

import { styles, wide } from './styles';

export function Products({ products }: { products: InvestmentOverview['products'] }) {
  return (
    <View>
      {products.map((p, i) => (
        <View key={`${p.account_id}-${p.name}`} style={[styles.row, i === 0 && styles.first]}>
          <View style={styles.main}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {p.name}
            </Text>
            <Text style={styles.rowSub}>{p.account_name}</Text>
          </View>
          <View style={styles.right}>
            <Text style={styles.rowValue}>{money(p.net, p.currency)}</Text>
            <Text style={[styles.rowSub, !isZero(p.month_net) && styles.invest]}>
              {productMonth(p)}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export function ReadFromStatements() {
  return (
    <View style={styles.note}>
      <Text style={styles.noteText}>
        Por enquanto mostramos quanto você colocou e tirou, lido dos extratos. Saldo atual e
        rendimento aparecem quando o banco estiver conectado.
      </Text>
    </View>
  );
}

export function Movements({ movements }: { movements: Transaction[] }) {
  if (!movements.length) {
    return <Text style={styles.empty}>Nenhuma aplicação ou resgate neste mês.</Text>;
  }
  return movements.map((t, i) => <TxRow key={t.id} t={t} first={i === 0} />);
}

export function Bars({
  history,
  month,
}: {
  history: InvestmentOverview['history'];
  month: string;
}) {
  const heights = barHeights(history);
  return (
    <View
      style={styles.bars}
      accessibilityRole="image"
      accessibilityLabel={history
        .map((h) => `${shortMonth(h.month)} ${money(h.net, h.currency)}`)
        .join(', ')}
    >
      {history.map((h, i) => {
        const on = h.month === month;
        return (
          <View key={h.month} style={styles.barCol}>
            <View style={[styles.bar, { height: heights[i] }, on && styles.barOn]} />
            <Text style={[styles.barText, on && styles.barTextOn]}>{shortMonth(h.month)}</Text>
          </View>
        );
      })}
    </View>
  );
}

export function Stat({ label, value, tone }: { label: string; value: string; tone?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text
        style={[styles.statValue, tone && styles.invest]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
    </View>
  );
}

export function Figure({
  label,
  value,
  sub,
  tone,
  first,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: boolean;
  first?: boolean;
}) {
  return (
    <View style={[wide.figure, !first && wide.divider]}>
      <Text style={wide.figureLabel}>{label}</Text>
      <Text
        style={[wide.figureValue, tone && styles.invest]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      {sub ? <Text style={wide.figureSub}>{sub}</Text> : null}
    </View>
  );
}
