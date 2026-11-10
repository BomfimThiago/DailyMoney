import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';

import { MonthNav } from '@/components/nav';
import { Button, Chip } from '@/components/ui';
import {
  axisLabel,
  calendarWeeks,
  contentWidth as contentWidthFor,
  cumulative,
  niceMax,
  PAGE_MAX,
  PAGE_PAD as PAD,
  paceChange,
  paceDay,
  paceSentence,
  topShares,
  TWO_COLUMNS,
} from '@/lib/dashboard';
import { money, monthLabel, plain, shiftMonth } from '@/lib/format';
import { useDashboard } from '@/lib/queries';
import type { Currency, CurrencyDashboard, CurrencySummary, MonthSummary } from '@/lib/types';
import { colors, fonts } from '@/theme';

// Início on a computer: the old web's dashboard, in the new white style (variant B).
export function HomeDashboard({
  month,
  onMonth,
  summary,
  summaryError,
  shown,
  onCurrency,
  firstName,
}: {
  month: string;
  onMonth: (m: string) => void;
  summary: MonthSummary | null;
  summaryError: boolean;
  shown: CurrencySummary | null;
  onCurrency: (c: Currency) => void;
  firstName: string;
}) {
  const { width } = useWindowDimensions();
  const dashQuery = useDashboard(month, summary !== null && summary.currencies.length > 0);
  const contentWidth = contentWidthFor(width);
  const twoColumns = contentWidth >= TWO_COLUMNS;
  const dash = dashQuery.data?.currencies.find((c) => c.currency === shown?.currency) ?? null;
  const noAccounts = summary !== null && summary.currencies.length === 0;

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.column}>
        <View style={styles.head}>
          <MonthNav month={month} onChange={onMonth} />
          {summary && summary.currencies.length > 1 ? (
            <View style={styles.chips} accessibilityRole="radiogroup">
              {summary.currencies.map((c) => (
                <Chip
                  key={c.currency}
                  label={c.currency}
                  selected={c.currency === shown?.currency}
                  onPress={() => onCurrency(c.currency)}
                />
              ))}
            </View>
          ) : null}
        </View>

        {summaryError ? (
          <Text style={styles.muted}>Não consegui carregar. Tente de novo.</Text>
        ) : !summary ? (
          <ActivityIndicator color={colors.muted} style={styles.loading} />
        ) : noAccounts ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>Olá, {firstName}</Text>
            <Text style={styles.muted}>
              Envie o extrato de uma conta ou cartão para ver para onde vai o seu dinheiro.
            </Text>
            <Button
              primary
              label="Enviar extrato"
              onPress={() => router.push('/upload')}
              style={styles.emptyButton}
            />
          </View>
        ) : shown ? (
          <>
            <Figures month={month} shown={shown} dash={dash} />
            {summary.currencies.length > 1 ? (
              <Text style={styles.hint}>
                Só contas em {shown.currency}. A conversão entre moedas vem depois.
              </Text>
            ) : null}
            {summary.pending_transfers > 0 ? (
              <Pressable
                onPress={() =>
                  router.navigate({ pathname: '/transacoes', params: { aba: 'transferencias' } })
                }
                accessibilityRole="link"
                style={styles.pending}
              >
                <View style={styles.pendingDot} />
                <Text style={styles.pendingText}>
                  {summary.pending_transfers === 1
                    ? '1 transferência para confirmar'
                    : `${summary.pending_transfers} transferências para confirmar`}
                </Text>
                <Text style={styles.pendingLink}>Ver</Text>
              </Pressable>
            ) : null}

            {dashQuery.isError ? (
              <Text style={[styles.muted, styles.loading]}>
                Não consegui carregar os gráficos. Tente de novo.
              </Text>
            ) : !dash ? (
              <ActivityIndicator color={colors.muted} style={styles.loading} />
            ) : (
              <>
                <Pace month={month} dash={dash} width={contentWidth} />
                <View style={[styles.pair, !twoColumns && styles.stack]}>
                  <Breakdown dash={dash} />
                  <SpendingCalendar month={month} dash={dash} />
                </View>
              </>
            )}
          </>
        ) : null}
      </View>
    </ScrollView>
  );
}

function Figures({
  month,
  shown,
  dash,
}: {
  month: string;
  shown: CurrencySummary;
  dash: CurrencyDashboard | null;
}) {
  const day = dash ? paceDay(month, dash.daily.length) : 0;
  const sentence = dash
    ? paceSentence(paceChange(dash.daily, dash.previous_daily, day), month)
    : null;
  return (
    <View style={styles.figures}>
      <Figure label="Entradas" value={plain(shown.income)} color={colors.positive} />
      <Figure label="Gastos" value={plain(shown.spending)} sub={sentence} divider />
      <Figure label="Investido" value={plain(shown.invested)} color={colors.invest} divider />
      <Figure label="Sobrou no mês" value={money(shown.left, shown.currency)} divider wide />
    </View>
  );
}

function Figure({
  label,
  value,
  color,
  sub,
  divider,
  wide,
}: {
  label: string;
  value: string;
  color?: string;
  sub?: string | null;
  divider?: boolean;
  wide?: boolean;
}) {
  return (
    <View style={[styles.figure, divider && styles.divider, wide && styles.figureWide]}>
      <Text style={styles.figureLabel}>{label.toUpperCase()}</Text>
      <Text style={[styles.figureValue, color ? { color } : null]} numberOfLines={1}>
        {value}
      </Text>
      {sub ? <Text style={styles.figureSub}>{sub}</Text> : null}
    </View>
  );
}

const CHART_H = 150;
const AXIS_W = 44;

// Spending added up day by day: this month (solid) against the month before (dashed).
function Pace({ month, dash, width }: { month: string; dash: CurrencyDashboard; width: number }) {
  const days = dash.daily.length;
  const day = paceDay(month, days);
  const now = cumulative(dash.daily).slice(0, day);
  const before = cumulative(dash.previous_daily);
  const { max, step } = niceMax(Math.max(now[now.length - 1] ?? 0, before[before.length - 1] ?? 0));
  const w = width - 36; // card padding
  const plotW = w - AXIS_W - 8;
  const x = (d: number) => AXIS_W + ((d - 1) / Math.max(days - 1, 1)) * plotW;
  const y = (v: number) => 12 + (1 - v / max) * (CHART_H - 32);
  const points = (values: number[]) =>
    values.map((v, i) => `${x(Math.min(i + 1, days))},${y(v)}`).join(' ');
  const ticks: number[] = [];
  for (let v = 0; v <= max + 1e-9; v += step) ticks.push(v);

  const spent = now[now.length - 1] ?? 0;
  const change = paceChange(dash.daily, dash.previous_daily, day);
  const beforeName = monthLabel(shiftMonth(month, -1)).split(' ')[0].toLowerCase();
  let sentence = 'Nenhum gasto neste mês ainda.';
  if (day > 0 && spent > 0) {
    sentence = `Até o dia ${day}: ${money(String(spent), dash.currency)} em gastos`;
    sentence += change === null ? '.' : `, ${paceSentence(change, month)} no mesmo dia.`;
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>RITMO DO MÊS</Text>
      <Text style={styles.cardSub}>{sentence}</Text>
      <Svg width={w} height={CHART_H} accessibilityLabel={sentence}>
        {ticks.map((v) => (
          <Line
            key={v}
            x1={AXIS_W}
            x2={w}
            y1={y(v)}
            y2={y(v)}
            stroke={v === 0 ? colors.line : '#F4F4F7'}
          />
        ))}
        {ticks.map((v) => (
          <SvgText
            key={`l${v}`}
            x={0}
            y={y(v) + 4}
            fontSize={10}
            fill={colors.muted}
            fontFamily={fonts.regular}
          >
            {axisLabel(v)}
          </SvgText>
        ))}
        {before.length > 0 ? (
          <Polyline
            points={points(before)}
            fill="none"
            stroke="#B7B5C3"
            strokeWidth={1.5}
            strokeDasharray="3 3"
          />
        ) : null}
        {now.length > 0 ? (
          <>
            <Polyline points={points(now)} fill="none" stroke={colors.ink} strokeWidth={1.8} />
            <Circle cx={x(now.length)} cy={y(spent)} r={3.5} fill={colors.ink} />
          </>
        ) : null}
        {[1, 15, days].map((d) => (
          <SvgText
            key={`d${d}`}
            x={x(d)}
            y={CHART_H - 4}
            fontSize={10}
            fill={colors.muted}
            fontFamily={fonts.regular}
            textAnchor={d === 1 ? 'start' : d === days ? 'end' : 'middle'}
          >
            {d}
          </SvgText>
        ))}
      </Svg>
      <Text style={styles.legend}>Linha cheia: este mês. Tracejada: {beforeName}.</Text>
    </View>
  );
}

type By = 'categoria' | 'conta';

function Breakdown({ dash }: { dash: CurrencyDashboard }) {
  const [by, setBy] = useState<By>('categoria');
  const rows = topShares(by === 'categoria' ? dash.categories : dash.accounts);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const top = rows[0]?.amount ?? 0;
  return (
    <View style={[styles.card, styles.half]}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>DIVISÃO DOS GASTOS</Text>
        <View style={styles.chips} accessibilityRole="radiogroup">
          <Chip
            label="Categoria"
            selected={by === 'categoria'}
            onPress={() => setBy('categoria')}
          />
          <Chip label="Conta" selected={by === 'conta'} onPress={() => setBy('conta')} />
        </View>
      </View>
      {rows.length === 0 ? (
        <Text style={styles.muted}>Nenhum gasto neste mês.</Text>
      ) : (
        rows.map((r) => (
          <View key={r.name} style={styles.share}>
            <View style={styles.shareLine}>
              <Text style={styles.shareName} numberOfLines={1}>
                {r.name}
              </Text>
              <Text style={styles.shareValue}>
                {money(String(r.amount), dash.currency)}
                <Text style={styles.sharePct}> · {Math.round((r.amount / total) * 100)}%</Text>
              </Text>
            </View>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${(r.amount / top) * 100}%` }]} />
            </View>
          </View>
        ))
      )}
    </View>
  );
}

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

// Each day shaded by how much was spent; the most expensive day is the darkest.
function SpendingCalendar({ month, dash }: { month: string; dash: CurrencyDashboard }) {
  const values = dash.daily.map(Number);
  const peak = Math.max(...values, 0);
  const peakDay = peak > 0 ? values.indexOf(peak) + 1 : null;
  const monthName = monthLabel(month).split(' ')[0].toLowerCase();
  return (
    <View style={[styles.card, styles.half]}>
      <Text style={styles.cardTitle}>CALENDÁRIO DE GASTOS</Text>
      <View style={styles.week}>
        {WEEKDAYS.map((d, i) => (
          <Text key={i} style={styles.weekday}>
            {d}
          </Text>
        ))}
      </View>
      {calendarWeeks(month).map((week, wi) => (
        <View key={wi} style={styles.week}>
          {week.map((d, di) => {
            if (d === null) return <View key={di} style={styles.dayBlank} />;
            const v = values[d - 1] ?? 0;
            // Square root so a single big bill does not wash out every other day.
            const level = peak > 0 && v > 0 ? 0.12 + 0.88 * Math.sqrt(v / peak) : 0;
            return (
              <View
                key={di}
                style={[
                  styles.day,
                  level > 0 && {
                    backgroundColor: `rgba(43,40,64,${level.toFixed(2)})`,
                    borderColor: 'transparent',
                  },
                ]}
                accessibilityLabel={
                  v > 0 ? `${d}: ${money(String(v), dash.currency)}` : `${d}: sem gastos`
                }
              >
                <Text
                  style={[
                    styles.dayText,
                    level > 0 && styles.dayTextSpent,
                    level > 0.45 && styles.dayTextOn,
                  ]}
                >
                  {d}
                </Text>
              </View>
            );
          })}
        </View>
      ))}
      <Text style={styles.legend}>
        {peakDay
          ? `Dia mais caro: ${peakDay} de ${monthName}, ${money(String(peak), dash.currency)}.`
          : 'Nenhum gasto neste mês.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.page },
  content: { paddingHorizontal: PAD, paddingTop: 28, paddingBottom: 48 },
  column: { width: '100%', maxWidth: PAGE_MAX - PAD * 2, gap: 16 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  chips: { flexDirection: 'row', gap: 6 },
  loading: { marginVertical: 32 },
  muted: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: colors.muted },
  hint: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted, marginTop: -6 },
  emptyBox: { gap: 12, marginTop: 8, maxWidth: 480 },
  emptyTitle: { fontFamily: fonts.semibold, fontSize: 22, color: colors.ink },
  emptyButton: { alignSelf: 'flex-start' },
  figures: { flexDirection: 'row', borderWidth: 1, borderColor: colors.line, borderRadius: 14 },
  figure: { flex: 1, paddingVertical: 16, paddingHorizontal: 18, gap: 4 },
  figureWide: { flex: 1.25 },
  divider: { borderLeftWidth: 1, borderLeftColor: colors.line },
  figureLabel: { fontFamily: fonts.medium, fontSize: 11, letterSpacing: 0.7, color: colors.muted },
  figureValue: { fontFamily: fonts.regular, fontSize: 28, color: colors.ink },
  figureSub: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted },
  pending: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: colors.pendingSoft,
  },
  pendingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.pending },
  pendingText: { flex: 1, fontFamily: fonts.regular, fontSize: 14, color: colors.ink },
  pendingLink: { fontFamily: fonts.medium, fontSize: 14, color: colors.pendingText },
  card: { borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 18, gap: 8 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 0.7, color: colors.muted },
  cardSub: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
  legend: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted, marginTop: 4 },
  pair: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
  stack: { flexDirection: 'column', alignItems: 'stretch' },
  half: { flex: 1, minWidth: 0 },
  share: { paddingVertical: 6, gap: 6 },
  shareLine: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  shareName: { flex: 1, fontFamily: fonts.regular, fontSize: 14, color: colors.ink },
  shareValue: { fontFamily: fonts.regular, fontSize: 14, color: colors.ink },
  sharePct: { color: colors.muted },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.soft, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2, backgroundColor: colors.ink },
  week: { flexDirection: 'row', gap: 4, marginBottom: 4 },
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.muted,
  },
  day: {
    flex: 1,
    height: 34,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 5,
    paddingTop: 3,
  },
  dayBlank: { flex: 1, height: 34 },
  dayText: { fontFamily: fonts.regular, fontSize: 11, color: colors.muted },
  dayTextSpent: { color: colors.ink },
  dayTextOn: { color: colors.page },
});
