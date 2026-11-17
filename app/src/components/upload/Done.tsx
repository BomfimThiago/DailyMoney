import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { Button, Card } from '@/components/ui';
import type { ImportSummary } from '@/lib/types';
import { doneNote, doneTitle } from '@/lib/upload';

import { styles } from './styles';

export function Done({ summary, onAgain }: { summary: ImportSummary; onAgain: () => void }) {
  return (
    <Card style={styles.gap}>
      <Text style={styles.cardTitle}>{doneTitle(summary)}</Text>
      <Text style={styles.note}>{doneNote(summary)}</Text>
      <View style={styles.actions}>
        <Button label="Enviar outro" onPress={onAgain} style={styles.flex1} />
        {summary.to_review > 0 ? (
          <Button
            primary
            label="Revisar agora"
            onPress={() => router.navigate({ pathname: '/transacoes', params: { aba: 'revisar' } })}
            style={styles.flex1}
          />
        ) : (
          <Button
            primary
            label="Ver no início"
            onPress={() => router.navigate('/')}
            style={styles.flex1}
          />
        )}
      </View>
    </Card>
  );
}
