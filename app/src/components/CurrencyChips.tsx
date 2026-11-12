import { type StyleProp, View, type ViewStyle } from 'react-native';

import { Chip } from '@/components/ui';
import type { Currency } from '@/lib/types';

// One chip per currency the page has; nothing when there is only one.
export function CurrencyChips({
  currencies,
  current,
  onChange,
  style,
}: {
  currencies: { currency: Currency }[];
  current: Currency | undefined;
  onChange: (c: Currency) => void;
  style: StyleProp<ViewStyle>;
}) {
  if (currencies.length < 2) return null;
  return (
    <View style={style} accessibilityRole="radiogroup">
      {currencies.map((c) => (
        <Chip
          key={c.currency}
          label={c.currency}
          selected={c.currency === current}
          onPress={() => onChange(c.currency)}
        />
      ))}
    </View>
  );
}
