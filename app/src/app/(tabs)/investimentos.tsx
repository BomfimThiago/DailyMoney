import { Redirect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { MonthNav, Segment } from '@/components/nav';
import { TxRow } from '@/components/TxRow';
import { Chip, SectionTitle } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useRefresh } from '@/lib/useRefresh';
import { currentMonth, isZero, money, monthLabel, shortMonth } from '@/lib/format';
import { getInvestments } from '@/lib/imports';
import type { Currency, InvestmentOverview } from '@/lib/types';
import { colors, fonts } from '@/theme';

type View_ = 'produtos' | 'movimentos';

// Investimentos, variant A (by product) with variant B's movements as a second view.
export default function InvestmentsScreen() {
  const { state } = useAuth();
  const [month, setMonth] = useState(currentMonth);
  const [view, setView] = useState<View_>('produtos');
  const [currency, setCurrency] = useState<Currency | null>(null);
  // Keyed by month so a refetch on focus keeps the screen as is, without a loader blink.
  const [loaded, setLoaded] = useState<{ month: string; data: InvestmentOverview } | null>(null);
  const [failed, setFailed] = useState(false);
  const signedIn = state.status === 'signedIn';

  const load = useCallback(() => {
    setFailed(false);
    getInvestments(month).then(
      (data) => setLoaded({ month, data }),
      () => setFailed(true),
    );
  }, [month]);
  useRefresh(load, signedIn);

  if (state.status === 'loading') return <View style={styles.page} />;
  if (state.status === 'signedOut') return <Redirect href="/login" />;

  const data = loaded?.month === month ? loaded.data : null;
  const cur =
    data?.totals.find((t) => t.currency === currency)?.currency ?? data?.totals[0]?.currency;
  const total = data?.totals.find((t) => t.currency === cur);
  const history = data?.history.filter((h) => h.currency === cur) ?? [];
  const thisMonth = history[history.length - 1];
  const products = data?.products.filter((p) => p.currency === cur) ?? [];
  const movements = data?.movements.filter((m) => m.currency === cur) ?? [];
  const monthName = monthLabel(month).split(' ')[0].toLowerCase();

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.column}>
          <View style={styles.head}>
            <Text style={styles.title}>Investimentos</Text>
            <MonthNav month={month} onChange={setMonth} compact />
          </View>

          {failed ? (
            <Text style={styles.empty}>Não consegui carregar. Tente de novo.</Text>
          ) : !data ? (
            <ActivityIndicator color={colors.muted} style={styles.loading} />
          ) : !total || !cur ? (
            <Text style={styles.empty}>
              Nenhuma aplicação ou resgate nos extratos enviados até agora.
            </Text>
          ) : (
            <>
              {data.totals.length > 1 ? (
                <View style={styles.chips} accessibilityRole="radiogroup">
                  {data.totals.map((t) => (
                    <Chip
                      key={t.currency}
                      label={t.currency}
                      selected={t.currency === cur}
                      onPress={() => setCurrency(t.currency)}
                    />
                  ))}
                </View>
              ) : null}

              <Segment
                options={[
                  { value: 'produtos', label: 'Produtos' },
                  { value: 'movimentos', label: 'Movimentos' },
                ]}
                value={view}
                onChange={setView}
              />

              {view === 'produtos' ? (
                <>
                  <View style={styles.hero}>
                    <Text style={styles.heroLabel}>
                      Aplicado no total, desde o primeiro extrato
                    </Text>
                    <Text style={styles.heroValue}>{money(total.net, cur)}</Text>
                    {thisMonth && !(isZero(thisMonth.put_in) && isZero(thisMonth.taken_out)) ? (
                      <Text style={styles.heroSub}>
                        Em {monthName}:{' '}
                        <Text style={styles.invest}>{money(thisMonth.net, cur, true)}</Text> (
                        {money(thisMonth.put_in, cur)} aplicado, {money(thisMonth.taken_out, cur)}{' '}
                        resgatado)
                      </Text>
                    ) : (
                      <Text style={styles.heroSub}>Nenhum movimento em {monthName}.</Text>
                    )}
                  </View>

                  <SectionTitle>Seus produtos</SectionTitle>
                  <View>
                    {products.map((p, i) => (
                      <View
                        key={`${p.account_id}-${p.name}`}
                        style={[styles.row, i === 0 && styles.first]}
                      >
                        <View style={styles.main}>
                          <Text style={styles.rowTitle} numberOfLines={1}>
                            {p.name}
                          </Text>
                          <Text style={styles.rowSub}>{p.account_name}</Text>
                        </View>
                        <View style={styles.right}>
                          <Text style={styles.rowValue}>{money(p.net, p.currency)}</Text>
                          <Text style={[styles.rowSub, !isZero(p.month_net) && styles.invest]}>
                            {isZero(p.month_net)
                              ? 'sem movimento no mês'
                              : `${money(p.month_net, p.currency, true)} no mês`}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>

                  <View style={styles.note}>
                    <Text style={styles.noteText}>
                      Por enquanto mostramos quanto você colocou e tirou, lido dos extratos. Saldo
                      atual e rendimento aparecem quando o banco estiver conectado.
                    </Text>
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.chartLabel}>
                    Investido por mês (aplicado menos resgatado)
                  </Text>
                  <Bars history={history} month={month} />
                  {thisMonth ? (
                    <View style={styles.trio}>
                      <Stat label="Aplicado" value={money(thisMonth.put_in, cur)} />
                      <Stat label="Resgatado" value={money(thisMonth.taken_out, cur)} />
                      <Stat label="Investido" value={money(thisMonth.net, cur)} tone />
                    </View>
                  ) : null}
                  <SectionTitle>{monthLabel(month)}</SectionTitle>
                  {movements.length === 0 ? (
                    <Text style={styles.empty}>Nenhuma aplicação ou resgate neste mês.</Text>
                  ) : (
                    movements.map((t, i) => <TxRow key={t.id} t={t} first={i === 0} />)
                  )}
                </>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function Bars({ history, month }: { history: InvestmentOverview['history']; month: string }) {
  // Display only: bar heights relative to the largest month.
  const values = history.map((h) => Math.max(Number(h.net), 0));
  const max = Math.max(...values, 1);
  return (
    <View
      style={styles.bars}
      accessibilityRole="image"
      accessibilityLabel={history
        .map((h) => `${shortMonth(h.month)} ${money(h.net, h.currency)}`)
        .join(', ')}
    >
      {history.map((h, i) => (
        <View key={h.month} style={styles.barCol}>
          <View
            style={[
              styles.bar,
              { height: Math.max(4, (values[i] / max) * 80) },
              h.month === month && styles.barOn,
            ]}
          />
          <Text style={[styles.barText, h.month === month && styles.barTextOn]}>
            {shortMonth(h.month)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: boolean }) {
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

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.page },
  content: { paddingHorizontal: 16, paddingTop: 24, paddingBottom: 40, alignItems: 'center' },
  column: { width: '100%', maxWidth: 520 },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: { fontFamily: fonts.semibold, fontSize: 20, color: colors.ink },
  loading: { marginVertical: 32 },
  chips: { flexDirection: 'row', gap: 6, marginBottom: 14 },
  hero: { marginTop: 22, gap: 6 },
  heroLabel: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
  heroValue: { fontFamily: fonts.regular, fontSize: 34, color: colors.ink },
  heroSub: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: colors.muted },
  invest: { color: colors.invest },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  first: { borderTopWidth: 0 },
  main: { flex: 1, minWidth: 0, gap: 3 },
  right: { alignItems: 'flex-end', gap: 3 },
  rowTitle: { fontFamily: fonts.regular, fontSize: 15, color: colors.ink },
  rowSub: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted },
  rowValue: { fontFamily: fonts.regular, fontSize: 15, color: colors.ink },
  note: { marginTop: 24, padding: 14, borderRadius: 12, backgroundColor: colors.soft },
  noteText: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: colors.ink },
  chartLabel: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted, marginTop: 22 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, height: 104, marginTop: 12 },
  barCol: { flex: 1, alignItems: 'center', gap: 6 },
  bar: { width: '100%', borderRadius: 4, backgroundColor: colors.investSoft },
  barOn: { backgroundColor: colors.invest },
  barText: { fontFamily: fonts.regular, fontSize: 11, color: colors.muted },
  barTextOn: { fontFamily: fonts.semibold, color: colors.ink },
  trio: {
    flexDirection: 'row',
    marginTop: 18,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.line,
  },
  stat: { flex: 1, paddingVertical: 12, gap: 4 },
  statLabel: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted },
  statValue: { fontFamily: fonts.regular, fontSize: 16, color: colors.ink },
  empty: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: colors.muted },
});
