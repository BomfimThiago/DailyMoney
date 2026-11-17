import { useState } from 'react';
import { Text, View } from 'react-native';

import { DotSelect, type DotOption } from '@/components/DotSelect';
import { errorText } from '@/lib/api';
import { accountDetails } from '@/lib/connections';
import { HOUSEHOLD, setAccountOwner } from '@/lib/people';
import type { Account, Member } from '@/lib/types';

import { styles } from './styles';

// The household has no member id; the dropdown needs one.
const HOUSEHOLD_ID = 'casa';

// Each account and who it belongs to. Changing it also moves the account's lines.
export function AccountOwners({
  accounts,
  members,
  narrow,
  onChanged,
}: {
  accounts: Account[];
  members: Member[];
  narrow: boolean;
  onChanged: () => Promise<void> | void;
}) {
  const options: DotOption[] = [
    ...members.map((m) => ({ id: m.id, name: m.name, color: m.color })),
    { id: HOUSEHOLD_ID, name: HOUSEHOLD, color: null },
  ];
  return (
    <View style={styles.section}>
      <Text style={styles.label}>CONTAS</Text>
      <Text style={styles.note}>
        Quem é o responsável por cada conta. As transações da conta ficam com a mesma pessoa; “
        {HOUSEHOLD}” é a conta da família toda.
      </Text>
      {accounts.length === 0 ? (
        <Text style={styles.note}>
          Nenhuma conta ainda. Elas aparecem aqui depois do primeiro extrato ou da primeira conexão.
        </Text>
      ) : (
        <View style={styles.list}>
          {accounts.map((a, i) => (
            <AccountRow
              key={a.id}
              account={a}
              options={options}
              first={i === 0}
              narrow={narrow}
              onChanged={onChanged}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function AccountRow({
  account,
  options,
  first,
  narrow,
  onChanged,
}: {
  account: Account;
  options: DotOption[];
  first: boolean;
  narrow: boolean;
  onChanged: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (id: string) => {
    const memberId = id === HOUSEHOLD_ID ? null : id;
    if (memberId === account.member_id) return;
    setBusy(true);
    setError(null);
    try {
      await setAccountOwner(account.id, memberId);
      await onChanged();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.row, first && styles.rowFirst, styles.accountRow]}>
      <View style={styles.main}>
        <Text style={styles.name} numberOfLines={1}>
          {account.name}
        </Text>
        <Text style={styles.sub}>{accountDetails(account)}</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
      <View style={narrow ? styles.ownerNarrow : styles.owner}>
        <DotSelect
          value={account.member_id ?? HOUSEHOLD_ID}
          options={options}
          onChange={pick}
          label={`Responsável por ${account.name}`}
          placeholder="Escolher"
          empty="Ninguém ainda."
          disabled={busy}
        />
      </View>
    </View>
  );
}
