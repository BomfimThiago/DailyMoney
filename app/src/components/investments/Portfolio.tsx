// The bank's own investment portfolio (Pluggy): balance of each investment, split by type,
// gain over what was put in, maturities and the total over time.
import { useState } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';

import { money, plain } from '@/lib/format';
import {
  banksLine,
  emptyText,
  finding,
  gainSub,
  gainText,
  historyPoints,
  historyRange,
  ladderHeights,
  maturingSub,
  percent,
  positionNote,
  positionSub,
  shade,
  totalSub,
  undatedText,
} from '@/lib/portfolio';
import type { Portfolio, PortfolioPosition } from '@/lib/types';
import { colors } from '@/theme';

import { Figure } from './parts';
import { portfolio as styles, wide } from './styles';

// Computer: the figures in a row, then type split + history beside the maturities, then
// every investment by type.
export function WidePortfolio({ p, twoColumns }: { p: Portfolio; twoColumns: boolean }) {
  if (!p.count) return <EmptyPortfolio p={p} />;
  const gain = gainText(p);
  return (
    <>
      <View style={wide.figures}>
        <Figure label="SALDO NO BANCO" value={money(p.total, p.currency)} sub={totalSub(p)} first />
        <Figure label="RENDEU" value={gain ?? '—'} sub={gainSub(p)} tone={!!gain} />
        <Figure
          label="VENCE EM 12 MESES"
          value={money(p.maturing.total, p.currency)}
          sub={maturingSub(p)}
        />
      </View>
      <View style={[wide.pair, !twoColumns && wide.stack]}>
        <View style={[wide.card, twoColumns && wide.half]}>
          <Text style={wide.cardTitle}>DIVISÃO POR TIPO</Text>
          <Allocation p={p} />
        </View>
        <View style={[wide.card, twoColumns && wide.half]}>
          <Text style={wide.cardTitle}>VENCIMENTOS</Text>
          <Ladder p={p} />
          <History p={p} />
        </View>
      </View>
      <View style={wide.card}>
        <Text style={wide.cardTitle}>SEUS INVESTIMENTOS</Text>
        <Positions p={p} />
      </View>
    </>
  );
}

// Phone: one column, the same parts.
export function PhonePortfolio({ p }: { p: Portfolio }) {
  if (!p.count) return <EmptyPortfolio p={p} />;
  const gain = gainText(p);
  return (
    <>
      <View style={styles.hero}>
        <Text style={styles.heroLabel}>Saldo no banco</Text>
        <Text style={styles.heroValue}>{money(p.total, p.currency)}</Text>
        <Text style={styles.heroSub}>{totalSub(p)}</Text>
        {gain ? (
          <Text style={styles.heroSub}>
            <Text style={styles.invest}>{gain}</Text> de rendimento
          </Text>
        ) : null}
      </View>
      <Text style={styles.label}>Divisão por tipo</Text>
      <Allocation p={p} />
      <History p={p} />
      <Text style={styles.label}>Vencimentos</Text>
      <Ladder p={p} />
      <Text style={styles.label}>Seus investimentos</Text>
      <Positions p={p} />
    </>
  );
}

function EmptyPortfolio({ p }: { p: Portfolio }) {
  return (
    <View style={styles.note}>
      <Text style={styles.noteText}>{emptyText(p)}</Text>
    </View>
  );
}

function Allocation({ p }: { p: Portfolio }) {
  const sentence = finding(p);
  const banks = banksLine(p);
  return (
    <View style={styles.block}>
      {sentence ? <Text style={styles.sub}>{sentence}</Text> : null}
      <View style={styles.allocation} accessibilityRole="image" accessibilityLabel={sentence ?? ''}>
        {p.classes.map((c, i) => (
          <View
            key={c.key}
            style={[styles.segment, { flex: Number(c.share) || 0.001, opacity: shade(i) }]}
          />
        ))}
      </View>
      {p.classes.map((c, i) => (
        <View key={c.key} style={[styles.classRow, i === 0 && styles.first]}>
          <View style={[styles.dot, { opacity: shade(i) }]} />
          <Text style={styles.className}>{c.label}</Text>
          <Text style={styles.classShare}>{percent(c.share)}</Text>
          <Text style={styles.classValue}>{money(c.total, p.currency)}</Text>
        </View>
      ))}
      {banks ? <Text style={styles.foot}>{banks}</Text> : null}
    </View>
  );
}

const CHART_H = 96;

function History({ p }: { p: Portfolio }) {
  const [width, setWidth] = useState(0);
  const range = historyRange(p.history);
  if (!range) return null;
  const points = width ? historyPoints(p.history, width, CHART_H) : null;
  const first = p.history[0];
  return (
    <View style={styles.block}>
      <Text style={styles.label}>Saldo no tempo</Text>
      <View
        style={styles.chart}
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        accessibilityRole="image"
        accessibilityLabel={`De ${money(first.total, p.currency)} para ${money(p.total, p.currency)}`}
      >
        {points ? (
          <Svg width={width} height={CHART_H}>
            <Polyline
              points={points.map((pt) => `${pt.x},${pt.y}`).join(' ')}
              fill="none"
              stroke={colors.invest}
              strokeWidth={1.5}
            />
          </Svg>
        ) : null}
      </View>
      <Text style={styles.foot}>{range}</Text>
    </View>
  );
}

function Ladder({ p }: { p: Portfolio }) {
  const ladder = p.ladder;
  const undated = undatedText(p);
  if (!ladder) {
    return <Text style={styles.sub}>Nenhum investimento com data de vencimento.</Text>;
  }
  const heights = ladderHeights(ladder.steps);
  return (
    <View style={styles.block}>
      <Text style={styles.sub}>Quanto volta em cada ano, pelo saldo de hoje.</Text>
      <View style={styles.ladder}>
        {ladder.steps.map((s, i) => (
          <View key={s.label} style={styles.ladderCol}>
            <Text style={styles.ladderValue} numberOfLines={1}>
              {s.count ? plain(s.total) : ''}
            </Text>
            <View style={[styles.ladderBar, { height: heights[i] }]} />
            <Text style={styles.ladderYear}>{s.label}</Text>
          </View>
        ))}
      </View>
      {undated ? <Text style={styles.foot}>{undated}</Text> : null}
    </View>
  );
}

function Positions({ p }: { p: Portfolio }) {
  return (
    <View>
      {p.classes.map((c) => (
        <View key={c.key} style={styles.group}>
          <Text style={styles.groupTitle}>{c.label}</Text>
          {c.positions.map((pos, i) => (
            <PositionRow key={pos.id} pos={pos} lens={p.currency} first={i === 0} />
          ))}
        </View>
      ))}
      {p.closed ? (
        <Text style={styles.foot}>
          {p.closed === 1
            ? '1 investimento resgatado ou encerrado não aparece aqui.'
            : `${p.closed} investimentos resgatados ou encerrados não aparecem aqui.`}
        </Text>
      ) : null}
    </View>
  );
}

function PositionRow({
  pos,
  lens,
  first,
}: {
  pos: PortfolioPosition;
  lens: Portfolio['currency'];
  first: boolean;
}) {
  const note = positionNote(pos, lens);
  return (
    <View style={[styles.row, first && styles.first]}>
      <View style={styles.main}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {pos.name}
        </Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {positionSub(pos)}
        </Text>
      </View>
      <View style={styles.right}>
        <Text style={styles.rowValue}>{money(pos.value, lens)}</Text>
        {note ? (
          <Text style={[styles.rowSub, pos.gain !== null && styles.invest]}>{note}</Text>
        ) : null}
      </View>
    </View>
  );
}
