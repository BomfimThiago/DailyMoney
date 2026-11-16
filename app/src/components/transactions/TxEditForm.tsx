import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Chip } from '@/components/ui';
import { errorText } from '@/lib/api';
import { setKind, updateTransaction } from '@/lib/imports';
import {
  formErrors,
  formOf,
  patchOf,
  type Direction,
  type EditKind,
  type TxForm,
} from '@/lib/txEdit';
import type { Transaction } from '@/lib/types';
import { colors, fonts } from '@/theme';

const KINDS: { value: EditKind; label: string }[] = [
  { value: 'regular', label: 'Gasto ou entrada' },
  { value: 'investment', label: 'Investimento' },
  { value: 'transfer', label: 'Entre minhas contas' },
];

// The old app's edit: description, date, amount (gasto/entrada) and what the line was.
// The currency is the account's, so it is shown but not edited.
export function TxEditForm({
  t,
  onSaved,
  onCancel,
}: {
  t: Transaction;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<TxForm>(() => formOf(t));
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errors = formErrors(form);
  const shown = tried ? errors : {};
  const set = <K extends keyof TxForm>(key: K, value: TxForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    setTried(true);
    if (Object.keys(errors).length) return;
    const patch = patchOf(t, form);
    const initialKind = formOf(t).kind;
    setSaving(true);
    setError(null);
    try {
      if (Object.keys(patch).length) await updateTransaction(t.id, patch);
      if (form.kind !== initialKind) await setKind(t.id, form.kind);
      onSaved();
    } catch (e) {
      setError(errorText(e));
      setSaving(false);
    }
  };

  return (
    <View style={styles.form}>
      <Field label="Descrição" error={shown.description}>
        <Input
          value={form.description}
          onChange={(v) => set('description', v)}
          label="Descrição"
          invalid={Boolean(shown.description)}
          maxLength={500}
        />
      </Field>
      <View style={styles.pair}>
        <Field label="Data" error={shown.date} style={styles.half}>
          <Input
            value={form.date}
            onChange={(v) => set('date', v)}
            label="Data"
            placeholder="DD/MM/AAAA"
            invalid={Boolean(shown.date)}
            keyboard="numbers-and-punctuation"
            maxLength={10}
          />
        </Field>
        <Field label={`Valor (${t.currency})`} error={shown.amount} style={styles.half}>
          <Input
            value={form.amount}
            onChange={(v) => set('amount', v)}
            label="Valor"
            placeholder="0,00"
            invalid={Boolean(shown.amount)}
            keyboard="decimal-pad"
            maxLength={20}
          />
        </Field>
      </View>
      <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Sentido">
        {(['out', 'in'] as Direction[]).map((d) => (
          <Chip
            key={d}
            label={d === 'out' ? 'Saiu dinheiro' : 'Entrou dinheiro'}
            selected={form.direction === d}
            onPress={() => set('direction', d)}
          />
        ))}
      </View>

      <Text style={styles.label}>Esta linha é</Text>
      <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Tipo">
        {KINDS.map((k) => (
          <Chip
            key={k.value}
            label={k.label}
            selected={form.kind === k.value}
            onPress={() => set('kind', k.value)}
          />
        ))}
      </View>
      {form.kind !== 'regular' ? (
        <Text style={styles.hint}>
          {form.kind === 'investment'
            ? 'Sai de Gastos e entradas e passa a contar em Investimentos.'
            : 'Sai de Gastos e entradas; fica em Transferências.'}
        </Text>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.actions}>
        <Button label="Cancelar" onPress={onCancel} disabled={saving} style={styles.action} />
        <Button label="Salvar" primary onPress={save} busy={saving} style={styles.action} />
      </View>
    </View>
  );
}

// Deleting asks once more: a deleted line only comes back by sending the statement again.
export function DeleteConfirm({
  busy,
  error,
  onConfirm,
  onCancel,
  title = 'Excluir esta transação?',
  hint = 'Ela some dos totais e das análises. Só volta se você enviar o extrato de novo.',
}: {
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  title?: string;
  hint?: string;
}) {
  return (
    <View style={styles.confirm}>
      <Text style={styles.confirmTitle}>{title}</Text>
      <Text style={styles.hint}>{hint}</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.actions}>
        <Button label="Cancelar" onPress={onCancel} disabled={busy} style={styles.action} />
        <Pressable
          onPress={onConfirm}
          disabled={busy}
          accessibilityRole="button"
          style={[styles.danger, busy && styles.off]}
        >
          <Text style={styles.dangerText}>{busy ? 'Excluindo…' : 'Excluir'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function Field({
  label,
  error,
  style,
  children,
}: {
  label: string;
  error?: string;
  style?: object;
  children: ReactNode;
}) {
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

export function Input({
  value,
  onChange,
  label,
  placeholder,
  invalid,
  keyboard,
  maxLength,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder?: string;
  invalid: boolean;
  keyboard?: 'decimal-pad' | 'numbers-and-punctuation';
  maxLength: number;
}) {
  const [focus, setFocus] = useState(false);
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={colors.muted}
      accessibilityLabel={label}
      keyboardType={keyboard ?? 'default'}
      maxLength={maxLength}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      style={[styles.input, focus && styles.inputFocus, invalid && styles.inputBad]}
    />
  );
}

const styles = StyleSheet.create({
  form: { gap: 12 },
  pair: { flexDirection: 'row', gap: 10 },
  half: { flex: 1, minWidth: 0 },
  field: { gap: 5 },
  label: { fontFamily: fonts.medium, fontSize: 12, color: colors.muted },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.ink,
    minWidth: 0,
  },
  inputFocus: { borderColor: colors.ink },
  inputBad: { borderColor: colors.danger },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  hint: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted },
  error: { fontFamily: fonts.regular, fontSize: 12, color: colors.danger },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  action: { flex: 1, paddingVertical: 10 },
  confirm: { gap: 10 },
  confirmTitle: { fontFamily: fonts.medium, fontSize: 15, color: colors.ink },
  danger: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.danger,
  },
  dangerText: { fontFamily: fonts.medium, fontSize: 14, color: colors.page },
  off: { opacity: 0.35 },
});
