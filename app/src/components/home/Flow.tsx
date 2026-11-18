import { Text, View } from 'react-native';
import Svg, { G, Path, Rect, Text as SvgText } from 'react-native-svg';

import { money } from '@/lib/format';
import { band, FLOW, flowLayout, flowNodes, type FlowKind } from '@/lib/monthFlow';
import type { CurrencyDashboard } from '@/lib/types';
import { colors, fonts } from '@/theme';

import { dash as styles } from './styles';

// Income and leftover in green, savings drawn on in amber, spending in the ink grey.
const paint: Record<FlowKind, { color: string; opacity: number }> = {
  income: { color: colors.positive, opacity: 0.16 },
  saved: { color: colors.positive, opacity: 0.28 },
  deficit: { color: colors.pending, opacity: 0.24 },
  spending: { color: colors.ink, opacity: 0.08 },
};
const node: Record<FlowKind, string> = {
  income: colors.positive,
  saved: colors.positive,
  deficit: colors.pending,
  spending: colors.chartPrevious,
};

const clip = (s: string, max: number) =>
  s.length > max ? `${s.slice(0, Math.max(1, max - 1)).trimEnd()}…` : s;

// Where the month's money went (Sankey): income by category goes into the bar in the
// middle and comes out as spending by category and what was left. Each band's thickness
// is its amount.
export function Flow({ dash, width }: { dash: CurrencyDashboard; width: number }) {
  const flow = flowNodes(dash.income_categories, dash.categories);
  const w = width - 36; // card padding
  const cur = dash.currency;
  const pct = (v: number) => {
    const p = (v / flow.total) * 100;
    return p > 0 && p < 1 ? '<1%' : `${Math.round(p)}%`;
  };
  const summary = [
    `Entradas ${money(String(flow.income), cur)}`,
    `Gastos ${money(String(flow.spending), cur)}`,
    ...flow.targets.map((t) => `${t.label} ${money(String(t.value), cur)}`),
  ].join('; ');
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>FLUXO DO MÊS</Text>
      {flow.total <= 0 ? (
        <Text style={styles.muted}>Nada entrou nem saiu neste mês.</Text>
      ) : (
        <Chart flow={flow} width={w} currency={cur} pct={pct} summary={summary} />
      )}
    </View>
  );
}

function Chart({
  flow,
  width,
  currency,
  pct,
  summary,
}: {
  flow: ReturnType<typeof flowNodes>;
  width: number;
  currency: CurrencyDashboard['currency'];
  pct: (v: number) => string;
  summary: string;
}) {
  const L = flowLayout(flow, width);
  const deficit = flow.sources.some((s) => s.kind === 'deficit');
  const hubLabel = deficit ? 'Gastos do mês' : 'Entradas do mês';
  const hubValue = deficit ? flow.spending : flow.income;
  const hubTextX = L.wide ? L.hubX + FLOW.node / 2 : 0;
  const anchor = L.wide ? 'middle' : 'start';
  const maxChars = Math.max(6, Math.floor((L.labelR - 12) / 7.4));
  const small = { fontSize: 11, fill: colors.muted, fontFamily: fonts.regular };
  const name = { fontSize: 13, fill: colors.ink, fontFamily: fonts.regular };
  return (
    <Svg width={width} height={L.height} accessibilityLabel={summary}>
      <SvgText x={hubTextX} y={FLOW.padTop - 26} textAnchor={anchor} {...small} fontSize={12}>
        {hubLabel}
      </SvgText>
      <SvgText
        x={hubTextX}
        y={FLOW.padTop - 9}
        textAnchor={anchor}
        fontSize={14}
        fill={colors.ink}
        fontFamily={fonts.medium}
      >
        {money(String(hubValue), currency)}
      </SvgText>
      {L.left.map(({ n, y, h, hubY }) => (
        <Path
          key={`b-${n.key}`}
          d={band(L.srcX + FLOW.node, y, y + h, L.hubX, hubY, hubY + h)}
          fill={paint[n.kind].color}
          fillOpacity={paint[n.kind].opacity}
        />
      ))}
      {L.right.map(({ n, y, h, hubY }) => (
        <Path
          key={`b-${n.key}`}
          d={band(L.hubX + FLOW.node, hubY, hubY + h, L.tgtX, y, y + h)}
          fill={paint[n.kind].color}
          fillOpacity={paint[n.kind].opacity}
        />
      ))}
      <Rect x={L.hubX} y={L.hubY} width={FLOW.node} height={L.hubH} rx={2} fill={colors.ink} />
      {[
        ...L.left.map((p) => ({ ...p, x: L.srcX })),
        ...L.right.map((p) => ({ ...p, x: L.tgtX })),
      ].map(({ n, y, h, x }) => (
        <Rect
          key={`n-${n.key}`}
          x={x}
          y={y}
          width={FLOW.node}
          height={Math.max(2, h)}
          rx={2}
          fill={node[n.kind]}
        />
      ))}
      {L.right.map(({ n, labelY }) => (
        <G key={`l-${n.key}`}>
          <SvgText x={L.tgtX + FLOW.node + 10} y={labelY - 2} {...name}>
            {clip(n.label, maxChars)}
          </SvgText>
          <SvgText x={L.tgtX + FLOW.node + 10} y={labelY + 13} {...small}>
            {`${money(String(n.value), currency)} · ${pct(n.value)}`}
          </SvgText>
        </G>
      ))}
      {L.left.map(({ n, labelY }) => (
        <G key={`l-${n.key}`}>
          <SvgText x={L.srcX - 10} y={labelY - 2} textAnchor="end" {...name}>
            {clip(n.label, 18)}
          </SvgText>
          <SvgText x={L.srcX - 10} y={labelY + 13} textAnchor="end" {...small}>
            {money(String(n.value), currency)}
          </SvgText>
        </G>
      ))}
    </Svg>
  );
}
