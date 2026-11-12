import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { errorText } from '@/lib/api';
import { fullDate, isIncome, money } from '@/lib/format';
import { updateCategory } from '@/lib/imports';
import { useCategories } from '@/lib/queries';
import type { Transaction } from '@/lib/types';
import { colors, fonts } from '@/theme';

// One line of spending or income: what the statement says and its category, which the
// person can change (spec: Trocar a categoria). Side panel on a computer, sheet on a phone.
export function TxDetail({ t, onChanged }: { t: Transaction; onChanged: () => void }) {
  const categories = useCategories(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forMerchant, setForMerchant] = useState(true);
  const incoming = isIncome(t.amount);
  const choices = (categories.data ?? []).filter(
    (c) => c.kind === (incoming ? 'income' : 'expense'),
  );

  const choose = async (categoryId: string) => {
    if (categoryId === t.category_id) return;
    setBusy(categoryId);
    setError(null);
    try {
      await updateCategory(t.id, categoryId, forMerchant);
      onChanged();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.box}>
      <Text style={styles.title}>{t.description}</Text>
      <Text style={[styles.amount, incoming && styles.income]}>
        {money(t.amount, t.currency, true)}
      </Text>
      <View style={styles.facts}>
        <Fact label="Data" value={fullDate(t.date)} />
        <Fact label="Conta" value={`${t.account_name} · ${t.currency}`} />
      </View>

      <Text style={styles.section}>CATEGORIA</Text>
      {categories.isError ? (
        <Text style={styles.note}>Não consegui carregar as categorias.</Text>
      ) : !categories.data ? (
        <ActivityIndicator color={colors.muted} />
      ) : (
        <View style={styles.chips} accessibilityRole="radiogroup">
          {choices.map((c) => {
            const on = c.id === t.category_id;
            return (
              <Pressable
                key={c.id}
                onPress={() => choose(c.id)}
                disabled={busy !== null}
                accessibilityRole="radio"
                accessibilityState={{ selected: on, busy: busy === c.id }}
                style={[styles.chip, on && styles.chipOn]}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>
                  {busy === c.id ? 'Salvando…' : c.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
      <Pressable
        onPress={() => setForMerchant(!forMerchant)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: forMerchant }}
        style={styles.check}
      >
        <View style={[styles.box16, forMerchant && styles.box16On]}>
          {forMerchant ? <Text style={styles.tick}>✓</Text> : null}
        </View>
        <Text style={styles.checkText}>Valer também para as próximas deste estabelecimento</Text>
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
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
  income: { color: colors.positive },
  facts: { gap: 6, marginTop: 2 },
  fact: { flexDirection: 'row', gap: 12 },
  factLabel: { width: 56, fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
  factValue: { flex: 1, fontFamily: fonts.regular, fontSize: 13, color: colors.ink },
  section: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    letterSpacing: 0.7,
    color: colors.muted,
    marginTop: 10,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontFamily: fonts.medium, fontSize: 13, color: colors.ink },
  chipTextOn: { color: colors.page },
  check: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  box16: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.dashed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  box16On: { backgroundColor: colors.ink, borderColor: colors.ink },
  tick: { fontSize: 12, lineHeight: 14, color: colors.page },
  checkText: { flex: 1, fontFamily: fonts.regular, fontSize: 13, color: colors.ink },
  note: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
  error: { fontFamily: fonts.regular, fontSize: 13, color: colors.danger },
});
