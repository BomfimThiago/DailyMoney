import { Redirect, router } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { MonthNav } from '@/components/nav';
import { TxRow } from '@/components/TxRow';
import { Button, Chip, SectionTitle } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useRefresh } from '@/lib/useRefresh';
import { currentMonth, money, plain } from '@/lib/format';
import { getSummary, listTransactions } from '@/lib/imports';
import type { Currency, MonthSummary, TransactionPage } from '@/lib/types';
import { colors, fonts } from '@/theme';

// Início, variant A from the validated mock: Entradas · Gastos · Investido for the month.
export default function HomeScreen() {
  const { state, signOut } = useAuth();
  const [month, setMonth] = useState(currentMonth);
  const [currency, setCurrency] = useState<Currency | null>(null);
  // Keyed by month so a refetch on focus keeps the screen as is, without a loader blink.
  const [summaryOf, setSummaryOf] = useState<{ month: string; data: MonthSummary } | null>(null);
  const [pageOf, setPageOf] = useState<{ month: string; data: TransactionPage } | null>(null);
  const signedIn = state.status === 'signedIn';

  const load = useCallback(() => {
    getSummary(month).then(
      (data) => setSummaryOf({ month, data }),
      () => setSummaryOf(null),
    );
    listTransactions({ month, limit: 8 }).then(
      (data) => setPageOf({ month, data }),
      () => setPageOf({ month, data: { total: 0, items: [] } }),
    );
  }, [month]);
  useRefresh(load, signedIn);

  if (state.status === 'loading') {
    return (
      <View style={[styles.page, styles.center]}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }
  if (state.status === 'signedOut') return <Redirect href="/login" />;

  const summary = summaryOf?.month === month ? summaryOf.data : null;
  const page = pageOf?.month === month ? pageOf.data : null;
  const shown =
    summary?.currencies.find((c) => c.currency === currency) ?? summary?.currencies[0] ?? null;
  const noAccounts = summary !== null && summary.currencies.length === 0;

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.column}>
          <View style={styles.head}>
            <MonthNav month={month} onChange={setMonth} />
            {summary && summary.currencies.length > 1 ? (
              <View style={styles.chips} accessibilityRole="radiogroup">
                {summary.currencies.map((c) => (
                  <Chip
                    key={c.currency}
                    label={c.currency}
                    selected={c.currency === shown?.currency}
                    onPress={() => setCurrency(c.currency)}
                  />
                ))}
              </View>
            ) : null}
          </View>

          {!summary ? (
            <ActivityIndicator color={colors.muted} style={styles.loading} />
          ) : noAccounts ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>Olá, {state.me.name.split(' ')[0]}</Text>
              <Text style={styles.empty}>
                Envie o extrato de uma conta ou cartão para ver para onde vai o seu dinheiro.
              </Text>
              <Button primary label="Enviar extrato" onPress={() => router.push('/upload')} />
            </View>
          ) : shown ? (
            <>
              <View style={styles.numbers}>
                <Figure label="Entradas" value={plain(shown.income)} tone="income" />
                <Figure label="Gastos" value={plain(shown.spending)} divider />
                <Figure label="Investido" value={plain(shown.invested)} tone="invest" divider />
              </View>
              <View style={styles.left}>
                <Text style={styles.leftLabel}>Sobrou no mês</Text>
                <Text style={styles.leftValue}>{money(shown.left, shown.currency)}</Text>
              </View>
              {summary.currencies.length > 1 ? (
                <Text style={styles.hint}>
                  Só contas em {shown.currency}. A conversão entre moedas vem depois.
                </Text>
              ) : null}
            </>
          ) : null}

          {summary && summary.pending_transfers > 0 ? (
            <Pressable
              onPress={() =>
                router.navigate({ pathname: '/transacoes', params: { aba: 'transferencias' } })
              }
              accessibilityRole="link"
              style={styles.pending}
            >
              <View style={styles.pendingDot} />
              <Text style={styles.pendingText}>
                {summary.pending_transfers === 1
                  ? '1 transferência para confirmar'
                  : `${summary.pending_transfers} transferências para confirmar`}
              </Text>
              <Text style={styles.pendingLink}>Ver</Text>
            </Pressable>
          ) : null}

          {!noAccounts ? (
            <>
              <SectionTitle>Últimos movimentos</SectionTitle>
              {!page ? (
                <ActivityIndicator color={colors.muted} />
              ) : page.items.length === 0 ? (
                <Text style={styles.empty}>Nenhum movimento neste mês.</Text>
              ) : (
                <View>
                  {page.items.map((t, i) => (
                    <TxRow key={t.id} t={t} first={i === 0} />
                  ))}
                  {page.total > page.items.length ? (
                    <Pressable
                      onPress={() => router.navigate('/transacoes')}
                      accessibilityRole="link"
                      style={styles.more}
                    >
                      <Text style={styles.moreText}>Ver todas as {page.total}</Text>
                    </Pressable>
                  ) : null}
                </View>
              )}
              <Button
                label="Enviar extrato"
                onPress={() => router.push('/upload')}
                style={styles.upload}
              />
            </>
          ) : null}

          <Pressable onPress={signOut} style={styles.signOut} accessibilityRole="button">
            <Text style={styles.signOutText}>Sair</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function Figure({
  label,
  value,
  tone,
  divider,
}: {
  label: string;
  value: string;
  tone?: 'income' | 'invest';
  divider?: boolean;
}) {
  return (
    <View style={[styles.figure, divider && styles.divider]}>
      <Text style={styles.figureLabel}>{label.toUpperCase()}</Text>
      <Text
        style={[
          styles.figureValue,
          tone === 'income' && { color: colors.positive },
          tone === 'invest' && { color: colors.invest },
        ]}
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
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 16, paddingTop: 24, paddingBottom: 40, alignItems: 'center' },
  column: { width: '100%', maxWidth: 520 },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  chips: { flexDirection: 'row', gap: 6 },
  loading: { marginVertical: 32 },
  numbers: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
  },
  figure: { flex: 1, paddingVertical: 16, paddingHorizontal: 14, gap: 6 },
  divider: { borderLeftWidth: 1, borderLeftColor: colors.line },
  figureLabel: { fontFamily: fonts.medium, fontSize: 11, letterSpacing: 0.7, color: colors.muted },
  figureValue: { fontFamily: fonts.regular, fontSize: 22, color: colors.ink },
  left: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingHorizontal: 2,
  },
  leftLabel: { fontFamily: fonts.regular, fontSize: 14, color: colors.muted },
  leftValue: { fontFamily: fonts.medium, fontSize: 14, color: colors.ink },
  hint: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted, marginTop: 8 },
  pending: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 20,
    paddingHorizontal: 16,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: colors.pendingSoft,
  },
  pendingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.pending },
  pendingText: { flex: 1, fontFamily: fonts.regular, fontSize: 14, color: colors.ink },
  pendingLink: { fontFamily: fonts.medium, fontSize: 14, color: colors.pendingText },
  more: { paddingVertical: 12 },
  moreText: { fontFamily: fonts.medium, fontSize: 14, color: colors.ink },
  upload: { marginTop: 24 },
  emptyBox: { gap: 12, marginTop: 8 },
  emptyTitle: { fontFamily: fonts.semibold, fontSize: 22, color: colors.ink },
  empty: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: colors.muted },
  signOut: { marginTop: 32, alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 16 },
  signOutText: { fontFamily: fonts.medium, fontSize: 14, color: colors.muted },
});
