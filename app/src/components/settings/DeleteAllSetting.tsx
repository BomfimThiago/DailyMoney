import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { styles as page } from '@/components/connections/styles';
import { errorText } from '@/lib/api';
import { CONFIRM_WORD, purgeButton, purgeLines } from '@/lib/purge';
import { plural } from '@/lib/upload';
import { useDeleteAll } from '@/lib/useDeleteAll';
import { colors, fonts } from '@/theme';

// Ajustes: start over. Every line of every month goes; accounts, categories and
// connections stay. Asks for the word APAGAR before the button works.
export function DeleteAllSetting() {
  const d = useDeleteAll();
  return (
    <View style={page.card}>
      <Text style={page.bank}>Apagar todas as transações</Text>
      <Text style={page.status}>
        Para começar do zero: tira as transações de todos os meses e o histórico de envios.
      </Text>
      {d.removed !== null ? (
        <Text style={styles.done}>
          {plural(
            d.removed,
            'Pronto: 1 transação apagada.',
            (n) => `Pronto: ${n} transações apagadas.`,
          )}
        </Text>
      ) : null}
      {d.open ? <Confirm d={d} /> : <Small label="Apagar todas…" onPress={d.start} />}
    </View>
  );
}

function Confirm({ d }: { d: ReturnType<typeof useDeleteAll> }) {
  const o = d.overview.data;
  if (d.overview.isError) {
    return (
      <View style={styles.box}>
        <Text style={page.error}>{errorText(d.overview.error)}</Text>
        <View style={styles.actions}>
          <Small label="Fechar" onPress={d.close} />
          <Small label="Tentar de novo" onPress={() => void d.overview.refetch()} />
        </View>
      </View>
    );
  }
  if (!o) return <ActivityIndicator style={styles.box} color={colors.ink} />;
  if (o.transactions === 0) {
    return (
      <View style={styles.box}>
        <Text style={styles.text}>Não há transações para apagar.</Text>
        <View style={styles.actions}>
          <Small label="Fechar" onPress={d.close} />
        </View>
      </View>
    );
  }
  return (
    <View style={styles.box}>
      {purgeLines(o).map((line, i) => (
        <Text key={line} style={[styles.text, i > 0 && styles.muted]}>
          {line}
        </Text>
      ))}
      <Text style={styles.label}>Não dá para desfazer. Para confirmar, digite {CONFIRM_WORD}.</Text>
      <TextInput
        value={d.typed}
        onChangeText={d.setTyped}
        placeholder={CONFIRM_WORD}
        placeholderTextColor={colors.muted}
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        editable={!d.busy}
        accessibilityLabel={`Digite ${CONFIRM_WORD} para confirmar`}
        onSubmitEditing={() => void d.submit()}
        style={styles.input}
      />
      {d.error ? <Text style={page.error}>{d.error}</Text> : null}
      <View style={styles.actions}>
        <Small label="Cancelar" onPress={d.close} disabled={d.busy} />
        <Pressable
          onPress={() => void d.submit()}
          disabled={!d.ready || d.busy}
          accessibilityRole="button"
          accessibilityState={{ disabled: !d.ready || d.busy, busy: d.busy }}
          style={[styles.danger, (!d.ready || d.busy) && styles.off]}
        >
          {d.busy ? (
            <ActivityIndicator color={colors.page} />
          ) : (
            <Text style={styles.dangerText}>{purgeButton(o)}</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function Small({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={[styles.small, disabled && styles.off]}
    >
      <Text style={styles.smallText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: { marginTop: 14, gap: 6 },
  text: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.ink },
  muted: { color: colors.muted, fontSize: 13 },
  label: { fontFamily: fonts.medium, fontSize: 13, color: colors.ink, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.ink,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  small: {
    alignSelf: 'flex-start',
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 10,
  },
  smallText: { fontFamily: fonts.medium, fontSize: 14, color: colors.ink },
  danger: {
    borderRadius: 12,
    paddingVertical: 11.5,
    paddingHorizontal: 16,
    marginTop: 10,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerText: { fontFamily: fonts.medium, fontSize: 14, color: colors.page },
  off: { opacity: 0.35 },
  done: { fontFamily: fonts.medium, fontSize: 14, color: colors.positive, marginTop: 10 },
});
