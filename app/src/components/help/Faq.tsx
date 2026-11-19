import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { FaqItem } from '@/lib/faq';
import { colors, fonts } from '@/theme';

// Questions as a list; each opens its answer in place. The first starts open.
export function Faq({ items }: { items: FaqItem[] }) {
  const [open, setOpen] = useState<string[]>(items.length ? [items[0].id] : []);
  const toggle = (id: string) =>
    setOpen((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));
  return (
    <View style={styles.list}>
      {items.map((item) => (
        <Question
          key={item.id}
          item={item}
          open={open.includes(item.id)}
          onToggle={() => toggle(item.id)}
        />
      ))}
    </View>
  );
}

function Question({
  item,
  open,
  onToggle,
}: {
  item: FaqItem;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <View style={styles.item}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={styles.head}
      >
        <Text style={styles.question}>{item.question}</Text>
        <Text style={styles.sign}>{open ? '−' : '+'}</Text>
      </Pressable>
      {open ? (
        <View style={styles.answer}>
          {item.answer.split('\n\n').map((p) => (
            <Text key={p} style={styles.paragraph}>
              {p}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { borderTopWidth: 1, borderTopColor: colors.line },
  item: { borderBottomWidth: 1, borderBottomColor: colors.line },
  head: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 16 },
  question: { flex: 1, fontFamily: fonts.medium, fontSize: 15, lineHeight: 21, color: colors.ink },
  sign: { fontFamily: fonts.regular, fontSize: 20, color: colors.muted, width: 16 },
  answer: { gap: 10, paddingBottom: 18, paddingRight: 32 },
  paragraph: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 22, color: colors.muted },
});
