import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useCloseOnOutsideTap } from '@/lib/useCloseOnOutsideTap';
import { colors, fonts } from '@/theme';

// A dropdown of coloured choices (categories, people): takes one line however many there
// are. The list opens in place (not floating) so it is never cut off inside the phone sheet.
export interface DotOption {
  id: string;
  name: string;
  color: string | null;
}

export function DotSelect({
  value,
  options,
  onChange,
  label,
  placeholder,
  empty,
  disabled,
}: {
  value: string | null;
  options: DotOption[];
  onChange: (id: string) => void;
  label: string;
  placeholder: string;
  empty: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((c) => c.id === value);
  const outside = useCloseOnOutsideTap(open, setOpen);
  return (
    <View {...outside}>
      <Pressable
        onPress={() => setOpen(!open)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded: open, disabled }}
        style={[styles.button, open && styles.buttonOpen, disabled && styles.buttonOff]}
      >
        {current ? <Dot color={current.color} /> : null}
        <Text style={[styles.value, !current && styles.placeholder]} numberOfLines={1}>
          {current ? current.name : placeholder}
        </Text>
        <Text style={styles.caret}>{open ? '▴' : '▾'}</Text>
      </Pressable>
      {open ? (
        <ScrollView style={styles.list} nestedScrollEnabled accessibilityRole="menu">
          {options.length ? null : <Text style={styles.empty}>{empty}</Text>}
          {options.map((c) => {
            const on = c.id === value;
            return (
              <Pressable
                key={c.id}
                onPress={() => {
                  onChange(c.id);
                  setOpen(false);
                }}
                accessibilityRole="menuitem"
                accessibilityState={{ selected: on }}
                style={[styles.item, on && styles.itemOn]}
              >
                <Dot color={c.color} />
                <Text style={[styles.itemText, on && styles.itemTextOn]}>{c.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}

// No colour (the household) shows an empty ring.
function Dot({ color }: { color: string | null }) {
  return <View style={[styles.dot, color ? { backgroundColor: color } : styles.dotEmpty]} />;
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  buttonOpen: { borderColor: colors.ink },
  buttonOff: { opacity: 0.5 },
  value: { flex: 1, fontFamily: fonts.regular, fontSize: 14, color: colors.ink },
  placeholder: { color: colors.muted },
  caret: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted },
  list: {
    maxHeight: 220,
    marginTop: 4,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    paddingVertical: 4,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  itemOn: { backgroundColor: colors.soft },
  itemText: { fontFamily: fonts.regular, fontSize: 14, color: colors.ink },
  itemTextOn: { fontFamily: fonts.medium },
  empty: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted, padding: 12 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotEmpty: { borderWidth: 1, borderColor: colors.dashed },
});
