import { useState } from 'react';
import { Text, View } from 'react-native';

import { Chip } from '@/components/ui';
import { shareBars, topShares } from '@/lib/dashboard';
import { money } from '@/lib/format';
import type { CurrencyDashboard } from '@/lib/types';

import { dash as styles } from './styles';

type By = 'categoria' | 'conta';

export function Breakdown({ dash }: { dash: CurrencyDashboard }) {
  const [by, setBy] = useState<By>('categoria');
  const rows = shareBars(topShares(by === 'categoria' ? dash.categories : dash.accounts));
  return (
    <View style={[styles.card, styles.half]}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>DIVISÃO DOS GASTOS</Text>
        <View style={styles.chips} accessibilityRole="radiogroup">
          <Chip
            label="Categoria"
            selected={by === 'categoria'}
            onPress={() => setBy('categoria')}
          />
          <Chip label="Conta" selected={by === 'conta'} onPress={() => setBy('conta')} />
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
