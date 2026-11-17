import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Swatches } from '@/components/categories/Swatches';
import { DeleteConfirm, Field, Input } from '@/components/transactions/TxEditForm';
import { Button } from '@/components/ui';
import { errorText } from '@/lib/api';
import {
  accountCount,
  addMember,
  deleteMember,
  deleteMemberHint,
  editMember,
  memberNameError,
} from '@/lib/people';
import type { Account, Member } from '@/lib/types';

import { styles } from './styles';

// The people who own accounts: add, rename, recolour, remove. The person who signs in
// can't be removed.
export function People({
  members,
  accounts,
  onChanged,
}: {
  members: Member[];
  accounts: Account[];
  onChanged: () => Promise<void> | void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  return (
    <View style={styles.section}>
      <Text style={styles.label}>PESSOAS</Text>
      <View style={styles.list}>
        {members.map((m, i) =>
          m.id === editingId ? (
            <EditPerson
              key={m.id}
              member={m}
              members={members}
              accounts={accounts}
              first={i === 0}
              onChanged={onChanged}
              onClose={() => setEditingId(null)}
            />
          ) : (
            <View key={m.id} style={[styles.row, i === 0 && styles.rowFirst]}>
              <View style={[styles.dot, { backgroundColor: m.color }]} />
              <View style={styles.main}>
                <Text style={styles.name} numberOfLines={1}>
                  {m.name}
                  {m.user_id ? ' (você)' : ''}
                </Text>
                <Text style={styles.sub}>{accountCount(m.id, accounts)}</Text>
              </View>
              <Pressable
                onPress={() => setEditingId(m.id)}
                accessibilityRole="button"
                accessibilityLabel={`Editar ${m.name}`}
                hitSlop={6}
              >
                <Text style={styles.link}>Editar</Text>
              </Pressable>
            </View>
          ),
        )}
      </View>
      <AddPerson members={members} onChanged={onChanged} />
    </View>
  );
}

function AddPerson({
  members,
  onChanged,
}: {
  members: Member[];
  onChanged: () => Promise<void> | void;
}) {
  const [name, setName] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const problem = tried ? memberNameError(name, members) : null;

  const add = async () => {
    setTried(true);
    if (memberNameError(name, members)) return;
    setBusy(true);
    setError(null);
    try {
      await addMember(name);
      await onChanged();
      setName('');
      setTried(false);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <View style={styles.add}>
        <View style={styles.addInput}>
          <Input
            value={name}
            onChange={setName}
            label="Nome da pessoa"
            placeholder="Nome de quem divide as contas"
            invalid={Boolean(problem)}
            maxLength={80}
          />
        </View>
        <Button label="Adicionar" onPress={add} busy={busy} style={styles.addButton} />
      </View>
      {problem || error ? <Text style={styles.error}>{problem ?? error}</Text> : null}
    </View>
  );
}

function EditPerson({
  member: m,
  members,
  accounts,
  first,
  onChanged,
  onClose,
}: {
  member: Member;
  members: Member[];
  accounts: Account[];
  first: boolean;
  onChanged: () => Promise<void> | void;
  onClose: () => void;
}) {
  const [name, setName] = useState(m.name);
  const [color, setColor] = useState(m.color);
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const problem = memberNameError(name, members, m.id);

  const run = async (what: 'save' | 'delete', job: () => Promise<unknown>) => {
    setBusy(what);
    setError(null);
    try {
      await job();
      await onChanged();
      onClose();
    } catch (e) {
      setError(errorText(e));
      setBusy(null);
    }
  };

  const save = () => {
    if (problem) return;
    const patch: { name?: string; color?: string } = {};
    if (name.trim() !== m.name) patch.name = name.trim();
    if (color.toLowerCase() !== m.color.toLowerCase()) patch.color = color;
    if (!patch.name && !patch.color) return onClose();
    return run('save', () => editMember(m.id, patch));
  };

  return (
    <View style={[styles.editing, first && styles.rowFirst]}>
      <Field label="Nome" error={problem ?? undefined}>
        <Input
          value={name}
          onChange={setName}
          label="Nome do responsável"
          invalid={Boolean(problem)}
          maxLength={80}
        />
      </Field>
      <Field label="Cor">
        <Swatches value={color} onChange={setColor} />
      </Field>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {confirming ? (
        <DeleteConfirm
          title={`Excluir “${m.name}”?`}
          hint={deleteMemberHint(m.id, accounts)}
          busy={busy === 'delete'}
          error={null}
          onConfirm={() => run('delete', () => deleteMember(m.id))}
          onCancel={() => setConfirming(false)}
        />
      ) : (
        <>
          <View style={styles.actions}>
            <Button
              label="Cancelar"
              onPress={onClose}
              disabled={busy !== null}
              style={styles.action}
            />
            <Button
              primary
              label="Salvar"
              onPress={save}
              busy={busy === 'save'}
              disabled={Boolean(problem)}
              style={styles.action}
            />
          </View>
          {m.user_id ? null : (
            <Pressable
              onPress={() => setConfirming(true)}
              accessibilityRole="button"
              style={styles.remove}
            >
              <Text style={styles.removeText}>Excluir pessoa</Text>
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}
