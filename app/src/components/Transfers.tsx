import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { errorText } from '@/lib/api';
import { dayMonth, isIncome, money } from '@/lib/format';
import { setKind } from '@/lib/imports';
import type { Transaction, TransferOverview, TxKind } from '@/lib/types';
import { colors, fonts } from '@/theme';

// Shown above the list while "Transferências internas" is on: the lines that look like
// money between the family's own accounts but whose other side wasn't found, each with
// buttons to say what it was. The confirmed ones are in the list itself.
export function Transfers({ data, onChanged }: { data: TransferOverview; onChanged: () => void }) {
  if (!data.pending.length) return null;
  return (
    <View style={styles.box}>
      <Text style={styles.pendingTitle}>AGUARDANDO CONFIRMAR</Text>
      <View style={styles.cards}>
        {data.pending.map((t) => (
          <PendingCard key={t.id} t={t} onDone={onChanged} />
        ))}
      </View>
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
      setError(errorText(e));
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

const styles = StyleSheet.create({
  box: { marginBottom: 16 },
  pendingTitle: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    letterSpacing: 0.7,
    color: colors.pendingText,
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
  main: { flex: 1, minWidth: 0, gap: 3 },
  rowTitle: { fontFamily: fonts.regular, fontSize: 15, color: colors.ink },
  rowSub: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted },
  rowValue: { fontFamily: fonts.regular, fontSize: 15, color: colors.ink },
});
