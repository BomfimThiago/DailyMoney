import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { Loadable } from '@/components/states';
import { Button, ui } from '@/components/ui';
import { accountDetails } from '@/lib/connections';
import { useAccounts } from '@/lib/queries';
import type { Account } from '@/lib/types';

import { styles } from './styles';

// Every account the app follows, and whether it arrives by itself or by statement.
export function Accounts({ automatic }: { automatic: Map<string, string> }) {
  const accounts = useAccounts(true);
  return (
    <Loadable
      isError={accounts.isError}
      loading={!accounts.data}
      value={accounts.data}
      empty=""
      error="Não consegui carregar as contas."
      textStyle={styles.muted}
    >
      {(list) =>
        list.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.muted}>
              Nenhuma conta ainda. Ela aparece aqui depois do primeiro extrato ou da primeira
              conexão.
            </Text>
            <Button primary label="Enviar extrato" onPress={() => router.navigate('/upload')} />
          </View>
        ) : (
          <View style={ui.rowList}>
            {list.map((a, i) => (
              <AccountRow key={a.id} account={a} first={i === 0} automatic={automatic.has(a.id)} />
            ))}
          </View>
        )
      }
    </Loadable>
  );
}

function AccountRow({
  account,
  first,
  automatic,
}: {
  account: Account;
  first: boolean;
  automatic: boolean;
}) {
  return (
    <View style={[ui.row, first && ui.rowFirst, styles.line]}>
      <View style={ui.rowMain}>
        <Text style={ui.rowTitle} numberOfLines={1}>
          {account.name}
        </Text>
        <Text style={ui.rowSub}>{accountDetails(account)}</Text>
      </View>
      {automatic ? (
        <Text style={styles.auto}>Automática</Text>
      ) : (
        <Text style={styles.via}>Por extrato</Text>
      )}
    </View>
  );
}
