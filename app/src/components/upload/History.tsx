import { Pressable, Text, View } from 'react-native';

import { SectionTitle, ui } from '@/components/ui';
import type { ImportSummary } from '@/lib/types';
import { historyLine, undoNote } from '@/lib/upload';
import { useUndoImport } from '@/lib/useUndoImport';

import { styles } from './styles';

// Envios anteriores: each sent statement can be read again (after a reader fix, say)
// or taken back with every line that came from it.
export function History({
  items,
  onReread,
}: {
  items: ImportSummary[];
  onReread: (h: ImportSummary) => void;
}) {
  const undo = useUndoImport();
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
              {undo.asking === h.id ? (
                <View style={styles.undoBox}>
                  <Text style={styles.undoText}>{undoNote(h)}</Text>
                  <View style={styles.links}>
                    <LinkButton label="Manter" onPress={undo.close} disabled={undo.busy} />
                    <LinkButton
                      label={undo.busy ? 'Desfazendo…' : 'Desfazer envio'}
                      danger
                      onPress={() => void undo.undo(h)}
                      disabled={undo.busy}
                    />
                  </View>
                  {undo.error ? <Text style={styles.undoError}>{undo.error}</Text> : null}
                </View>
              ) : (
                <View style={styles.links}>
                  <LinkButton label="Reler o arquivo" onPress={() => onReread(h)} />
                  <LinkButton label="Desfazer" onPress={() => undo.ask(h.id)} />
                </View>
              )}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function LinkButton({
  label,
  onPress,
  danger,
  disabled,
}: {
  label: string;
  onPress: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" hitSlop={6}>
      <Text style={[styles.link, danger && styles.linkDanger, disabled && styles.faded]}>
        {label}
      </Text>
    </Pressable>
  );
}
