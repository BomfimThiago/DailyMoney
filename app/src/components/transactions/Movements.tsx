import { StyleSheet, Text, View } from 'react-native';

import { money } from '@/lib/format';
import { movementResult, movementSub } from '@/lib/movements';
import type { MovementGroup, MovementsOverview } from '@/lib/types';
import { colors, fonts } from '@/theme';

// The month's money that only changed place, by category: how much left, how much
// arrived, and whether it all came back. With every account in the app it closes near zero.
export function Movements({ data }: { data: MovementsOverview }) {
  if (!data.groups.length) return null;
  return (
    <View style={styles.list}>
      {data.groups.map((g) => (
        <Group key={g.currency} g={g} />
      ))}
    </View>
  );
}

function Group({ g }: { g: MovementGroup }) {
  const result = movementResult(g);
  return (
    <View style={styles.card} testID={`movements-${g.currency}`}>
      {g.rows.map((r) => (
        <View key={r.name ?? '-'} style={styles.row}>
          <View style={[styles.dot, { backgroundColor: r.color ?? colors.dashed }]} />
          <View style={styles.main}>
            <Text style={styles.name}>{r.name ?? 'Sem categoria'}</Text>
            <Text style={styles.sub}>{movementSub(r, g)}</Text>
          </View>
          <Text style={styles.net}>{money(r.net, g.currency, true)}</Text>
        </View>
      ))}
      <View style={styles.foot}>
        <View style={styles.main}>
          <Text style={[styles.result, g.result === 'closed' && styles.closed]}>
            {result.title}
          </Text>
          <Text style={styles.sub}>{result.note}</Text>
        </View>
        <Text style={styles.total}>{money(g.net, g.currency, true)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10 },
  card: { borderWidth: 1, borderColor: colors.line, borderRadius: 14, paddingHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 12 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  main: { flex: 1, minWidth: 0, gap: 3 },
  name: { fontFamily: fonts.regular, fontSize: 15, color: colors.ink },
  sub: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, color: colors.muted },
  net: { fontFamily: fonts.regular, fontSize: 15, color: colors.muted },
  foot: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  result: { fontFamily: fonts.medium, fontSize: 15, color: colors.ink },
  closed: { color: colors.positive },
  total: { fontFamily: fonts.medium, fontSize: 15, color: colors.ink },
});
