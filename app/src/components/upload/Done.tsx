import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { Button, Card, SectionTitle, ui } from '@/components/ui';
import type { ImportSummary } from '@/lib/types';
import { doneNote, doneTitle, historyLine } from '@/lib/upload';

import { styles } from './styles';

export function Done({ summary, onAgain }: { summary: ImportSummary; onAgain: () => void }) {
  return (
    <Card style={styles.gap}>
      <Text style={styles.cardTitle}>{doneTitle(summary)}</Text>
      <Text style={styles.note}>{doneNote(summary)}</Text>
      <View style={styles.actions}>
        <Button label="Enviar outro" onPress={onAgain} style={styles.flex1} />
        <Button
          primary
          label="Ver no início"
          onPress={() => router.navigate('/')}
          style={styles.flex1}
        />
      </View>
    </Card>
  );
}

export function History({ items }: { items: ImportSummary[] }) {
  if (!items.length) return null;
  return (
    <View style={styles.history}>
      <SectionTitle>Envios anteriores</SectionTitle>
      <View style={ui.rowList}>
        {items.slice(0, 10).map((h, i) => (
          <View key={h.id} style={[ui.row, i === 0 && ui.rowFirst]}>
            <View style={ui.rowMain}>
              <Text style={ui.rowTitle} numberOfLines={1}>
                {h.filename}
              </Text>
              <Text style={ui.rowSub}>{historyLine(h)}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}
