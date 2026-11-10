import { Redirect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { MonthNav, Segment } from '@/components/nav';
import { TxRow } from '@/components/TxRow';
import { Transfers } from '@/components/Transfers';
import { useAuth } from '@/lib/auth';
import { useRefresh } from '@/lib/useRefresh';
import { currentMonth } from '@/lib/format';
import { getTransfers, listTransactions } from '@/lib/imports';
import type { TransactionPage, TransferOverview } from '@/lib/types';
import { colors, fonts } from '@/theme';

type Tab = 'lista' | 'transferencias';
const PAGE = 50;

// Transações, with transfers between the family's own accounts as a second tab (variant A).
export default function TransactionsScreen() {
  const { state } = useAuth();
  const params = useLocalSearchParams<{ aba?: string }>();
  const [tab, setTab] = useState<Tab>(params.aba === 'transferencias' ? 'transferencias' : 'lista');
  const [month, setMonth] = useState(currentMonth);
  // Keyed by month: refetching on focus keeps the current list on screen (no blink); only
  // a month change shows the loader.
  const [loaded, setLoaded] = useState<{ month: string; data: TransactionPage } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [transfersOf, setTransfersOf] = useState<{ month: string; data: TransferOverview } | null>(
    null,
  );
  const signedIn = state.status === 'signedIn';

  // The screen stays mounted between tabs, so a link from Início with ?aba= must switch
  // here; adjusting state while rendering is React's pattern for following a prop.
  const [seenAba, setSeenAba] = useState(params.aba);
  if (params.aba !== seenAba) {
    setSeenAba(params.aba);
    if (params.aba === 'transferencias') setTab('transferencias');
  }

  const loadTransfers = useCallback(
    () =>
      getTransfers(month).then(
        (data) => setTransfersOf({ month, data }),
        () => setTransfersOf(null),
      ),
    [month],
  );

  const load = useCallback(() => {
    listTransactions({ month, kinds: ['regular'], limit: PAGE }).then(
      (data) => setLoaded({ month, data }),
      () => setLoaded({ month, data: { total: 0, items: [] } }),
    );
    loadTransfers();
  }, [month, loadTransfers]);
  useRefresh(load, signedIn);

  if (state.status === 'loading') return <View style={styles.page} />;
  if (state.status === 'signedOut') return <Redirect href="/login" />;

  const page = loaded?.month === month ? loaded.data : null;
  const transfers = transfersOf?.month === month ? transfersOf.data : null;

  const loadMore = async () => {
    if (!page) return;
    setLoadingMore(true);
    try {
      const next = await listTransactions({
        month,
        kinds: ['regular'],
        limit: PAGE,
        offset: page.items.length,
      });
      setLoaded({ month, data: { total: next.total, items: [...page.items, ...next.items] } });
    } finally {
      setLoadingMore(false);
    }
  };

  const pendingCount = transfers?.pending.length ?? 0;

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.column}>
          <View style={styles.head}>
            <Text style={styles.title}>Transações</Text>
            <MonthNav month={month} onChange={setMonth} compact />
          </View>
          <Segment
            options={[
              { value: 'lista', label: 'Gastos e entradas' },
              { value: 'transferencias', label: 'Transferências', badge: pendingCount },
            ]}
            value={tab}
            onChange={setTab}
          />

          {tab === 'lista' ? (
            !page ? (
              <ActivityIndicator color={colors.muted} style={styles.loading} />
            ) : page.items.length === 0 ? (
              <Text style={[styles.empty, styles.top]}>Nenhum gasto ou entrada neste mês.</Text>
            ) : (
              <View style={styles.top}>
                {page.items.map((t, i) => (
                  <TxRow key={t.id} t={t} first={i === 0} />
                ))}
                {page.total > page.items.length ? (
                  <Pressable
                    onPress={loadMore}
                    disabled={loadingMore}
                    accessibilityRole="button"
                    style={styles.more}
                  >
                    {loadingMore ? (
                      <ActivityIndicator color={colors.muted} />
                    ) : (
                      <Text style={styles.moreText}>
                        Mostrar mais ({page.total - page.items.length})
                      </Text>
                    )}
                  </Pressable>
                ) : null}
              </View>
            )
          ) : !transfers ? (
            <ActivityIndicator color={colors.muted} style={styles.loading} />
          ) : (
            <Transfers data={transfers} month={month} onChanged={loadTransfers} />
          )}
        </View>
      </ScrollView>
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
  top: { marginTop: 16 },
  empty: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: colors.muted },
  more: { paddingVertical: 14, alignItems: 'center' },
  moreText: { fontFamily: fonts.medium, fontSize: 14, color: colors.ink },
});
