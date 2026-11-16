import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { DeleteConfirm, Field, Input } from '@/components/transactions/TxEditForm';
import { Button } from '@/components/ui';
import { errorText } from '@/lib/api';
import { countText, deleteHint, KINDS, merchantLabel, nameError } from '@/lib/categories';
import { deleteCategory, deleteCategoryRule, editCategory } from '@/lib/imports';
import { useCategoryRules } from '@/lib/queries';
import type { Category } from '@/lib/types';

import { styles } from './styles';
import { Swatches } from './Swatches';

// One category: rename, colour, the merchants the app learned for it, and delete.
// Mount with key={category.id} so a new selection starts clean.
export function CategoryDetail({
  category: c,
  all,
  onChanged,
  onDeleted,
}: {
  category: Category;
  all: Category[];
  onChanged: () => Promise<void> | void;
  onDeleted: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(c.name);
  const [color, setColor] = useState(c.color);
  const [busy, setBusy] = useState<'name' | 'color' | 'delete' | string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const problem = nameError(name, all, c.id);
  const kind = KINDS.find((k) => k.value === c.kind)?.label ?? '';

  const run = async (what: string, job: () => Promise<unknown>) => {
    setBusy(what);
    setError(null);
    try {
      await job();
      await onChanged();
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const saveName = async () => {
    if (problem) return;
    if (name.trim() === c.name) return setRenaming(false);
    if (await run('name', () => editCategory(c.id, { name: name.trim() }))) setRenaming(false);
  };

  const pickColor = async (next: string) => {
    if (next === color.toLowerCase()) return;
    const before = color;
    setColor(next);
    if (!(await run('color', () => editCategory(c.id, { color: next })))) setColor(before);
  };

  const remove = async () => {
    if (await run('delete', () => deleteCategory(c.id))) onDeleted();
  };

  return (
    <View style={styles.detail}>
      {renaming ? (
        <View style={styles.section}>
          <Field label="Nome" error={problem ?? undefined}>
            <Input
              value={name}
              onChange={setName}
              label="Nome da categoria"
              invalid={Boolean(problem)}
              maxLength={60}
            />
          </Field>
          <View style={styles.actions}>
            <Button
              label="Cancelar"
              onPress={() => {
                setName(c.name);
                setRenaming(false);
              }}
              disabled={busy === 'name'}
              style={styles.action}
            />
            <Button
              primary
              label="Salvar"
              onPress={saveName}
              busy={busy === 'name'}
              disabled={Boolean(problem)}
              style={styles.action}
            />
          </View>
        </View>
      ) : (
        <View>
          <View style={styles.head}>
            <View style={[styles.headDot, { backgroundColor: color }]} />
            <Text style={styles.name} numberOfLines={2}>
              {c.name}
            </Text>
            <Pressable
              onPress={() => setRenaming(true)}
              testID="rename-category"
              accessibilityRole="button"
            >
              <Text style={styles.link}>Renomear</Text>
            </Pressable>
          </View>
          <Text style={styles.sub}>
            {kind} · {countText(c)}
            {c.is_default ? ' · Padrão' : ''}
          </Text>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.label}>COR</Text>
        <Swatches value={color} onChange={pickColor} />
      </View>

      <Learned category={c} onChanged={onChanged} />

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.divider} />
      {confirming ? (
        <DeleteConfirm
          title={`Excluir “${c.name}”?`}
          hint={deleteHint(c)}
          busy={busy === 'delete'}
          error={null}
          onConfirm={remove}
          onCancel={() => setConfirming(false)}
        />
      ) : (
        <Pressable
          onPress={() => setConfirming(true)}
          testID="delete-category"
          accessibilityRole="button"
          style={styles.remove}
        >
          <Text style={styles.removeText}>Excluir categoria</Text>
        </Pressable>
      )}
    </View>
  );
}

// Merchants the app sends here on its own, learned when the person changed a line.
function Learned({
  category,
  onChanged,
}: {
  category: Category;
  onChanged: () => Promise<void> | void;
}) {
  const rules = useCategoryRules(category.id);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const forget = async (id: string) => {
    setBusy(id);
    setError(null);
    try {
      await deleteCategoryRule(id);
      await onChanged();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const list = rules.data ?? [];
  return (
    <View style={styles.section}>
      <Text style={styles.label}>ESTABELECIMENTOS APRENDIDOS</Text>
      {rules.isError ? (
        <Text style={styles.error}>Não consegui carregar. Tente de novo.</Text>
      ) : list.length === 0 ? (
        <Text style={styles.note}>
          {rules.isLoading
            ? 'Carregando…'
            : 'Nenhum ainda. Quando você troca a categoria de uma transação, as próximas do mesmo estabelecimento vêm para cá.'}
        </Text>
      ) : (
        <View>
          {list.map((r, i) => (
            <View key={r.id} style={[styles.rule, i === 0 && styles.ruleFirst]}>
              <Text style={styles.ruleName} numberOfLines={1}>
                {merchantLabel(r.merchant)}
              </Text>
              <Pressable
                onPress={() => forget(r.id)}
                disabled={busy !== null}
                accessibilityRole="button"
                accessibilityLabel={`Esquecer ${r.merchant}`}
              >
                <Text style={styles.forget}>{busy === r.id ? 'Esquecendo…' : 'Esquecer'}</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}
