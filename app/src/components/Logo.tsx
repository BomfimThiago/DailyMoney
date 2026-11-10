import Svg, { Circle } from 'react-native-svg';

// The old app's mark: three overlapping coins, one for each currency (€, US$, R$).
const COBALT = '#1D5FD6';
const COBALT_SOFT = '#DCF1FF';

export function Logo({ size = 24 }: { size?: number }) {
  return (
    <Svg width={(size * 32) / 24} height={size} viewBox="0 0 32 24" accessibilityElementsHidden>
      <Circle cx={9} cy={12} r={7.25} fill={COBALT_SOFT} stroke={COBALT} strokeWidth={1.5} />
      <Circle cx={16} cy={12} r={7.25} fill={COBALT_SOFT} stroke={COBALT} strokeWidth={1.5} />
      <Circle cx={23} cy={12} r={7.25} fill={COBALT} stroke={COBALT} strokeWidth={1.5} />
    </Svg>
  );
}
