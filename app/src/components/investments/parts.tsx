import { Text, View } from 'react-native';

import { styles, wide } from './styles';

export function Figure({
  label,
  value,
  sub,
  tone,
  first,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: boolean;
  first?: boolean;
}) {
  return (
    <View style={[wide.figure, !first && wide.divider]}>
      <Text style={wide.figureLabel}>{label}</Text>
      <Text
        style={[wide.figureValue, tone && styles.invest]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      {sub ? <Text style={wide.figureSub}>{sub}</Text> : null}
    </View>
  );
}
