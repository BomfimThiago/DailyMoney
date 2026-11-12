import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { SectionTitle, ui } from '@/components/ui';
import { isIncome, money, shortDate } from '@/lib/format';
import type { PreviewRow } from '@/lib/types';

import { styles } from './styles';

const ROWS_SHOWN = 25;

const TAGS: Record<Exclude<PreviewRow['status'], 'new'>, string> = {
  duplicate: 'já existe',
  skipped: 'fora do período',
};

const KIND_LABELS: Record<Exclude<PreviewRow['kind'], 'regular'>, string> = {
  investment: 'Investimento',
  transfer: 'Entre suas contas',
  pending: 'Transferência a confirmar',
};

export function rowLabel(r: PreviewRow): string {
  if (r.status !== 'new') return TAGS[r.status];
  return r.kind === 'regular' ? (r.category ?? 'Outros') : KIND_LABELS[r.kind];
}

export function PreviewRows({ rows }: { rows: PreviewRow[] }) {
  const [all, setAll] = useState(false);
  if (!rows.length) return null;
  const shown = all ? rows : rows.slice(0, ROWS_SHOWN);
  const hidden = rows.length - ROWS_SHOWN;
  return (
    <View>
      <SectionTitle>Prévia</SectionTitle>
      <View style={ui.rowList}>
        {shown.map((r, i) => (
          <PreviewLine key={r.index} row={r} first={i === 0} />
        ))}
        {hidden > 0 ? (
          <Pressable onPress={() => setAll(!all)} style={styles.more} accessibilityRole="button">
            <Text style={styles.moreText}>{all ? 'Mostrar menos' : `+ ${hidden} transações`}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function PreviewLine({ row: r, first }: { row: PreviewRow; first: boolean }) {
  const isNew = r.status === 'new';
  const regular = r.kind === 'regular';
  return (
    <View style={[ui.row, first && ui.rowFirst, !isNew && styles.faded]}>
      <Text style={ui.rowDate}>{shortDate(r.date)}</Text>
      <View style={ui.rowMain}>
        <Text style={ui.rowTitle} numberOfLines={2}>
          {r.description}
        </Text>
        {isNew ? (
          <Text style={ui.rowSub}>{rowLabel(r)}</Text>
        ) : (
          <View style={styles.tagLine}>
            <Text style={styles.tag}>{rowLabel(r)}</Text>
          </View>
        )}
      </View>
      <Text
        style={[
          ui.rowAmount,
          regular && isIncome(r.amount) && ui.income,
          !regular && styles.neutral,
          !isNew && styles.struck,
        ]}
      >
        {money(r.amount, r.currency, true)}
      </Text>
    </View>
  );
}
