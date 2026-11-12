import { Text, TextInput, View } from 'react-native';

import { Chip, SectionTitle } from '@/components/ui';
import { fullDate } from '@/lib/format';
import type { Account, ImportPreview, PreviewGroup } from '@/lib/types';
import { sinceOptions, type Choice } from '@/lib/upload';
import { colors } from '@/theme';

import { styles } from './styles';

export function AccountPicker({
  group,
  many,
  accounts,
  choice,
  onSelect,
  onRename,
}: {
  group: PreviewGroup;
  many: boolean;
  accounts: Account[];
  choice: Choice | undefined;
  onSelect: (c: Choice) => void;
  onRename: (name: string) => void;
}) {
  const isNew = choice?.kind === 'new';
  const chosenId = choice?.kind === 'existing' ? choice.id : null;
  return (
    <View>
      <SectionTitle>{many ? `Conta das transações em ${group.currency}` : 'Conta'}</SectionTitle>
      <View style={styles.chips}>
        {accounts.map((a) => (
          <Chip
            key={a.id}
            label={a.name}
            selected={chosenId === a.id}
            onPress={() => onSelect({ kind: 'existing', id: a.id })}
          />
        ))}
        <Chip
          label={accounts.length ? 'Nova conta' : 'Criar conta'}
          selected={isNew}
          onPress={() => {
            if (!isNew) onSelect({ kind: 'new', name: group.suggested_name });
          }}
        />
      </View>
      {isNew ? (
        <TextInput
          value={choice.name}
          onChangeText={onRename}
          placeholder="Nome da conta"
          placeholderTextColor={colors.muted}
          maxLength={80}
          style={styles.input}
          accessibilityLabel={`Nome da nova conta em ${group.currency}`}
        />
      ) : null}
    </View>
  );
}

export function SincePicker({
  preview,
  since,
  onSelect,
}: {
  preview: ImportPreview;
  since: string | null;
  onSelect: (value: string | null) => void;
}) {
  const options = sinceOptions(preview);
  if (!options.length) return null;
  return (
    <View>
      <SectionTitle>Importar a partir de</SectionTitle>
      <View style={styles.chips}>
        {options.map((o) => (
          <Chip
            key={o.label}
            label={o.label}
            selected={since === o.value}
            onPress={() => onSelect(o.value)}
          />
        ))}
      </View>
      {since ? (
        <Text style={[styles.note, styles.gapSmall]}>
          Primeira vez nesta conta: só entra o que é de {fullDate(since)} em diante.
        </Text>
      ) : null}
    </View>
  );
}
