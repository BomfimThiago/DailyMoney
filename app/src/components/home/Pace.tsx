import { Text, View } from 'react-native';
import Svg, { Circle, G, Line, Polyline, Text as SvgText } from 'react-native-svg';

import {
  axisLabel,
  CHART_AXIS,
  cumulative,
  gridValues,
  niceMax,
  paceDay,
  paceScale,
  paceText,
} from '@/lib/dashboard';
import { monthLabel, shiftMonth } from '@/lib/format';
import type { CurrencyDashboard } from '@/lib/types';
import { colors, fonts } from '@/theme';

import { dash as styles } from './styles';

const CHART_H = 150;

// Spending added up day by day: this month (solid) against the month before (dashed).
export function Pace({
  month,
  dash,
  width,
}: {
  month: string;
  dash: CurrencyDashboard;
  width: number;
}) {
  const days = dash.daily.length;
  const now = cumulative(dash.daily).slice(0, paceDay(month, days));
  const before = cumulative(dash.previous_daily);
  const { max, step } = niceMax(Math.max(now.at(-1) ?? 0, before.at(-1) ?? 0));
  const w = width - 36; // card padding
  const { x, y, points } = paceScale(days, max, w, CHART_H);
  const sentence = paceText(month, dash.daily, dash.previous_daily, dash.currency);
  const beforeName = monthLabel(shiftMonth(month, -1)).split(' ')[0].toLowerCase();
  const label = { fontSize: 10, fill: colors.muted, fontFamily: fonts.regular };
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>RITMO DO MÊS</Text>
      <Text style={styles.cardSub}>{sentence}</Text>
      <Svg width={w} height={CHART_H} accessibilityLabel={sentence}>
        {gridValues(max, step).map((v) => (
          <G key={v}>
            <Line
              x1={CHART_AXIS}
              x2={w}
              y1={y(v)}
              y2={y(v)}
              stroke={v === 0 ? colors.line : colors.chartGrid}
            />
            <SvgText x={0} y={y(v) + 4} {...label}>
              {axisLabel(v)}
            </SvgText>
          </G>
        ))}
        {before.length > 0 ? (
          <Polyline
            points={points(before)}
            fill="none"
            stroke={colors.chartPrevious}
            strokeWidth={1.5}
            strokeDasharray="3 3"
          />
        ) : null}
        {now.length > 0 ? (
          <>
            <Polyline points={points(now)} fill="none" stroke={colors.ink} strokeWidth={1.8} />
            <Circle cx={x(now.length)} cy={y(now[now.length - 1])} r={3.5} fill={colors.ink} />
          </>
        ) : null}
        {[1, 15, days].map((d) => (
          <SvgText key={`d${d}`} x={x(d)} y={CHART_H - 4} {...label} textAnchor={anchor(d, days)}>
            {d}
          </SvgText>
        ))}
      </Svg>
      <Text style={styles.legend}>Linha cheia: este mês. Tracejada: {beforeName}.</Text>
    </View>
  );
}

function anchor(day: number, days: number): 'start' | 'end' | 'middle' {
  if (day === 1) return 'start';
  return day === days ? 'end' : 'middle';
}
