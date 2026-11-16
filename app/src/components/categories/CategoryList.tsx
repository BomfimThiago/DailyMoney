import { Pressable, Text, View } from 'react-native';

import { countText } from '@/lib/categories';
import type { Category } from '@/lib/types';

import { styles } from './styles';

// One kind's categories: colour dot, name and how many lines use it.
export function CategoryList({
  items,
  selectedId,
  onSelect,
  chevron,
}: {
  items: Category[];
  selectedId?: string | null;
  onSelect: (c: Category) => void;
  chevron?: boolean;
}) {
  return (
    <View style={styles.list}>
      {items.map((c, i) => {
        const on = c.id === selectedId;
        return (
          <Pressable
            key={c.id}
            onPress={() => onSelect(c)}
            testID={`category-${c.name}`}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={[styles.row, i === 0 && styles.rowFirst, on && styles.rowOn]}
          >
            <View style={[styles.dot, { backgroundColor: c.color }]} />
            <View style={styles.rowMain}>
              <Text style={[styles.rowName, on && styles.rowNameOn]} numberOfLines={1}>
                {c.name}
              </Text>
              <Text style={styles.rowCount}>{countText(c)}</Text>
            </View>
            {chevron ? <Text style={styles.chevron}>›</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}
