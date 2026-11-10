import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { SectionTitle } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { dayMonth, isIncome, money, monthLabel } from '@/lib/format';
import { setKind } from '@/lib/imports';
import type { Transaction, Transfer, TransferOverview, TxKind } from '@/lib/types';
import { colors, fonts } from '@/theme';

// Transações > Transferências: lines waiting for the person to say what they were, then the
// month's confirmed moves between the family's own accounts.
export function Transfers({
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
            {incoming ? 'Entrou no' : 'Saiu do'} {t.account_name} · {dayMonth(t.date)} · não achamos
            o outro lado
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
  top: { marginTop: 16 },
  empty: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: colors.muted },
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
