import { ActivityIndicator, Text, View } from 'react-native';

import { styles as page } from '@/components/connections/styles';
import { DotSelect } from '@/components/DotSelect';
import { ConfirmDelete, Small, confirmStyles as styles } from '@/components/settings/ConfirmDelete';
import { errorText } from '@/lib/api';
import { bankPurgeButton, bankPurgeLines } from '@/lib/purge';
import { plural } from '@/lib/upload';
import { useDeleteBank } from '@/lib/useDeleteBank';
import { colors } from '@/theme';

// Ajustes: take one bank's lines out (to send its statements again, say) and keep
// everything else. Same safety as "Apagar todas": the word APAGAR before the button works.
export function DeleteBankSetting() {
  const d = useDeleteBank();
  return (
    <View style={page.card}>
      <Text style={page.bank}>Apagar as transações de um banco</Text>
      <Text style={page.status}>
        Tira só as transações das contas de um banco, de todos os meses. Os outros bancos ficam como
        estão.
      </Text>
      {d.removed ? (
        <Text style={styles.done}>
          {plural(
            d.removed.count,
            `Pronto: 1 transação do ${d.removed.bank} apagada.`,
            (n) => `Pronto: ${n} transações do ${d.removed?.bank} apagadas.`,
          )}
        </Text>
      ) : null}
      {d.open ? <Choose d={d} /> : <Small label="Escolher o banco…" onPress={d.start} />}
    </View>
  );
}

function Choose({ d }: { d: ReturnType<typeof useDeleteBank> }) {
  const banks = d.banks.data;
  if (d.banks.isError) {
    return (
      <View style={styles.box}>
        <Text style={page.error}>{errorText(d.banks.error)}</Text>
        <View style={styles.actions}>
          <Small label="Fechar" onPress={d.close} />
          <Small label="Tentar de novo" onPress={() => void d.banks.refetch()} />
        </View>
      </View>
    );
  }
  if (!banks) return <ActivityIndicator style={styles.box} color={colors.ink} />;
  if (banks.length === 0) {
    return (
      <View style={styles.box}>
        <Text style={styles.text}>Não há transações para apagar.</Text>
        <View style={styles.actions}>
          <Small label="Fechar" onPress={d.close} />
        </View>
      </View>
    );
  }
  const options = banks.map((b) => ({
    id: b.bank,
    name: `${b.bank} · ${plural(b.transactions, '1 transação', (n) => `${n} transações`)}`,
    color: null,
  }));
  return (
    <View style={styles.box}>
      <DotSelect
        value={d.bank}
        options={options}
        onChange={d.choose}
        label="Banco"
        placeholder="Escolha o banco"
        empty="Nenhum banco com transações."
        disabled={d.busy}
      />
      {d.chosen ? (
        <ConfirmDelete
          lines={bankPurgeLines(d.chosen)}
          button={bankPurgeButton(d.chosen)}
          typed={d.typed}
          setTyped={d.setTyped}
          ready={d.ready}
          busy={d.busy}
          error={d.error}
          onCancel={d.close}
          onSubmit={() => void d.submit()}
        />
      ) : (
        <View style={styles.actions}>
          <Small label="Cancelar" onPress={d.close} />
        </View>
      )}
    </View>
  );
}
