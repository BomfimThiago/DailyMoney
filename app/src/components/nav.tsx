import { router, usePathname } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { currentMonth, monthLabel, shiftMonth, shortMonth } from '@/lib/format';
import { colors, fonts } from '@/theme';

const TABS = [
  { href: '/', label: 'Início' },
  { href: '/investimentos', label: 'Investimentos' },
  { href: '/transacoes', label: 'Transações' },
] as const;

export function TabBar() {
  const path = usePathname();
  return (
    <View style={styles.bar} accessibilityRole="tablist">
      <View style={styles.tabs}>
        {TABS.map((t) => {
          const on = t.href === '/' ? path === '/' : path.startsWith(t.href);
          return (
            <Pressable
              key={t.href}
              onPress={() => router.replace(t.href)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              style={styles.tab}
            >
              <View style={[styles.dot, on && styles.dotOn]} />
              <Text style={[styles.label, on && styles.labelOn]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function MonthNav({
  month,
  onChange,
  compact,
}: {
  month: string;
  onChange: (m: string) => void;
  compact?: boolean;
}) {
  const isLatest = month >= currentMonth();
  return (
    <View style={[styles.month, compact && styles.monthCompact]}>
      <Pressable
        onPress={() => onChange(shiftMonth(month, -1))}
        accessibilityRole="button"
        accessibilityLabel="Mês anterior"
        style={styles.arrow}
      >
        <Text style={styles.arrowText}>‹</Text>
      </Pressable>
      <Text style={compact ? styles.monthTextCompact : styles.monthText}>
        {compact ? `${shortMonth(month)} ${month.slice(0, 4)}` : monthLabel(month)}
      </Text>
      <Pressable
        onPress={() => onChange(shiftMonth(month, 1))}
        disabled={isLatest}
        accessibilityRole="button"
        accessibilityLabel="Próximo mês"
        style={[styles.arrow, isLatest && styles.off]}
      >
        <Text style={styles.arrowText}>›</Text>
      </Pressable>
    </View>
  );
}

export function Segment<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; badge?: number }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segment} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={[styles.segItem, on && styles.segItemOn]}
          >
            <Text style={[styles.segText, on && styles.segTextOn]}>{o.label}</Text>
            {o.badge ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{o.badge}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.page },
  tabs: {
    flexDirection: 'row',
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    paddingTop: 6,
    paddingBottom: 14,
  },
  tab: { flex: 1, alignItems: 'center', gap: 5, paddingVertical: 6, minHeight: 44 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: 'transparent' },
  dotOn: { backgroundColor: colors.ink },
  label: { fontFamily: fonts.medium, fontSize: 12, color: colors.muted },
  labelOn: { fontFamily: fonts.semibold, color: colors.ink },
  month: { flexDirection: 'row', alignItems: 'center', marginLeft: -12 },
  arrow: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  arrowText: { fontFamily: fonts.regular, fontSize: 22, color: colors.muted },
  off: { opacity: 0.25 },
  monthText: { fontFamily: fonts.semibold, fontSize: 20, color: colors.ink },
  monthCompact: { marginLeft: 0, marginRight: -12 },
  monthTextCompact: { fontFamily: fonts.medium, fontSize: 14, color: colors.ink },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.soft,
    borderRadius: 999,
    padding: 3,
  },
  segItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 999,
  },
  segItemOn: {
    backgroundColor: colors.page,
    shadowColor: colors.ink,
    shadowOpacity: 0.08,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  segText: { fontFamily: fonts.medium, fontSize: 14, color: colors.muted },
  segTextOn: { color: colors.ink },
  badge: {
    backgroundColor: colors.pending,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  badgeText: { fontFamily: fonts.semibold, fontSize: 11, color: colors.page },
});
