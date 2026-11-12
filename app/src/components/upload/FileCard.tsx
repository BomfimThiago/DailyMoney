import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { Card, ui } from '@/components/ui';
import { initials } from '@/lib/format';
import type { GroupCounts, ImportPreview } from '@/lib/types';
import { fileDetails, fileNotes, plural } from '@/lib/upload';
import { colors } from '@/theme';

import { styles } from './styles';

export function FileCard({
  preview,
  count,
  refreshing,
}: {
  preview: ImportPreview;
  count: GroupCounts;
  refreshing: boolean;
}) {
  const notes = fileNotes(preview, count);
  return (
    <Card style={styles.gap}>
      <View style={styles.fileHead}>
        <View style={styles.bankIcon}>
          <Text style={styles.bankIconText}>{initials(preview.bank ?? preview.filename)}</Text>
        </View>
        <View style={ui.rowMain}>
          <Text style={styles.fileName} numberOfLines={1}>
            {preview.filename}
          </Text>
          <Text style={ui.rowSub}>{fileDetails(preview)}</Text>
        </View>
        {refreshing ? (
          <ActivityIndicator size="small" color={colors.muted} />
        ) : (
          <Text style={styles.ok}>Lido</Text>
        )}
      </View>

      <View style={styles.stats}>
        <Stat value={count.new} label={count.new === 1 ? 'nova' : 'novas'} positive />
        <Stat value={count.duplicate} label="já existiam" />
      </View>

      {notes ? <Text style={styles.note}>{notes}</Text> : null}
      <UnreadLines errors={preview.errors} />
    </Card>
  );
}

function Stat({ value, label, positive }: { value: number; label: string; positive?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, positive && value > 0 && ui.income]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function UnreadLines({ errors }: { errors: ImportPreview['errors'] }) {
  const [open, setOpen] = useState(false);
  if (!errors.length) return null;
  const count = plural(errors.length, '1 linha não foi lida', (n) => `${n} linhas não foram lidas`);
  return (
    <View style={styles.errorsBox}>
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button">
        <Text style={styles.warn}>
          {count}
          {open ? ' · esconder' : ' · ver quais'}
        </Text>
      </Pressable>
      {open
        ? errors.slice(0, 50).map((e) => (
            <Text key={e.row} style={styles.errorLine}>
              Linha {e.row}: {e.message}
            </Text>
          ))
        : null}
    </View>
  );
}
