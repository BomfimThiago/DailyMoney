import { router, usePathname } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Logo } from '@/components/Logo';
import { useAuth } from '@/lib/auth';
import { SIDEBAR_WIDTH } from '@/lib/dashboard';
import { currentMonth, initials, monthLabel, shiftMonth, shortMonth } from '@/lib/format';
import { useSummary } from '@/lib/queries';
import { colors, fonts } from '@/theme';

const TABS = [
  { href: '/', label: 'Início' },
  { href: '/investimentos', label: 'Investimentos' },
  { href: '/transacoes', label: 'Transações' },
] as const;

// Getting money data in: separate pages, below the three main ones in the sidebar.
const DATA_PAGES = [
  { href: '/upload', label: 'Enviar extrato' },
  { href: '/conexoes', label: 'Conexões' },
] as const;

export function TabBar() {
  const path = usePathname();
  return (
    <View style={styles.bar} accessibilityRole="tablist">
      <View style={styles.tabs}>
        {TABS.map((t) => {
          const on = isOn(t.href, path);
          return (
            <Pressable
              key={t.href}
              onPress={() => router.navigate(t.href)}
              testID={`tab-${t.label}`}
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

function isOn(href: string, path: string): boolean {
  return href === '/' ? path === '/' : path.startsWith(href);
}

// Computer layout: the old web's sidebar (mark, sections, send a statement, the person).
export function SideBar() {
  const path = usePathname();
  const { state, signOut } = useAuth();
  const signedIn = state.status === 'signedIn';
  const summary = useSummary(currentMonth(), signedIn);
  if (!signedIn) return null;
  const pending = summary.data?.pending_transfers ?? 0;
  const me = state.me;
  return (
    <View style={styles.side} accessibilityRole="navigation">
      <Pressable
        onPress={() => router.navigate('/')}
        accessibilityRole="link"
        accessibilityLabel="Daily Money, início"
        style={styles.brand}
      >
        <Logo />
        <Text style={styles.brandText}>Daily Money</Text>
      </Pressable>
      <View style={styles.sideLinks}>
        {TABS.map((t) => (
          <SideLink
            key={t.href}
            label={t.label}
            href={t.href}
            on={isOn(t.href, path)}
            badge={t.href === '/transacoes' ? pending : 0}
          />
        ))}
        <Text style={styles.sideGroup}>DADOS</Text>
        {DATA_PAGES.map((t) => (
          <SideLink key={t.href} label={t.label} href={t.href} on={isOn(t.href, path)} />
        ))}
      </View>
      <View style={styles.me}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(me.name).slice(0, 1)}</Text>
        </View>
        <View style={styles.meText}>
          <Text style={styles.meName} numberOfLines={1}>
            {me.name}
          </Text>
          <Text style={styles.meSub} numberOfLines={1}>
            {me.family.name}
          </Text>
        </View>
        <Pressable onPress={signOut} accessibilityRole="button" style={styles.out}>
          <Text style={styles.outText}>Sair</Text>
        </Pressable>
      </View>
    </View>
  );
}

function SideLink({
  label,
  href,
  on,
  badge = 0,
}: {
  label: string;
  href: string;
  on: boolean;
  badge?: number;
}) {
  return (
    <Pressable
      onPress={() => router.navigate(href as never)}
      testID={`tab-${label}`}
      accessibilityRole="link"
      accessibilityState={{ selected: on }}
      style={[styles.sideLink, on && styles.sideLinkOn]}
    >
      <Text style={[styles.sideText, on && styles.sideTextOn]}>{label}</Text>
      {badge > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

// A page outside the tabs (upload, connections): on a computer it keeps the sidebar.
export function WithSideBar({ wide, children }: { wide: boolean; children: ReactNode }) {
  if (!wide) return <>{children}</>;
  return (
    <View style={styles.shell}>
      <SideBar />
      <View style={styles.shellMain}>{children}</View>
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
            testID={`segment-${o.value}`}
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
  side: {
    width: SIDEBAR_WIDTH,
    borderRightWidth: 1,
    borderRightColor: colors.line,
    backgroundColor: colors.page,
    paddingHorizontal: 14,
    paddingTop: 24,
    paddingBottom: 16,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10 },
  brandText: { fontFamily: fonts.semibold, fontSize: 16, color: colors.ink },
  sideLinks: { flex: 1, marginTop: 28, gap: 2 },
  sideLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 36,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  sideLinkOn: { backgroundColor: colors.soft },
  sideText: { fontFamily: fonts.regular, fontSize: 14, color: colors.muted },
  sideTextOn: { fontFamily: fonts.medium, color: colors.ink },
  sideGroup: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    letterSpacing: 0.7,
    color: colors.muted,
    paddingHorizontal: 10,
    marginTop: 22,
    marginBottom: 6,
  },
  shell: { flex: 1, flexDirection: 'row', backgroundColor: colors.page },
  shellMain: { flex: 1 },
  me: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 6 },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.ink },
  meText: { flex: 1, minWidth: 0 },
  meName: { fontFamily: fonts.medium, fontSize: 13, color: colors.ink },
  meSub: { fontFamily: fonts.regular, fontSize: 11, color: colors.muted },
  out: { paddingVertical: 6, paddingHorizontal: 4 },
  outText: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted },
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
