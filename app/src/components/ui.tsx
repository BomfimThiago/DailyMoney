import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/theme';

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.section}>{children}</Text>;
}

export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[styles.chip, selected && styles.chipOn]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

export function Button({
  label,
  onPress,
  primary,
  disabled,
  busy,
  style,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
  busy?: boolean;
  style?: object;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      style={[
        styles.button,
        primary && styles.buttonPrimary,
        (disabled || busy) && styles.buttonOff,
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={primary ? colors.page : colors.ink} />
      ) : (
        <Text style={[styles.buttonText, primary && styles.buttonTextPrimary]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export const ui = StyleSheet.create({
  rowList: { borderWidth: 1, borderColor: colors.line, borderRadius: 14, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  rowFirst: { borderTopWidth: 0 },
  rowDate: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
    width: 40,
    paddingTop: 2,
  },
  rowMain: { flex: 1, minWidth: 0 },
  rowTitle: { fontFamily: fonts.medium, fontSize: 14, color: colors.ink },
  rowSub: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted, marginTop: 2 },
  rowAmount: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
  income: { color: colors.positive },
});

const styles = StyleSheet.create({
  section: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    letterSpacing: 0.7,
    color: colors.muted,
    textTransform: 'uppercase',
    marginTop: 28,
    marginBottom: 10,
  },
  chip: {
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipOn: { borderColor: colors.ink, backgroundColor: colors.ink },
  chipText: { fontFamily: fonts.medium, fontSize: 13, color: colors.ink },
  chipTextOn: { color: colors.page },
  button: {
    borderWidth: 1.5,
    borderColor: colors.ink,
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPrimary: { backgroundColor: colors.ink },
  buttonOff: { opacity: 0.35 },
  buttonText: { fontFamily: fonts.medium, fontSize: 14, color: colors.ink },
  buttonTextPrimary: { color: colors.page },
  card: { borderWidth: 1, borderColor: colors.line, borderRadius: 16, padding: 16 },
});
