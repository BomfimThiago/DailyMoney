import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Category } from '@/lib/types';
import { colors, fonts } from '@/theme';

// A dropdown of categories: takes one line however many categories the family has.
// The list opens in place (not floating) so it is never cut off inside the phone sheet.
export function CategorySelect({
  value,
  options,
  onChange,
}: {
  value: string | null;
  options: Category[];
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((c) => c.id === value);
  return (
    <View>
      <Pressable
        onPress={() => setOpen(!open)}
        accessibilityRole="button"
        accessibilityLabel="Categoria"
        accessibilityState={{ expanded: open }}
        style={[styles.button, open && styles.buttonOpen]}
      >
        {current ? <Dot color={current.color} /> : null}
        <Text style={[styles.value, !current && styles.placeholder]} numberOfLines={1}>
          {current ? current.name : 'Escolher categoria'}
        </Text>
        <Text style={styles.caret}>{open ? '▴' : '▾'}</Text>
      </Pressable>
      {open ? (
        <ScrollView style={styles.list} nestedScrollEnabled accessibilityRole="menu">
          {options.length ? null : <Text style={styles.empty}>Nenhuma categoria.</Text>}
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

// The chosen category on one line, as the detail shows it.
export function CategoryName({
  category,
}: {
  category: Pick<Category, 'name' | 'color'> | null | undefined;
}) {
  if (!category) return <Text style={styles.none}>Sem categoria</Text>;
  return (
    <View style={styles.name}>
      <Dot color={category.color} />
      <Text style={styles.nameText}>{category.name}</Text>
    </View>
  );
}

function Dot({ color }: { color: string }) {
  return <View style={[styles.dot, { backgroundColor: color }]} />;
}

export function MerchantCheck({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      style={styles.check}
    >
      <View style={[styles.box, on && styles.boxOn]}>
        {on ? <Text style={styles.tick}>✓</Text> : null}
      </View>
      <Text style={styles.checkText}>Valer também para as próximas deste estabelecimento</Text>
    </Pressable>
  );
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
  name: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nameText: { fontFamily: fonts.regular, fontSize: 14, color: colors.ink },
  none: { fontFamily: fonts.regular, fontSize: 14, color: colors.muted },
  dot: { width: 8, height: 8, borderRadius: 4 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 2 },
  box: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.dashed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  tick: { fontSize: 12, lineHeight: 14, color: colors.page },
  checkText: { flex: 1, fontFamily: fonts.regular, fontSize: 13, color: colors.ink },
});
