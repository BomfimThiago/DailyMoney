import { Pressable, View } from 'react-native';

import { colorChoices } from '@/lib/categories';

import { styles } from './styles';

// The colour of a category: a row of dots, the chosen one ringed.
export function Swatches({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const current = value.toLowerCase();
  return (
    <View style={styles.swatches} accessibilityRole="radiogroup" accessibilityLabel="Cor">
      {colorChoices(value).map((color) => {
        const on = color === current;
        return (
          <Pressable
            key={color}
            onPress={() => onChange(color)}
            testID={`color-${color}`}
            accessibilityRole="radio"
            accessibilityLabel={`Cor ${color}`}
            accessibilityState={{ selected: on }}
            style={[styles.swatch, on && styles.swatchOn]}
          >
            <View style={[styles.swatchFill, { backgroundColor: color }]} />
          </Pressable>
        );
      })}
    </View>
  );
}
