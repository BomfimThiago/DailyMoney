import { type StyleProp, View, type ViewStyle } from 'react-native';

import { Chip } from '@/components/ui';
import { DISPLAY_CURRENCIES, useDisplayCurrency } from '@/lib/displayCurrency';

// BRL · EUR · USD on every money screen. The choice is the same for all of them.
export function CurrencyChips({ style }: { style?: StyleProp<ViewStyle> }) {
  const { currency, setCurrency } = useDisplayCurrency();
  return (
    <View style={[{ flexDirection: 'row', gap: 6 }, style]} accessibilityRole="radiogroup">
      {DISPLAY_CURRENCIES.map((c) => (
        <Chip key={c} label={c} selected={c === currency} onPress={() => setCurrency(c)} />
      ))}
    </View>
  );
}
