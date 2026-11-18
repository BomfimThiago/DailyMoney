import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Small } from '@/components/transactions/Review';
import { DeleteConfirm, TxEditForm } from '@/components/transactions/TxEditForm';
import { errorText } from '@/lib/api';
import { fullDate, isIncome, money } from '@/lib/format';
import { decideReview, deleteTransaction } from '@/lib/imports';
import { useLineCurrencies } from '@/lib/queries';
import { lineAmounts } from '@/lib/transactions';
import type { Transaction } from '@/lib/types';
import { colors, fonts } from '@/theme';

// One line of spending or income: the summary on top and, right below, the fields to
// change it and the way to delete it. All in one place, no extra Editar step.
// Side panel on a computer, sheet on a phone.
export function TxDetail({ t, onChanged }: { t: Transaction; onChanged: () => void }) {
  const [deleting, setDeleting] = useState(false);
  const incoming = isIncome(t.amount);
  const amount = lineAmounts(t);

  return (
    <View style={styles.box}>
      <Text style={styles.title}>{t.description}</Text>
      <Text style={[styles.amount, incoming && styles.income]}>{amount.shown}</Text>
      {amount.original ? (
        <Text style={styles.original}>
          {amount.original} no extrato, convertido pela cotação do Banco Central Europeu do dia
        </Text>
      ) : null}
      <View style={styles.facts}>
        <Fact label="Data" value={fullDate(t.date)} />
        <Fact label="Conta" value={`${t.account_name} · ${t.currency}`} />
      </View>
      <InCurrencies t={t} />
      {t.review === 'pending' ? <Waiting t={t} onDone={onChanged} /> : null}

      <View style={styles.rule} />
      <TxEditForm t={t} onSaved={onChanged} />

      <View style={styles.rule} />
      {deleting ? (
        <Deleting t={t} onDone={onChanged} onCancel={() => setDeleting(false)} />
      ) : (
        <Pressable
          onPress={() => setDeleting(true)}
          accessibilityRole="button"
          accessibilityLabel="Excluir"
          hitSlop={6}
          style={styles.deleteLink}
        >
          <Text style={styles.linkDanger}>Excluir transação</Text>
        </Pressable>
      )}
    </View>
  );
}

// The line in reais, euros and dollars, each with the ECB rate of its day, like the old
// app's detail. A failed answer just leaves the block out: the rest of the detail stands.
function InCurrencies({ t }: { t: Transaction }) {
  const { data } = useLineCurrencies(t.id);
  if (!data) return null;
  return (
    <View style={styles.currencies} accessibilityLabel="Nas três moedas">
      <Text style={styles.currenciesLabel}>NAS TRÊS MOEDAS</Text>
      {data.amounts.map((a) => (
        <View key={a.currency} style={styles.currencyRow}>
          <Text style={styles.currencyAmount}>{money(a.amount, a.currency, true)}</Text>
          <Text style={styles.currencyRate}>
            {a.currency === data.currency
              ? 'no extrato'
              : `1 ${data.currency} = ${rateText(a.rate)} ${a.currency}`}
          </Text>
        </View>
      ))}
      {data.rate_date ? (
        <Text style={styles.currencyRate}>
          Cotação do Banco Central Europeu de {fullDate(data.rate_date)}
        </Text>
      ) : null}
    </View>
  );
}

// "0.16666667" → "0,1667", "0.20000000" → "0,20": four places are enough to read a rate.
// Only shown, never used in a sum, so rounding it through a number is fine.
function rateText(rate: string): string {
  const [whole, places = ''] = Number(rate).toFixed(4).split('.');
  return `${whole},${places.replace(/0+$/, '').padEnd(2, '0')}`;
}

// Just imported: it counts only once the person approves it.
function Waiting({ t, onDone }: { t: Transaction; onDone: () => void }) {
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const decide = async (decision: 'approve' | 'reject') => {
    setBusy(decision);
    setError(null);
    try {
      await decideReview([t.id], decision);
      onDone();
    } catch (e) {
      setError(errorText(e));
      setBusy(null);
    }
  };
  return (
    <View style={styles.waiting}>
      <Text style={styles.waitingText}>Importada, esperando sua aprovação para contar.</Text>
      <View style={styles.waitingActions}>
        <Small
          label="Rejeitar"
          busy={busy === 'reject'}
          disabled={busy !== null}
          onPress={() => decide('reject')}
        />
        <Small
          label="Aprovar"
          primary
          busy={busy === 'approve'}
          disabled={busy !== null}
          onPress={() => decide('approve')}
        />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function Deleting({
  t,
  onDone,
  onCancel,
}: {
  t: Transaction;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteTransaction(t.id);
      onDone();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };
  return <DeleteConfirm busy={busy} error={error} onConfirm={confirm} onCancel={onCancel} />;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 10 },
  title: { fontFamily: fonts.medium, fontSize: 16, color: colors.ink },
  amount: { fontFamily: fonts.regular, fontSize: 26, color: colors.ink },
  original: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted, marginTop: -4 },
  income: { color: colors.positive },
  facts: { gap: 6, marginTop: 2 },
  fact: { flexDirection: 'row', gap: 12 },
  factLabel: { width: 56, fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
  factValue: { flex: 1, fontFamily: fonts.regular, fontSize: 13, color: colors.ink },
  currencies: { gap: 4, marginTop: 4 },
  currenciesLabel: {
    fontFamily: fonts.medium,
    fontSize: 11,
    letterSpacing: 0.7,
    color: colors.muted,
    marginBottom: 2,
  },
  currencyRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  currencyAmount: { fontFamily: fonts.regular, fontSize: 14, color: colors.ink },
  currencyRate: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted },
  rule: { height: 1, backgroundColor: colors.line, marginVertical: 4 },
  deleteLink: { alignSelf: 'flex-start' },
  waiting: {
    borderWidth: 1,
    borderColor: colors.pendingLine,
    backgroundColor: colors.pendingSoft,
    borderRadius: 12,
    padding: 12,
    gap: 10,
    marginTop: 4,
  },
  waitingText: { fontFamily: fonts.regular, fontSize: 13, color: colors.pendingText },
  waitingActions: { flexDirection: 'row', gap: 8 },
  linkDanger: { fontFamily: fonts.medium, fontSize: 13, color: colors.danger },
  error: { fontFamily: fonts.regular, fontSize: 13, color: colors.danger },
});
