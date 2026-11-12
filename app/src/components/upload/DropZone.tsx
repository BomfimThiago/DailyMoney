import { type ComponentRef, type RefObject, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';

import type { PickedFile } from '@/lib/imports';
import { colors } from '@/theme';

import { styles } from './styles';

type Target = ComponentRef<typeof Pressable>;

export function droppedFile(e: Pick<DragEvent, 'dataTransfer'>): PickedFile | null {
  const f = e.dataTransfer?.files?.[0];
  return f ? { name: f.name, uri: '', mimeType: f.type, file: f } : null;
}

// Drag and drop only exists on web; the Pressable renders as a div there.
function useFileDrop(ref: RefObject<Target | null>, onFile: (file: PickedFile) => void) {
  const [over, setOver] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'web' || !ref.current) return;
    const node = ref.current as unknown as HTMLElement;
    const enter = (e: DragEvent) => {
      e.preventDefault();
      setOver(true);
    };
    const leave = () => setOver(false);
    const drop = (e: DragEvent) => {
      e.preventDefault();
      setOver(false);
      const file = droppedFile(e);
      if (file) onFile(file);
    };
    node.addEventListener('dragover', enter);
    node.addEventListener('dragleave', leave);
    node.addEventListener('drop', drop);
    return () => {
      node.removeEventListener('dragover', enter);
      node.removeEventListener('dragleave', leave);
      node.removeEventListener('drop', drop);
    };
  }, [ref, onFile]);
  return over;
}

export function DropZone({
  onPick,
  onFile,
  reading,
}: {
  onPick: () => void;
  onFile: (file: PickedFile) => void;
  reading: boolean;
}) {
  const ref = useRef<Target>(null);
  const over = useFileDrop(ref, onFile);
  return (
    <Pressable
      ref={ref}
      onPress={onPick}
      disabled={reading}
      accessibilityRole="button"
      accessibilityLabel="Escolher arquivo do extrato"
      style={[styles.drop, over && styles.dropOver]}
    >
      {reading ? <Reading /> : <Invite />}
    </Pressable>
  );
}

function Reading() {
  return (
    <>
      <ActivityIndicator color={colors.ink} />
      <Text style={styles.dropTitle}>Lendo o arquivo…</Text>
    </>
  );
}

function Invite() {
  return (
    <>
      <View style={styles.dropIcon}>
        <Text style={styles.dropArrow}>↑</Text>
      </View>
      <Text style={styles.dropTitle}>
        {Platform.OS === 'web'
          ? 'Arraste o arquivo ou clique para escolher'
          : 'Toque para escolher o arquivo'}
      </Text>
      <Text style={styles.dropSub}>CSV, OFX, XLSX ou PDF</Text>
    </>
  );
}
