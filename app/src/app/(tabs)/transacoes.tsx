import { Redirect, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { MonthNav, Segment } from '@/components/nav';
import { TxRow } from '@/components/TxRow';
import { Transfers } from '@/components/Transfers';
import { useAuth } from '@/lib/auth';
import { currentMonth } from '@/lib/format';
import { useRefreshMoney, useRegular, useTransfers } from '@/lib/queries';
import { colors, fonts } from '@/theme';

type Tab = 'lista' | 'transferencias';

// Transações, with transfers between the family's own accounts as a second tab (variant A).
export default function TransactionsScreen() {
  const { state } = useAuth();
  const params = useLocalSearchParams<{ aba?: string }>();
  const [tab, setTab] = useState<Tab>(params.aba === 'transferencias' ? 'transferencias' : 'lista');
  const [month, setMonth] = useState(currentMonth);
  const signedIn = state.status === 'signedIn';
  const regular = useRegular(month, signedIn);
  const transfersQuery = useTransfers(month, signedIn);
  const refreshMoney = useRefreshMoney();

  // The screen stays mounted between tabs, so a link from Início with ?aba= must switch
  // here; adjusting state while rendering is React's pattern for following a prop.
  const [seenAba, setSeenAba] = useState(params.aba);
  if (params.aba !== seenAba) {
    setSeenAba(params.aba);
    if (params.aba === 'transferencias') setTab('transferencias');
  }

  if (state.status === 'loading') return <View style={styles.page} />;
  if (state.status === 'signedOut') return <Redirect href="/login" />;

  const items = regular.data?.pages.flatMap((p) => p.items) ?? null;
  const total = regular.data?.pages[regular.data.pages.length - 1].total ?? 0;
  const transfers = transfersQuery.data ?? null;

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
            regular.isError ? (
              <Text style={[styles.empty, styles.top]}>Não consegui carregar. Tente de novo.</Text>
            ) : !items ? (
              <ActivityIndicator color={colors.muted} style={styles.loading} />
            ) : items.length === 0 ? (
              <Text style={[styles.empty, styles.top]}>Nenhum gasto ou entrada neste mês.</Text>
            ) : (
              <View style={styles.top}>
                {items.map((t, i) => (
                  <TxRow key={t.id} t={t} first={i === 0} />
                ))}
                {regular.hasNextPage ? (
                  <Pressable
                    onPress={() => regular.fetchNextPage()}
                    disabled={regular.isFetchingNextPage}
                    accessibilityRole="button"
                    style={styles.more}
                  >
                    {regular.isFetchingNextPage ? (
                      <ActivityIndicator color={colors.muted} />
                    ) : (
                      <Text style={styles.moreText}>Mostrar mais ({total - items.length})</Text>
                    )}
                  </Pressable>
                ) : null}
              </View>
            )
          ) : transfersQuery.isError ? (
            <Text style={[styles.empty, styles.top]}>Não consegui carregar. Tente de novo.</Text>
          ) : !transfers ? (
            <ActivityIndicator color={colors.muted} style={styles.loading} />
          ) : (
            <Transfers data={transfers} month={month} onChanged={refreshMoney} />
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
