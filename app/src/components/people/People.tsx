import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Swatches } from '@/components/categories/Swatches';
import { DeleteConfirm, Field, Input } from '@/components/transactions/TxEditForm';
import { Button } from '@/components/ui';
import { errorText } from '@/lib/api';
import { Segment } from '@/components/nav';
import {
  addMember,
  deleteMember,
  deleteMemberHint,
  editMember,
  freeMemberColor,
  MEMBER_KINDS,
  memberNameError,
  memberPatch,
  memberSub,
  type NewMember,
} from '@/lib/people';
import type { Account, Member } from '@/lib/types';

import { styles } from './styles';

// The people who own accounts: add, rename, say who they are, recolour, remove. The
// person who signs in can't be removed.
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
  const [adding, setAdding] = useState(false);
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
                <Text style={styles.sub}>{memberSub(m, accounts)}</Text>
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
      {adding ? (
        <View style={styles.list}>
          <AddPerson members={members} onChanged={onChanged} onClose={() => setAdding(false)} />
        </View>
      ) : (
        <Pressable
          onPress={() => setAdding(true)}
          testID="add-person"
          accessibilityRole="button"
          style={styles.addLink}
        >
          <Text style={styles.link}>+ Adicionar pessoa</Text>
        </Pressable>
      )}
    </View>
  );
}

// Name, who they are and colour: the same fields to add a person and to edit one.
function PersonFields({
  value,
  onChange,
  problem,
  nameLabel,
}: {
  value: NewMember;
  onChange: (v: NewMember) => void;
  problem: string | null;
  nameLabel: string;
}) {
  return (
    <>
      <Field label="Nome" error={problem ?? undefined}>
        <Input
          value={value.name}
          onChange={(name) => onChange({ ...value, name })}
          label={nameLabel}
          placeholder="Nome de quem divide as contas"
          invalid={Boolean(problem)}
          maxLength={80}
        />
      </Field>
      <Field label="Quem é">
        <Segment
          options={MEMBER_KINDS}
          value={value.kind}
          onChange={(kind) => onChange({ ...value, kind })}
          testPrefix="who"
        />
      </Field>
      <Field label="Cor">
        <Swatches value={value.color} onChange={(color) => onChange({ ...value, color })} />
      </Field>
    </>
  );
}

function AddPerson({
  members,
  onChanged,
  onClose,
}: {
  members: Member[];
  onChanged: () => Promise<void> | void;
  onClose: () => void;
}) {
  const [person, setPerson] = useState<NewMember>(() => ({
    name: '',
    kind: 'other',
    color: freeMemberColor(members),
  }));
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const problem = tried ? memberNameError(person.name, members) : null;

  const add = async () => {
    setTried(true);
    if (memberNameError(person.name, members)) return;
    setBusy(true);
    setError(null);
    try {
      await addMember(person);
      await onChanged();
      onClose();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  return (
    <View style={[styles.editing, styles.rowFirst]}>
      <PersonFields
        value={person}
        onChange={setPerson}
        problem={problem}
        nameLabel="Nome da pessoa"
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.actions}>
        <Button label="Cancelar" onPress={onClose} disabled={busy} style={styles.action} />
        <Button primary label="Adicionar" onPress={add} busy={busy} style={styles.action} />
      </View>
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
  const [person, setPerson] = useState<NewMember>({ name: m.name, kind: m.kind, color: m.color });
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const problem = memberNameError(person.name, members, m.id);

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
    const patch = memberPatch(m, person);
    if (!patch) return onClose();
    return run('save', () => editMember(m.id, patch));
  };

  return (
    <View style={[styles.editing, first && styles.rowFirst]}>
      <PersonFields
        value={person}
        onChange={setPerson}
        problem={problem}
        nameLabel="Nome do responsável"
      />
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
