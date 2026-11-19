import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { styles as page } from '@/components/connections/styles';
import { CONFIRM_WORD } from '@/lib/purge';
import { colors, fonts } from '@/theme';

// The last step of every "Apagar…" in Ajustes: what goes, the word APAGAR typed by hand,
// and a red button that only works after it.
export function ConfirmDelete({
  lines,
  button,
  typed,
  setTyped,
  ready,
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  lines: string[];
  button: string;
  typed: string;
  setTyped: (s: string) => void;
  ready: boolean;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <View style={confirmStyles.box}>
      {lines.map((line, i) => (
        <Text key={line} style={[confirmStyles.text, i > 0 && confirmStyles.muted]}>
          {line}
        </Text>
      ))}
      <Text style={confirmStyles.label}>
        Não dá para desfazer. Para confirmar, digite {CONFIRM_WORD}.
      </Text>
      <TextInput
        value={typed}
        onChangeText={setTyped}
        placeholder={CONFIRM_WORD}
        placeholderTextColor={colors.muted}
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        editable={!busy}
        accessibilityLabel={`Digite ${CONFIRM_WORD} para confirmar`}
        onSubmitEditing={onSubmit}
        style={confirmStyles.input}
      />
      {error ? <Text style={page.error}>{error}</Text> : null}
      <View style={confirmStyles.actions}>
        <Small label="Cancelar" onPress={onCancel} disabled={busy} />
        <Pressable
          onPress={onSubmit}
          disabled={!ready || busy}
          accessibilityRole="button"
          accessibilityState={{ disabled: !ready || busy, busy }}
          style={[confirmStyles.danger, (!ready || busy) && confirmStyles.off]}
        >
          {busy ? (
            <ActivityIndicator color={colors.page} />
          ) : (
            <Text style={confirmStyles.dangerText}>{button}</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

export function Small({
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
      style={[confirmStyles.small, disabled && confirmStyles.off]}
    >
      <Text style={confirmStyles.smallText}>{label}</Text>
    </Pressable>
  );
}

export const confirmStyles = StyleSheet.create({
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
