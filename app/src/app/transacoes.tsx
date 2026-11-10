import { Redirect, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { MonthNav, Segment, TabBar } from '@/components/nav';
import { TxRow } from '@/components/TxRow';
import { SectionTitle } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { currentMonth, dayMonth, isIncome, money, monthLabel } from '@/lib/format';
import { getTransfers, listTransactions, setKind } from '@/lib/imports';
import type { Transaction, TransactionPage, Transfer, TransferOverview, TxKind } from '@/lib/types';
import { colors, fonts } from '@/theme';

type Tab = 'lista' | 'transferencias';
const PAGE = 50;

// Transações, with transfers between the family's own accounts as a second tab (variant A).
export default function TransactionsScreen() {
  const { state } = useAuth();
  const params = useLocalSearchParams<{ aba?: string }>();
  const [tab, setTab] = useState<Tab>(params.aba === 'transferencias' ? 'transferencias' : 'lista');
  const [month, setMonth] = useState(currentMonth);
  const [page, setPage] = useState<TransactionPage | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [transfers, setTransfers] = useState<TransferOverview | null>(null);
  const signedIn = state.status === 'signedIn';

  const loadTransfers = useCallback(
    () => getTransfers(month).then(setTransfers, () => setTransfers(null)),
    [month],
  );

  useFocusEffect(
    useCallback(() => {
      if (!signedIn) return;
      setPage(null);
      listTransactions({ month, kinds: ['regular'], limit: PAGE }).then(setPage, () =>
        setPage({ total: 0, items: [] }),
      );
      loadTransfers();
    }, [signedIn, month, loadTransfers]),
  );

  if (state.status === 'loading') return <View style={styles.page} />;
  if (state.status === 'signedOut') return <Redirect href="/login" />;

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
      setPage({ total: next.total, items: [...page.items, ...next.items] });
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
      <TabBar />
    </View>
  );
}

function Transfers({
  data,
  month,
  onChanged,
}: {
  data: TransferOverview;
  month: string;
  onChanged: () => void;
}) {
  return (
    <View>
      <Text style={[styles.empty, styles.top]}>
        Dinheiro entre contas suas. Não conta como gasto nem como entrada.
      </Text>

      {data.pending.length ? (
        <>
          <Text style={styles.pendingTitle}>AGUARDANDO CONFIRMAR</Text>
          <View style={styles.cards}>
            {data.pending.map((t) => (
              <PendingCard key={t.id} t={t} onDone={onChanged} />
            ))}
          </View>
        </>
      ) : null}

      <SectionTitle>Confirmadas em {monthLabel(month).split(' ')[0].toLowerCase()}</SectionTitle>
      {data.confirmed.length === 0 ? (
        <Text style={styles.empty}>Nenhuma transferência neste mês.</Text>
      ) : (
        data.confirmed.map((t, i) => <TransferRow key={t.id} t={t} first={i === 0} />)
      )}
    </View>
  );
}

function PendingCard({ t, onDone }: { t: Transaction; onDone: () => void }) {
  const [busy, setBusy] = useState<TxKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const incoming = isIncome(t.amount);

  const answer = async (kind: Exclude<TxKind, 'pending'>) => {
    setBusy(kind);
    setError(null);
    try {
      await setKind(t.id, kind);
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Algo deu errado. Tente de novo.');
      setBusy(null);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={styles.main}>
          <Text style={styles.rowTitle} numberOfLines={2}>
            {t.description}
          </Text>
          <Text style={styles.rowSub}>
            {incoming ? 'Entrou no' : 'Saiu do'} {t.account_name} · {dayMonth(t.date)} · não
            achamos o outro lado
          </Text>
        </View>
        <Text style={styles.rowValue}>{money(t.amount.replace('-', ''), t.currency)}</Text>
      </View>
      <View style={styles.actions}>
        <ActionButton
          label="É entre minhas contas"
          primary
          busy={busy === 'transfer'}
          disabled={busy !== null}
          onPress={() => answer('transfer')}
        />
        <ActionButton
          label={incoming ? 'Foi uma entrada' : 'Foi um gasto'}
          busy={busy === 'regular'}
          disabled={busy !== null}
          onPress={() => answer('regular')}
        />
      </View>
      <Pressable
        onPress={() => answer('investment')}
        disabled={busy !== null}
        accessibilityRole="button"
        style={styles.link}
      >
        <Text style={styles.linkText}>{incoming ? 'Foi um resgate' : 'Foi um investimento'}</Text>
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function ActionButton({
  label,
  onPress,
  primary,
  busy,
  disabled,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  busy?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={[styles.action, primary && styles.actionPrimary, disabled && !busy && styles.off]}
    >
      {busy ? (
        <ActivityIndicator color={primary ? colors.page : colors.ink} />
      ) : (
        <Text style={[styles.actionText, primary && styles.actionTextPrimary]}>{label}</Text>
      )}
    </Pressable>
  );
}

function TransferRow({ t, first }: { t: Transfer; first: boolean }) {
  const from = t.from_account ?? 'outra conta';
  const to = t.to_account ?? 'outra conta';
  const sub =
    t.kind === 'exchange'
      ? `Câmbio · ${dayMonth(t.date)}`
      : t.kind === 'pair'
        ? `${dayMonth(t.date)} · as duas pontas encontradas`
        : `${dayMonth(t.date)} · ${t.description}`;
  return (
    <View style={[styles.row, first && styles.first]}>
      <View style={styles.main}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {from} → {to}
        </Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {sub}
        </Text>
      </View>
      <View style={styles.right}>
        <Text style={styles.rowValue}>{money(t.amount, t.currency)}</Text>
        {t.to_amount && t.to_currency ? (
          <Text style={styles.rowSub}>{money(t.to_amount, t.to_currency)}</Text>
        ) : null}
      </View>
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
  pendingTitle: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    letterSpacing: 0.7,
    color: colors.pendingText,
    marginTop: 24,
    marginBottom: 10,
  },
  cards: { gap: 10 },
  card: {
    borderWidth: 1,
    borderColor: colors.pendingLine,
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  cardHead: { flexDirection: 'row', gap: 12 },
  actions: { flexDirection: 'row', gap: 8 },
  action: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  actionPrimary: { backgroundColor: colors.ink, borderColor: colors.ink },
  actionText: { fontFamily: fonts.medium, fontSize: 13, color: colors.ink, textAlign: 'center' },
  actionTextPrimary: { color: colors.page },
  off: { opacity: 0.4 },
  link: { alignSelf: 'flex-start', paddingVertical: 4, marginTop: -4 },
  linkText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.muted,
    textDecorationLine: 'underline',
  },
  error: { fontFamily: fonts.regular, fontSize: 13, color: colors.danger },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  first: { borderTopWidth: 0 },
  main: { flex: 1, minWidth: 0, gap: 3 },
  right: { alignItems: 'flex-end', gap: 3 },
  rowTitle: { fontFamily: fonts.regular, fontSize: 15, color: colors.ink },
  rowSub: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted },
  rowValue: { fontFamily: fonts.regular, fontSize: 15, color: colors.ink },
});
