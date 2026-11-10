import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, SectionTitle, ui } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { askForBank } from '@/lib/imports';
import { useBankRequests } from '@/lib/queries';
import { colors, fonts } from '@/theme';

// What the statement readers in the API recognise (backend/app/statements/parsing).
export const SUPPORTED_BANKS: { name: string; formats: string }[] = [
  { name: 'Nubank', formats: 'CSV, OFX ou PDF' },
  { name: 'Inter', formats: 'CSV, OFX ou PDF' },
  { name: 'Itaú', formats: 'PDF' },
  { name: 'Wise', formats: 'CSV' },
  { name: 'Revolut', formats: 'PDF' },
  { name: 'CaixaBank', formats: 'PDF' },
];

// Enviar extrato: the banks the app reads, and a box to ask for another one.
export function SupportedBanks() {
  const client = useQueryClient();
  const requests = useBankRequests(true);
  const [name, setName] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const asked = requests.data ?? [];

  const send = async () => {
    const bank = name.trim();
    if (!bank || sending) return;
    setSending(true);
    setError(null);
    setSent(null);
    try {
      await askForBank(bank);
      setName('');
      setSent(bank);
      await client.invalidateQueries({ queryKey: ['bank-requests'] });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não consegui enviar. Tente de novo.');
    } finally {
      setSending(false);
    }
  };

  return (
    <View>
      <SectionTitle>Bancos suportados</SectionTitle>
      <View style={ui.rowList}>
        {SUPPORTED_BANKS.map((b, i) => (
          <View key={b.name} style={[ui.row, i === 0 && ui.rowFirst, styles.row]}>
            <Text style={styles.name}>{b.name}</Text>
            <Text style={styles.formats}>{b.formats}</Text>
          </View>
        ))}
      </View>

      <View style={styles.ask}>
        <Text style={styles.askTitle}>Seu banco não está na lista?</Text>
        <Text style={styles.muted}>Diga qual é e a gente adiciona.</Text>
        <View style={styles.askRow}>
          <TextInput
            value={name}
            onChangeText={setName}
            onSubmitEditing={() => void send()}
            placeholder="Nome do banco"
            placeholderTextColor={colors.muted}
            accessibilityLabel="Nome do banco"
            maxLength={80}
            returnKeyType="send"
            style={styles.input}
          />
          <Button
            label="Pedir"
            onPress={() => void send()}
            disabled={!name.trim()}
            busy={sending}
          />
        </View>
        {sent ? <Text style={styles.ok}>Pedido de {sent} registrado.</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {asked.length > 0 ? (
          <Text style={styles.muted}>Já pedidos: {asked.map((r) => r.bank_name).join(', ')}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { justifyContent: 'space-between' },
  name: { fontFamily: fonts.regular, fontSize: 14, color: colors.ink },
  formats: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
  ask: {
    marginTop: 12,
    padding: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
  },
  askTitle: { fontFamily: fonts.medium, fontSize: 14, color: colors.ink },
  askRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 4 },
  input: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.ink,
    outlineWidth: 0,
  },
  muted: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, color: colors.muted },
  ok: { fontFamily: fonts.regular, fontSize: 12, color: colors.positive },
  error: { fontFamily: fonts.regular, fontSize: 12, color: colors.danger },
});
