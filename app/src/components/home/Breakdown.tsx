import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { Chip } from '@/components/ui';
import { shareBars, topShares } from '@/lib/dashboard';
import { type BreakdownBy, drillParams } from '@/lib/drill';
import { money } from '@/lib/format';
import type { CurrencyDashboard } from '@/lib/types';

import { dash as styles } from './styles';

type By = BreakdownBy;

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

// Each row opens Transações with the month's spending of that row; "Demais" opens
// everything but the rows above it.
export function Breakdown({
  month,
  dash,
  half = true,
}: {
  month: string;
  dash: CurrencyDashboard;
  half?: boolean;
}) {
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
        <Pressable
          key={r.name}
          onPress={() =>
            router.navigate({
              pathname: '/transacoes',
              params: drillParams(month, by, r.ids, r.exclude),
            })
          }
          accessibilityRole="link"
          accessibilityLabel={`Ver transações: ${r.name}`}
          style={styles.share}
        >
          {(state) => (
            <>
              <View style={styles.shareLine}>
                <Text
                  style={[styles.shareName, isHovered(state) && styles.shareHover]}
                  numberOfLines={1}
                >
                  {r.name}
                </Text>
                <Text style={styles.shareValue}>
                  {money(String(r.amount), dash.currency)}
                  <Text style={styles.sharePct}> · {r.pct}%</Text>
                  <Text style={styles.shareGo}>{'  ›'}</Text>
                </Text>
              </View>
              <View style={styles.track}>
                <View style={[styles.fill, { width: r.width }]} />
              </View>
            </>
          )}
        </Pressable>
      ))}
    </View>
  );
}

// react-native-web adds "hovered" to the press state; the phone never has it.
function isHovered(state: object): boolean {
  return (state as { hovered?: boolean }).hovered === true;
}
