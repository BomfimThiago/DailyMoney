import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DotSelect } from '@/components/DotSelect';
import type { Category } from '@/lib/types';
import { colors, fonts } from '@/theme';

export function CategorySelect({
  value,
  options,
  onChange,
}: {
  value: string | null;
  options: Category[];
  onChange: (id: string) => void;
}) {
  return (
    <DotSelect
      value={value}
      options={options}
      onChange={onChange}
      label="Categoria"
      placeholder="Escolher categoria"
      empty="Nenhuma categoria."
    />
  );
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
