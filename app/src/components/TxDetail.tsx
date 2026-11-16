import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { DeleteConfirm, TxEditForm } from '@/components/transactions/TxEditForm';
import { errorText } from '@/lib/api';
import { fullDate, isIncome } from '@/lib/format';
import { deleteTransaction, updateCategory } from '@/lib/imports';
import { useCategories } from '@/lib/queries';
import { lineAmounts } from '@/lib/transactions';
import type { Transaction } from '@/lib/types';
import { colors, fonts } from '@/theme';

type Mode = 'view' | 'edit' | 'delete';

// One line of spending or income: what the statement says and its category, which the
// person can change (spec: Trocar a categoria), edit like in the old app, or delete.
// Side panel on a computer, sheet on a phone.
export function TxDetail({ t, onChanged }: { t: Transaction; onChanged: () => void }) {
  const [mode, setMode] = useState<Mode>('view');
  if (mode === 'edit') {
    return (
      <TxEditForm
        t={t}
        onSaved={() => {
          setMode('view');
          onChanged();
        }}
        onCancel={() => setMode('view')}
      />
    );
  }
  return <TxView t={t} onChanged={onChanged} mode={mode} setMode={setMode} />;
}

function TxView({
  t,
  onChanged,
  mode,
  setMode,
}: {
  t: Transaction;
  onChanged: () => void;
  mode: Mode;
  setMode: (m: Mode) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forMerchant, setForMerchant] = useState(true);
  const incoming = isIncome(t.amount);
  const amount = lineAmounts(t);

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
      {mode === 'delete' ? (
        <Deleting t={t} onDone={onChanged} onCancel={() => setMode('view')} />
      ) : (
        <View style={styles.links}>
          <Link label="Editar" onPress={() => setMode('edit')} />
          <Link label="Excluir" onPress={() => setMode('delete')} danger />
        </View>
      )}

      <Text style={styles.section}>CATEGORIA</Text>
      <CategoryChips t={t} busy={busy} onChoose={choose} />
      <MerchantCheck on={forMerchant} onToggle={() => setForMerchant(!forMerchant)} />
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

function Link({
  label,
  onPress,
  danger,
}: {
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" hitSlop={6}>
      <Text style={[styles.link, danger && styles.linkDanger]}>{label}</Text>
    </Pressable>
  );
}

function CategoryChips({
  t,
  busy,
  onChoose,
}: {
  t: Transaction;
  busy: string | null;
  onChoose: (id: string) => void;
}) {
  const categories = useCategories(true);
  if (categories.isError) {
    return <Text style={styles.note}>Não consegui carregar as categorias.</Text>;
  }
  if (!categories.data) return <ActivityIndicator color={colors.muted} />;
  const kind = isIncome(t.amount) ? 'income' : 'expense';
  return (
    <View style={styles.chips} accessibilityRole="radiogroup">
      {categories.data
        .filter((c) => c.kind === kind)
        .map((c) => (
          <CategoryChip
            key={c.id}
            name={c.name}
            on={c.id === t.category_id}
            saving={busy === c.id}
            disabled={busy !== null}
            onPress={() => onChoose(c.id)}
          />
        ))}
    </View>
  );
}

function CategoryChip({
  name,
  on,
  saving,
  disabled,
  onPress,
}: {
  name: string;
  on: boolean;
  saving: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ selected: on, busy: saving }}
      style={[styles.chip, on && styles.chipOn]}
    >
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{saving ? 'Salvando…' : name}</Text>
    </Pressable>
  );
}

function MerchantCheck({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      style={styles.check}
    >
      <View style={[styles.box16, on && styles.box16On]}>
        {on ? <Text style={styles.tick}>✓</Text> : null}
      </View>
      <Text style={styles.checkText}>Valer também para as próximas deste estabelecimento</Text>
    </Pressable>
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
  original: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted, marginTop: -4 },
  income: { color: colors.positive },
  facts: { gap: 6, marginTop: 2 },
  fact: { flexDirection: 'row', gap: 12 },
  factLabel: { width: 56, fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
  factValue: { flex: 1, fontFamily: fonts.regular, fontSize: 13, color: colors.ink },
  links: { flexDirection: 'row', gap: 18, marginTop: 2 },
  link: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.ink,
    textDecorationLine: 'underline',
    textDecorationColor: colors.dashed,
  },
  linkDanger: { color: colors.danger },
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
