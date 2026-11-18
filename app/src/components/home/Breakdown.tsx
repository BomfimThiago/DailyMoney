import { useState } from 'react';
import { Text, View } from 'react-native';

import { Chip } from '@/components/ui';
import { shareBars, topShares } from '@/lib/dashboard';
import { money } from '@/lib/format';
import type { CurrencyDashboard } from '@/lib/types';

import { dash as styles } from './styles';

type By = 'categoria' | 'pessoa' | 'banco' | 'conta';

const OPTIONS: {
  by: By;
  label: string;
  rows: (d: CurrencyDashboard) => CurrencyDashboard['categories'];
}[] = [
  { by: 'categoria', label: 'Categoria', rows: (d) => d.categories },
  { by: 'pessoa', label: 'Pessoa', rows: (d) => d.people },
  { by: 'banco', label: 'Banco', rows: (d) => d.banks },
  { by: 'conta', label: 'Conta', rows: (d) => d.accounts },
];

export function Breakdown({ dash, half = true }: { dash: CurrencyDashboard; half?: boolean }) {
  const [by, setBy] = useState<By>('categoria');
  const chosen = OPTIONS.find((o) => o.by === by) ?? OPTIONS[0];
  const rows = shareBars(topShares(chosen.rows(dash)));
  return (
    <View style={[styles.card, half && styles.half]}>
      <View style={[styles.cardHead, styles.wrap]}>
        <Text style={styles.cardTitle}>DIVISÃO DOS GASTOS</Text>
        <View style={styles.chips} accessibilityRole="radiogroup">
          {OPTIONS.map((o) => (
            <Chip key={o.by} label={o.label} selected={by === o.by} onPress={() => setBy(o.by)} />
          ))}
        </View>
      </View>
      {rows.length === 0 ? <Text style={styles.muted}>Nenhum gasto neste mês.</Text> : null}
      {rows.map((r) => (
        <View key={r.name} style={styles.share}>
          <View style={styles.shareLine}>
            <Text style={styles.shareName} numberOfLines={1}>
              {r.name}
            </Text>
            <Text style={styles.shareValue}>
              {money(String(r.amount), dash.currency)}
              <Text style={styles.sharePct}> · {r.pct}%</Text>
            </Text>
          </View>
          <View style={styles.track}>
            <View style={[styles.fill, { width: r.width }]} />
          </View>
        </View>
      ))}
    </View>
  );
}
