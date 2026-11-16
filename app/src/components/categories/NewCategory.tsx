import { useState } from 'react';
import { Text, View } from 'react-native';

import { Field, Input } from '@/components/transactions/TxEditForm';
import { Button, Chip } from '@/components/ui';
import { errorText } from '@/lib/api';
import { freeColor, KINDS, nameError, type CategoryKind } from '@/lib/categories';
import { createCategory } from '@/lib/imports';
import type { Category } from '@/lib/types';

import { styles } from './styles';
import { Swatches } from './Swatches';

// Nova categoria: name, kind and colour (like the old app, without icons).
export function NewCategory({
  all,
  kind: startKind,
  onCreated,
  onCancel,
}: {
  all: Category[];
  kind: CategoryKind;
  onCreated: (c: Category) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<CategoryKind>(startKind);
  const [color, setColor] = useState(() => freeColor(all, startKind));
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const problem = nameError(name, all);

  const save = async () => {
    setTried(true);
    if (problem) return;
    setSaving(true);
    setError(null);
    try {
      onCreated(await createCategory({ name: name.trim(), kind, color }));
    } catch (e) {
      setError(errorText(e));
      setSaving(false);
    }
  };

  return (
    <View style={styles.detail}>
      <Text style={styles.name}>Nova categoria</Text>
      <Field label="Nome" error={tried ? (problem ?? undefined) : undefined}>
        <Input
          value={name}
          onChange={setName}
          label="Nome da categoria"
          placeholder="ex.: Pets"
          invalid={tried && Boolean(problem)}
          maxLength={60}
        />
      </Field>
      <View style={styles.section}>
        <Text style={styles.label}>TIPO</Text>
        <View style={styles.chips} accessibilityRole="radiogroup">
          {KINDS.map((k) => (
            <Chip
              key={k.value}
              label={k.label}
              selected={k.value === kind}
              onPress={() => setKind(k.value)}
            />
          ))}
        </View>
      </View>
      <View style={styles.section}>
        <Text style={styles.label}>COR</Text>
        <Swatches value={color} onChange={setColor} />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.actions}>
        <Button label="Cancelar" onPress={onCancel} disabled={saving} style={styles.action} />
        <Button
          primary
          label="Criar categoria"
          onPress={save}
          busy={saving}
          style={styles.action}
        />
      </View>
    </View>
  );
}
